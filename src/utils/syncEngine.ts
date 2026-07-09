import { supabase } from './supabase';
import { openDB } from 'idb';

// Tables: calc_history, planner_axles, white_stats
// Each has: uuid TEXT UNIQUE, user_id UUID, data JSONB, timestamp BIGINT, deleted BOOLEAN

function uuid() { return crypto.randomUUID(); }

// ─── Record helper ─────────────────────────────────────────────
function ensureUUID(entry: any) {
  if (!entry.uuid) entry.uuid = uuid();
  return entry;
}

// ─── Upload one table ──────────────────────────────────────────
async function uploadTable(table: string, storeName: string, dbName: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const db = await openDB(dbName, dbName === 'hbr-white-stats' ? 1 : 5);
  const all = await db.getAll(storeName).catch(() => [] as any[]);
  for (const entry of all) {
    ensureUUID(entry);
    await db.put(storeName, entry);
    // Upsert by uuid
    await supabase.from(table).upsert({
      user_id: user.id, uuid: entry.uuid, data: entry,
      timestamp: entry.timestamp || Date.now(),
      deleted: !!entry.deleted,
    }, { onConflict: 'uuid' });
  }
}

// ─── Pull & merge one table ────────────────────────────────────
async function pullTable(table: string, storeName: string, dbName: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;
  const { data: cloud } = await supabase.from(table).select('*').eq('user_id', user.id);
  if (!cloud?.length) return 0;
  const db = await openDB(dbName, dbName === 'hbr-white-stats' ? 1 : 5);
  const local = await db.getAll(storeName).catch(() => [] as any[]);
  const localByUuid = new Map(local.map(e => [e.uuid, e]));
  let changes = 0;
  const tx = db.transaction(storeName as any, 'readwrite');

  for (const row of cloud) {
    const uuid = row.uuid;
    const existing = localByUuid.get(uuid);
    if (existing) {
      localByUuid.delete(uuid);
      if (row.deleted) {
        await tx.store.delete(existing.id!);
        changes++;
      } else if (row.timestamp > (existing.timestamp || 0)) {
        const merged = { ...row.data, uuid, timestamp: row.timestamp };
        delete merged.id;
        await tx.store.put(merged);
        changes++;
      }
    } else if (!row.deleted) {
      const entry = { ...row.data, uuid, timestamp: row.timestamp };
      delete entry.id;
      await tx.store.add(entry);
      changes++;
    }
  }
  // Push local records not in cloud (new, created offline)
  for (const [uid, entry] of localByUuid) {
    if (!entry.deleted) {
      await supabase.from(table).upsert({
        user_id: user.id, uuid: uid, data: entry,
        timestamp: entry.timestamp || Date.now(), deleted: false,
      }, { onConflict: 'uuid' });
      changes++;
    }
  }
  await tx.done;
  return changes;
}

// ─── Public API ────────────────────────────────────────────────

// Custom skills sync (localStorage, single row per user)
async function syncCustomSkills() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const localTs = parseInt(localStorage.getItem('hbr_skills_ts') || '0');
  const { data: cloud } = await supabase.from('custom_skills').select('*').eq('user_id', user.id).maybeSingle();
  const cloudTs = cloud?.updated_at || 0;

  if (cloudTs > localTs) {
    // Cloud newer — pull down
    if (cloud?.data) {
      for (const cat of ['buff', 'debuff', 'weakness'] as const) {
        if (cloud.data['skills_' + cat]) localStorage.setItem('hbr-custom-skills-' + cat, JSON.stringify(cloud.data['skills_' + cat]));
        if (cloud.data['overrides_' + cat]) localStorage.setItem('hbr-builtin-overrides-' + cat, JSON.stringify(cloud.data['overrides_' + cat]));
      }
      localStorage.setItem('hbr_skills_ts', String(cloudTs));
    }
  } else {
    // Local newer or first sync — push up
    const data: Record<string, any> = {};
    let hasContent = false;
    for (const cat of ['buff', 'debuff', 'weakness'] as const) {
      const s = JSON.parse(localStorage.getItem('hbr-custom-skills-' + cat) || '[]');
      const o = JSON.parse(localStorage.getItem('hbr-builtin-overrides-' + cat) || '{}');
      data['skills_' + cat] = s;
      data['overrides_' + cat] = o;
      if (s.length > 0 || Object.keys(o).length > 0) hasContent = true;
    }
    const ts = Date.now();
    await supabase.from('custom_skills').upsert({ user_id: user.id, data, updated_at: ts });
    localStorage.setItem('hbr_skills_ts', String(ts));
    // Only pull cloud if local was empty and cloud has data
    if (!hasContent && cloud?.data) {
      for (const cat of ['buff', 'debuff', 'weakness'] as const) {
        if (cloud.data['skills_' + cat]) localStorage.setItem('hbr-custom-skills-' + cat, JSON.stringify(cloud.data['skills_' + cat]));
        if (cloud.data['overrides_' + cat]) localStorage.setItem('hbr-builtin-overrides-' + cat, JSON.stringify(cloud.data['overrides_' + cat]));
      }
      localStorage.setItem('hbr_skills_ts', String(cloudTs));
    }
  }
}

export async function uploadAll() {
  await uploadTable('calc_history', 'history', 'hbr-calc-db');
  await uploadTable('planner_axles', 'planner_saves', 'hbr-calc-db');
  await uploadTable('white_stats', 'history', 'hbr-white-stats');
  await syncCustomSkills();
}

export async function pullAll() {
  await pullTable('calc_history', 'history', 'hbr-calc-db');
  await pullTable('planner_axles', 'planner_saves', 'hbr-calc-db');
  await pullTable('white_stats', 'history', 'hbr-white-stats');
  await syncCustomSkills();
}

export async function fullSync() {
  await uploadAll();
  await pullAll();
}

// Attach sync on page leave
export function attachSyncTriggers() {
  const handler = () => { if (document.visibilityState === 'hidden') uploadAll(); };
  document.addEventListener('visibilitychange', handler);
  window.addEventListener('beforeunload', () => uploadAll());
}
