import http from 'node:http';
import crypto from 'node:crypto';
import { db } from './db.js';
import { toEmail, hashPassword, verifyPassword, signToken, verifyToken } from './auth.js';

const PORT = Number(process.env.PORT || 8123);
const ADMIN_IDS = new Set((process.env.HBR_ADMIN_IDS || 'c97da159-b8c1-442a-bf02-97b9de28e1c4').split(',').map(s => s.trim()));

const TABLES = {
  calc_history: { cols: ['user_id', 'uuid', 'data', 'timestamp', 'deleted'], json: ['data'], bool: ['deleted'], scope: 'user' },
  planner_axles: { cols: ['user_id', 'uuid', 'data', 'timestamp', 'deleted'], json: ['data'], bool: ['deleted'], scope: 'user' },
  white_stats: { cols: ['user_id', 'uuid', 'data', 'timestamp', 'deleted'], json: ['data'], bool: ['deleted'], scope: 'user' },
  folders: { cols: ['user_id', 'name', 'type', 'timestamp', 'sort_order'], json: [], bool: [], scope: 'user' },
  custom_skills: { cols: ['user_id', 'data', 'updated_at'], json: ['data'], bool: [], scope: 'user' },
  medal_records: { cols: ['user_id', 'data', 'updated_at'], json: ['data'], bool: [], scope: 'user' },
  guide_entries: { cols: ['id', 'category', 'period', 'stage', 'attribute', 'weather', 'turns', 'team', 'author', 'video_url', 'image_url', 'notes', 'score', 'status', 'user_id', 'created_at', 'updated_at', 'deleted', 'like_count'], json: ['team'], bool: ['deleted', 'weather'], scope: 'guide' },
  guide_likes: { cols: ['entry_id', 'user_id', 'created_at'], json: [], bool: [], scope: 'like' },
  guide_comments: { cols: ['id', 'entry_id', 'user_id', 'author', 'content', 'created_at', 'deleted'], json: [], bool: ['deleted'], scope: 'comment' },
};

function send(res, code, obj) {
  const body = JSON.stringify(obj || {});
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(body);
}
const readBody = (req) => new Promise((resolve) => {
  let data = '';
  req.on('data', (c) => { data += c; if (data.length > 5e6) req.destroy(); });
  req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); } });
});
const getToken = (req) => {
  const h = req.headers['authorization'] || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
};
const getAuth = (req) => {
  const t = getToken(req);
  return t ? verifyToken(t) : null;
};
const parseQuery = (req) => Object.fromEntries(new URL(req.url, 'http://x').searchParams.entries());
const jsonStr = (v) => (typeof v === 'string' ? v : JSON.stringify(v));
const bool = (v) => (v ? 1 : 0);
const nowISO = () => new Date().toISOString();

function rowOut(type, row) {
  if (!row) return null;
  const meta = TABLES[type];
  const out = { ...row };
  for (const j of meta.json) if (typeof out[j] === 'string' && out[j] !== '') { try { out[j] = JSON.parse(out[j]); } catch {} }
  for (const b of meta.bool) out[b] = out[b] == null ? null : Boolean(out[b]);
  return out;
}
function pick(body, type) {
  const meta = TABLES[type];
  const row = {};
  for (const [k, v] of Object.entries(body)) if (meta.cols.includes(k)) row[k] = v;
  if (meta.json) for (const j of meta.json) if (row[j] != null) row[j] = jsonStr(row[j]);
  if (meta.bool) for (const b of meta.bool) if (row[b] != null) row[b] = bool(row[b]);
  for (const k of ['timestamp', 'updated_at', 'sort_order', 'period', 'turns', 'score', 'like_count']) if (row[k] != null) row[k] = Number(row[k]);
  return row;
}
function buildWhere(type, filters, auth) {
  const meta = TABLES[type];
  const parts = [];
  const params = [];
  if (meta.scope === 'user' || meta.scope === 'like') { parts.push('user_id = ?'); params.push(auth.sub); }
  for (const [k, v] of Object.entries(filters || {})) {
    if (k === 'admin' || k === 'toAdmin') continue;
    parts.push(`${k} = ?`);
    params.push(typeof v === 'boolean' ? (v ? 1 : 0) : v);
  }
  return { where: parts.length ? 'WHERE ' + parts.join(' AND ') : '', params };
}
const run = (sql, params = []) => db.prepare(sql).run(...params);
const all = (sql, params = []) => db.prepare(sql).all(...params);
const get = (sql, params = []) => db.prepare(sql).get(...params);

function userFromToken(token) {
  const payload = verifyToken(token);
  if (!payload) return null;
  const row = get('SELECT * FROM users WHERE id = ?', [payload.sub]);
  if (!row) return null;
  const meta = JSON.parse(row.user_metadata || '{}');
  meta.username = row.username;
  return { id: row.id, username: row.username, email: row.email, user_metadata: meta, created_at: row.created_at };
}

// ---------------------------------------------------------------------------
async function handleAuth(method, pathname, body, req, res) {
  if (pathname === '/api/auth/signup') {
    const username = String(body.username || '').trim();
    const password = String(body.password || '');
    if (!username || !password) return send(res, 400, { error: 'missing username/password' });
    const email = toEmail(username);
    if (get('SELECT id FROM users WHERE username = ?', [username])) return send(res, 400, { error: 'username already exists' });
    const id = crypto.randomUUID();
    run('INSERT INTO users (id, username, email, encrypted_password, created_at, user_metadata) VALUES (?,?,?,?,?,?)',
      [id, username, email, hashPassword(password), Date.now(), JSON.stringify({ username })]);
    const token = signToken({ id, username });
    return send(res, 200, { data: { token, user: { id, username, email, user_metadata: { username }, created_at: Date.now() } }, error: null });
  }
  if (pathname === '/api/auth/signin') {
    const password = String(body.password || '');
    let row;
    if (body.email) row = get('SELECT * FROM users WHERE email = ?', [String(body.email).trim().toLowerCase()]);
    else if (body.username) {
      const username = String(body.username).trim();
      row = get('SELECT * FROM users WHERE username = ? OR email = ?', [username, toEmail(username)]);
    }
    if (!row || !verifyPassword(password, row.encrypted_password)) return send(res, 401, { error: 'invalid credentials' });
    const token = signToken({ id: row.id, username: row.username });
    return send(res, 200, { data: { token, user: userFromToken(token) }, error: null });
  }
  if (pathname === '/api/auth/signout') return send(res, 200, { data: { ok: true }, error: null });
  if (pathname === '/api/auth/user' || pathname === '/api/auth/session') {
    const token = getToken(req);
    return send(res, 200, { data: { user: token ? userFromToken(token) : null }, error: null });
  }
  return send(res, 404, { error: 'not found' });
}

async function handleData(method, pathname, body, req, res) {
  const auth = getAuth(req);
  const m = pathname.match(/^\/api\/data\/([a-z_]+)$/);
  if (!m) return send(res, 404, { error: 'unknown table' });
  const name = m[1];
  const meta = TABLES[name];
  if (!meta) return send(res, 404, { error: 'unknown table' });
  const uid = auth ? auth.sub : null;
  // Public reads: approved guide entries/comments are viewable without login.
  const isPublicRead = method === 'GET' && (name === 'guide_entries' || name === 'guide_comments');
  if (!auth && !isPublicRead) return send(res, 401, { error: 'unauthorized' });
  const query = parseQuery(req);
  const filters = (() => { try { return JSON.parse(query.filters || '{}'); } catch { return {}; } })();

  if (method === 'GET') {
    let { where, params } = buildWhere(name, filters, auth);
    const base = (where || '').replace(/^WHERE\s+/i, '').trim();
    if (name === 'guide_entries') {
      const cond = uid && ADMIN_IDS.has(uid) ? 'deleted = 0' : "(status = 'approved' AND deleted = 0)";
      where = 'WHERE ' + [base ? `(${base})` : '', cond].filter(Boolean).join(' AND ');
    }
    if (name === 'guide_comments') {
      const cond = uid && ADMIN_IDS.has(uid) ? 'deleted = 0' : "(deleted = 0 AND entry_id IN (SELECT id FROM guide_entries WHERE status = 'approved' AND deleted = 0))";
      where = 'WHERE ' + [base ? `(${base})` : '', cond].filter(Boolean).join(' AND ');
    }
    const colSel = query.cols && query.cols !== '*' && query.cols !== 'null'
      ? query.cols.split(',').map((c) => c.trim()).filter((c) => meta.cols.includes(c)).join(', ')
      : '*';
    let sql = `SELECT ${colSel} FROM ${name} ${where}`;
    if (query.order) { const dir = query.asc === '0' ? 'DESC' : 'ASC'; sql += ` ORDER BY ${query.order} ${dir}`; }
    if (query.limit) sql += ` LIMIT ${Number(query.limit)}`;
    let rows;
    try { rows = all(sql, params); } catch (e) { return send(res, 500, { error: e.message }); }
    rows = rows.map((r) => rowOut(name, r));
    return send(res, 200, query.single === '1' ? { data: rows[0] ?? null, error: null } : { data: rows, error: null });
  }

  if (method === 'POST') {
    const mode = query.mode === 'upsert' ? 'upsert' : 'insert';
    const onConflict = query.onConflict || 'id';
    let row = pick(body, name);
    if (meta.scope === 'user') row.user_id = auth.sub;
    else if (name === 'guide_entries') {
      row.user_id = auth.sub;
      if (!row.status) row.status = ADMIN_IDS.has(auth.sub) ? 'approved' : 'pending';
      if (!row.id) row.id = crypto.randomUUID();
      if (!row.created_at) row.created_at = nowISO();
      row.updated_at = nowISO();
      row.deleted = row.deleted == null ? 0 : bool(row.deleted);
      row.like_count = row.like_count == null ? 0 : Number(row.like_count);
    } else if (name === 'guide_likes') {
      row.user_id = auth.sub;
      if (!row.created_at) row.created_at = nowISO();
    } else if (name === 'guide_comments') {
      row.user_id = auth.sub;
      if (!row.id) row.id = crypto.randomUUID();
      if (!row.created_at) row.created_at = nowISO();
      const metaU = auth.user_metadata?.username || '';
      if (row.author != null && row.author !== metaU) return send(res, 403, { error: 'author mismatch' });
      row.author = metaU;
    }
    const ic = TABLES[name].cols.filter((c) => row[c] !== undefined);
    if (!ic.length) return send(res, 400, { error: 'no columns to insert' });
    const placeholders = ic.map(() => '?').join(', ');
    let sql;
    if (mode === 'upsert') {
      const updCols = ic.filter((c) => c !== onConflict);
      sql = `INSERT INTO ${name} (${ic.join(', ')}) VALUES (${placeholders})`;
      sql += updCols.length
        ? ` ON CONFLICT(${onConflict}) DO UPDATE SET ${updCols.map((c) => `${c} = excluded.${c}`).join(', ')}`
        : ` ON CONFLICT(${onConflict}) DO NOTHING`;
    } else {
      sql = `INSERT INTO ${name} (${ic.join(', ')}) VALUES (${placeholders})`;
    }
    try { run(sql, ic.map((c) => row[c])); } catch (e) { return send(res, 500, { error: e.message }); }

    let back;
    if (name === 'guide_likes') back = get(`SELECT * FROM ${name} WHERE entry_id = ? AND user_id = ?`, [row.entry_id, auth.sub]);
    else if (row.id) back = get(`SELECT * FROM ${name} WHERE id = ?`, [row.id]);
    else if (row.uuid) back = get(`SELECT * FROM ${name} WHERE uuid = ?`, [row.uuid]);
    else if (name === 'custom_skills' || name === 'medal_records') back = get(`SELECT * FROM ${name} WHERE user_id = ?`, [auth.sub]);
    else back = get(`SELECT * FROM ${name} ORDER BY id DESC LIMIT 1`);
    return send(res, 200, { data: rowOut(name, back), error: null });
  }

  if (method === 'PATCH') {
    const row = pick(body, name);
    const setCols = TABLES[name].cols.filter((c) => row[c] !== undefined);
    if (!setCols.length) return send(res, 400, { error: 'no columns to update' });
    if (name === 'guide_entries') {
      const idv = filters.id;
      if (!idv) return send(res, 400, { error: 'missing id filter' });
      if (!ADMIN_IDS.has(auth.sub)) {
        const owner = get('SELECT user_id FROM guide_entries WHERE id = ?', [idv]);
        if (owner && owner.user_id !== auth.sub) return send(res, 403, { error: 'no permission' });
      }
      row.updated_at = nowISO();
    }
    if (name === 'guide_comments' && !ADMIN_IDS.has(auth.sub)) {
      const idv = filters.id;
      if (idv) { const owner = get('SELECT user_id FROM guide_comments WHERE id = ?', [idv]); if (owner && owner.user_id !== auth.sub) return send(res, 403, { error: 'no permission' }); }
    }
    let { where, params } = buildWhere(name, filters, auth);
    if (!where) return send(res, 400, { error: 'scope/filters empty' });
    try { run(`UPDATE ${name} SET ${setCols.map((c) => `${c} = ?`).join(', ')} ${where}`, [...setCols.map((c) => row[c]), ...params]); }
    catch (e) { return send(res, 500, { error: e.message }); }
    return send(res, 200, { data: true, error: null });
  }

  if (method === 'DELETE') {
    let { where, params } = buildWhere(name, filters, auth);
    if (name === 'guide_entries' && !ADMIN_IDS.has(auth.sub)) return send(res, 403, { error: 'admin only' });
    if (name === 'guide_comments' && !ADMIN_IDS.has(auth.sub)) {
      const idv = filters.id;
      if (idv) { const owner = get('SELECT user_id FROM guide_comments WHERE id = ?', [idv]); if (owner && owner.user_id !== auth.sub) return send(res, 403, { error: 'no permission' }); }
    }
    if (!where) return send(res, 400, { error: 'scope/filters empty' });
    try { run(`DELETE FROM ${name} ${where}`, params); } catch (e) { return send(res, 500, { error: e.message }); }
    return send(res, 200, { data: true, error: null });
  }

  return send(res, 405, { error: 'method not allowed' });
}

async function handleRpc(body, req, res) {
  const auth = getAuth(req);
  if (!auth) return send(res, 401, { error: 'unauthorized' });
  const p_entry_id = body.p_entry_id;
  if (!p_entry_id) return send(res, 400, { error: 'missing p_entry_id' });
  if (!get('SELECT id FROM guide_entries WHERE id = ?', [p_entry_id])) return send(res, 404, { error: 'entry not found' });
  if (get('SELECT 1 FROM guide_likes WHERE entry_id = ? AND user_id = ?', [p_entry_id, auth.sub]))
    run('DELETE FROM guide_likes WHERE entry_id = ? AND user_id = ?', [p_entry_id, auth.sub]);
  else
    run('INSERT INTO guide_likes (entry_id, user_id, created_at) VALUES (?,?,?)', [p_entry_id, auth.sub, nowISO()]);
  const cnt = get('SELECT COUNT(*) AS c FROM guide_likes WHERE entry_id = ?', [p_entry_id]).c;
  run('UPDATE guide_entries SET like_count = ? WHERE id = ?', [cnt, p_entry_id]);
  return send(res, 200, { data: Number(cnt), error: null });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const pathname = url.pathname;
    const method = req.method;
    if (method === 'OPTIONS') return send(res, 204, null);
    if (pathname.startsWith('/api/auth/')) {
      const body = await readBody(req);
      return await handleAuth(method, pathname, body, req, res);
    }
    if (pathname.startsWith('/api/rpc/')) {
      const body = await readBody(req);
      return await handleRpc(body, req, res);
    }
    if (pathname.startsWith('/api/data/')) {
      const body = method === 'POST' || method === 'PATCH' ? await readBody(req) : {};
      return await handleData(method, pathname, body, req, res);
    }
    return send(res, 404, { error: 'not found' });
  } catch (e) {
    send(res, 500, { error: String((e && e.stack) || e) });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[hbr] local server on http://0.0.0.0:${PORT}`);
});
