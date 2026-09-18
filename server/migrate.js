import fs from 'node:fs';
import readline from 'node:readline';
import { db } from './db.js';

const SRC = process.argv[2] || '\\\\tsclient\\Public\\supabase_backup.sql';
if (!fs.existsSync(SRC)) { console.log('SRC not found: ' + SRC); process.exit(1); }

// dump-table -> { table, map: <schemaCol>: [srcCol, transform?] }
// transform: 'bool' | 'num' | 'ms' | 'username' | undefined(raw)
const TABLES = {
  'auth.users': { table: 'users', map: {
    id: ['id'], email: ['email'], encrypted_password: ['encrypted_password'],
    username: ['raw_user_meta_data', 'username'], user_metadata: ['raw_user_meta_data'],
    created_at: ['created_at', 'ms'],
  } },
  'public.calc_history': { table: 'calc_history', map: {
    user_id: ['user_id'], uuid: ['uuid'], data: ['data'], timestamp: ['timestamp', 'num'], deleted: ['deleted', 'bool'],
  } },
  'public.planner_axles': { table: 'planner_axles', map: {
    user_id: ['user_id'], uuid: ['uuid'], data: ['data'], timestamp: ['timestamp', 'num'], deleted: ['deleted', 'bool'],
  } },
  'public.white_stats': { table: 'white_stats', map: {
    user_id: ['user_id'], uuid: ['uuid'], data: ['data'], timestamp: ['timestamp', 'num'], deleted: ['deleted', 'bool'],
  } },
  'public.folders': { table: 'folders', map: {
    id: ['id', 'num'], user_id: ['user_id'], name: ['name'], type: ['type'], timestamp: ['timestamp', 'num'], sort_order: ['sort_order', 'num'],
  } },
  'public.custom_skills': { table: 'custom_skills', map: {
    user_id: ['user_id'], data: ['data'], updated_at: ['updated_at', 'num'],
  } },
  'public.medal_records': { table: 'medal_records', map: {
    user_id: ['user_id'], data: ['data'], updated_at: ['updated_at', 'num'],
  } },
  'public.guide_entries': { table: 'guide_entries', map: {
    id: ['id'], category: ['category'], period: ['period', 'num'], stage: ['stage'], attribute: ['attribute'],
    weather: ['weather', 'bool'], turns: ['turns', 'num'], team: ['team'], author: ['author'], video_url: ['video_url'],
    image_url: ['image_url'], notes: ['notes'], score: ['score', 'num'], status: ['status'], user_id: ['user_id'],
    created_at: ['created_at'], updated_at: ['updated_at'], deleted: ['deleted', 'bool'], like_count: ['like_count', 'num'],
  } },
  'public.guide_likes': { table: 'guide_likes', map: {
    entry_id: ['entry_id'], user_id: ['user_id'], created_at: ['created_at'],
  } },
  'public.guide_comments': { table: 'guide_comments', map: {
    id: ['id'], entry_id: ['entry_id'], user_id: ['user_id'], author: ['author'], content: ['content'], created_at: ['created_at'], deleted: ['deleted', 'bool'],
  } },
};

function unescape(field) {
  if (field === '\\N') return null;
  let out = '';
  for (let i = 0; i < field.length; i++) {
    const ch = field[i];
    if (ch === '\\' && i + 1 < field.length) {
      const n = field[i + 1];
      if (n === 't') { out += '\t'; i++; }
      else if (n === 'n') { out += '\n'; i++; }
      else if (n === 'r') { out += '\r'; i++; }
      else if (n === '\\') { out += '\\'; i++; }
      else if (n === 'b') { out += '\b'; i++; }
      else if (n === 'f') { out += '\f'; i++; }
      else if (n === 'v') { out += '\v'; i++; }
      else if (n >= '0' && n <= '9' && i + 3 < field.length) { out += String.fromCharCode(parseInt(field.slice(i + 1, i + 4), 8)); i += 3; }
      else { out += n; i++; }
    } else { out += ch; }
  }
  return out;
}

function usernameFromEmail(email) {
  const local = String(email || '').split('@')[0];
  if (/^[a-z0-9._-]+$/.test(local)) return local;
  try { return Buffer.from(local.replace(/_/g, '+').replace(/-/g, '/'), 'base64').toString('utf8'); } catch { return local; }
}

function transform(cols, rowLine, dumpTable) {
  const spec = TABLES[dumpTable];
  const vals = rowLine.split('\t').map(unescape);
  const byName = {};
  cols.forEach((c, i) => { byName[c.trim().replace(/"/g, '')] = vals[i]; });
  const out = {};
  for (const [schemaCol, [src, t]] of Object.entries(spec.map)) {
    const raw = byName[src];
    if (t === 'bool') out[schemaCol] = raw == null ? null : (raw === 't' || raw === 'true' || raw === '1' ? 1 : 0);
    else if (t === 'num') out[schemaCol] = raw == null ? null : Number(raw);
    else if (t === 'ms') out[schemaCol] = raw == null ? 0 : (Number.isNaN(Date.parse(raw)) ? 0 : Date.parse(raw));
    else if (t === 'username') {
      let u = null;
      if (raw != null) { try { u = (JSON.parse(raw) || {}).username; } catch { u = null; } }
      if (!u) u = usernameFromEmail(byName.email);
      out[schemaCol] = u;
    }
    else out[schemaCol] = raw;
  }
  return out;
}

const counts = {};
let current = null;
const rl = readline.createInterface({ input: fs.createReadStream(SRC, { encoding: 'utf8' }), crlfDelay: Infinity });

rl.on('line', (line) => {
  if (current && line === '\\.') { current = null; return; }
  const m = line.match(/^COPY ([\w.]+) \(([^)]*)\) FROM stdin;?/);
  if (m && TABLES[m[1]]) { current = { dumpTable: m[1], cols: m[2].split(',').map((c) => c.trim()) }; counts[m[1]] = counts[m[1]] || []; return; }
  if (!current || !line) return;
  counts[current.dumpTable].push(transform(current.cols, line, current.dumpTable));
});

rl.on('close', () => {
  for (const [dumpTable, rows] of Object.entries(counts)) {
    const spec = TABLES[dumpTable];
    if (!rows.length) continue;
    const cols = Object.keys(spec.map);
    const stmt = db.prepare(`INSERT INTO ${spec.table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')}) ON CONFLICT DO NOTHING`);
    db.exec('BEGIN');
    let ok = 0;
    for (const r of rows) {
      try { stmt.run(...cols.map((c) => r[c])); ok++; }
      catch (e) { console.log(`  skip row ${spec.table}: ${e.message}`); }
    }
    db.exec('COMMIT');
    console.log(`  ${spec.table}: imported ${ok}`);
  }
  console.log('\n=== SUMMARY ===');
  for (const [t, rows] of Object.entries(counts)) console.log(`  ${t}: ${rows.length}`);
  db.close();
});
