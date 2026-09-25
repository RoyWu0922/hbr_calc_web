// Reproducible backend smoke test. Run on the server:
//   node server/tests/smoke.mjs
// Creates one throwaway user, exercises auth + all sync tables + edge cases,
// then deletes the user and all its rows (self-cleaning; safe to re-run).
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB = path.join(__dirname, '..', 'data', 'hbr.db');
const B = process.env.HBR_BASE || 'http://127.0.0.1:8123';

const j = async (m, p, body, token, ip) => {
  const h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = 'Bearer ' + token;
  if (ip) h['X-Forwarded-For'] = ip;
  const r = await fetch(B + p, { method: m, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
  const t = await r.text(); let o = {}; try { o = JSON.parse(t); } catch {}
  return { ...o, status: r.status };
};

let pass = 0, fail = 0;
const chk = (n, c) => { if (c) pass++; else { fail++; console.log('  FAIL: ' + n); } };
const u = 'smoke_' + Date.now();
let uid = null;

try {
  // health
  const h = await j('GET', '/api/health');
  chk('health endpoint ok', h.status === 200 && h.db === true);
  chk('health status ok', h.status === 200);

  // auth (incl. Chinese username → base64 email path)
  const cn = '冒烟测试' + (Date.now() % 1000);
  const su = await j('POST', '/api/auth/signup', { username: cn, password: 'pw' }, null, '10.0.0.1');
  chk('signup returns data.token', !!su.data?.token);
  chk('signup preserves username', su.data?.user?.username === cn);
  uid = su.data.user.id;
  const tok = su.data.token;
  const si = await j('POST', '/api/auth/signin', { email: toEmailLocal(cn), password: 'pw' });
  chk('signin by email (non-ascii)', !!si.data?.token);
  chk('signin returns username', si.data?.user?.username === cn);

  // per-table sync round-trip
  const cases = [
    ['calc_history', 'uuid', { uuid: 's1', data: { k: 1 }, timestamp: 1, deleted: false }],
    ['planner_axles', 'uuid', { uuid: 's2', data: { p: 1 }, timestamp: 1, deleted: false }],
    ['white_stats', 'uuid', { uuid: 's3', data: { w: 1 }, timestamp: 1, deleted: false }],
  ];
  for (const [t, oc, row] of cases) {
    await j('POST', `/api/data/${t}?mode=upsert&onConflict=${oc}`, row, tok);
    const s = await j('GET', `/api/data/${t}?cols=*`, undefined, tok);
    chk(`${t} round-trip`, Array.isArray(s.data) && s.data.length === 1);
  }
  for (const t of ['custom_skills', 'medal_records']) {
    await j('POST', `/api/data/${t}?mode=upsert&onConflict=user_id`, { data: { a: 1 }, updated_at: 2 }, tok);
    const s = await j('GET', `/api/data/${t}?cols=*&single=1`, undefined, tok);
    chk(`${t} maybeSingle`, s.data?.updated_at === 2);
  }

  // folders existence check (regression: id column must be selectable)
  await j('POST', '/api/data/folders', { name: 'grp', type: 'calc', timestamp: 1, sort_order: 0 }, tok);
  const fq = 'filters=' + encodeURIComponent(JSON.stringify({ user_id: uid, name: 'grp', type: 'calc' }));
  const ex = await j('GET', `/api/data/folders?cols=id&${fq}&single=1`, undefined, tok);
  chk('folder exist-check returns id', ex.data?.id != null);

  // guide (anonymous read + create + rpc)
  const g = await j('GET', '/api/data/guide_entries?cols=*');
  chk('anon guide read', g.status === 200 && Array.isArray(g.data));
  const ge = await j('POST', '/api/data/guide_entries', { category: 'ex', period: 1, attribute: '火', turns: 1, team: [], author: cn }, tok);
  chk('create guide entry', !ge.error && ge.data?.id);
  const like = await j('POST', '/api/rpc/toggle_guide_like', { p_entry_id: ge.data.id }, tok);
  chk('toggle_guide_like', like.data === 1);

  // security: no-auth data request rejected
  const noauth = await j('GET', '/api/data/calc_history?cols=*');
  chk('no-auth -> 401', noauth.status === 401);
  // injection is neutralized
  const inj = await j('GET', '/api/data/folders?cols=*&filters=' + encodeURIComponent('{"type) OR 1=1 --":"x"}'), undefined, tok);
  chk('sql injection neutralized', inj.status === 200 && !inj.error);

  // isolation
  const u2 = await j('POST', '/api/auth/signup', { username: 'smoke2_' + Date.now(), password: 'pw' }, null, '10.0.0.2');
  const r2 = await j('GET', '/api/data/calc_history?cols=*', undefined, u2.data.token);
  chk('isolation: other user empty', Array.isArray(r2.data) && r2.data.length === 0);
  deleteUser(u2.data.user.id);
} catch (e) {
  console.log('ERROR:', e.message); fail++;
} finally {
  if (uid) deleteUser(uid);
  console.log(`\nRESULT: pass=${pass} fail=${fail}`);
  process.exit(fail ? 1 : 0);
}

function toEmailLocal(name) {
  const n = name.trim().toLowerCase();
  if (/^[a-z0-9._-]+$/.test(n)) return n + '@hbrcalc.dev';
  return Buffer.from(n, 'utf8').toString('base64').replace(/[+/=]/g, '_') + '@hbrcalc.dev';
}
function deleteUser(id) {
  const db = new DatabaseSync(DB);
  const tables = ['calc_history', 'planner_axles', 'white_stats', 'folders', 'custom_skills', 'medal_records', 'guide_entries', 'guide_comments', 'guide_likes'];
  for (const t of tables) db.prepare('DELETE FROM ' + t + ' WHERE user_id = ?').run(id);
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  db.close();
}
