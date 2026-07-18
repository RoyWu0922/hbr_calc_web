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
async function uploadTable(table: string, storeName: string, dbName: string, folderType?: string) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const db = await openDB(dbName, dbName === 'hbr-white-stats' ? 1 : 5);
    const all = await db.getAll(storeName).catch(() => [] as any[]);
    // Build folder name lookup
    const idToName = new Map<number, string>();
    if (folderType && dbName === 'hbr-calc-db') {
      const folders = await db.getAll('folders').catch(() => [] as any[]);
      for (const f of folders) { if (f.type === folderType) idToName.set(f.id, f.name); }
    }
    for (const entry of all) {
      ensureUUID(entry);
      // Attach folder name for cross-device matching
      if (entry.folderId != null && idToName.has(entry.folderId)) {
        entry._folder_name = idToName.get(entry.folderId);
      } else if (entry.folderId != null) {
        entry._folder_name = undefined; // unknown folder, don't carry stale ID
      }
      await db.put(storeName, entry);
      await supabase.from(table).upsert({
        user_id: user.id, uuid: entry.uuid, data: entry,
        timestamp: entry.timestamp || Date.now(),
        deleted: !!entry.deleted,
      }, { onConflict: 'uuid' });
    }
  } catch (e) { console.error(`uploadTable(${table}) failed:`, e); }
}

// ─── Pull & merge one table ────────────────────────────────────
async function pullTable(table: string, storeName: string, dbName: string, folderType?: string) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return 0;
    const { data: cloud } = await supabase.from(table).select('*').eq('user_id', user.id);
    if (!cloud?.length) return 0;
    const db = await openDB(dbName, dbName === 'hbr-white-stats' ? 1 : 5);
    // Build local folder name→id lookup
    const nameToId = new Map<string, number>();
    if (folderType && dbName === 'hbr-calc-db') {
      const folders = await db.getAll('folders').catch(() => [] as any[]);
      for (const f of folders) { if (f.type === folderType) nameToId.set(f.name, f.id); }
    }
    const local = await db.getAll(storeName).catch(() => [] as any[]);
    const localByUuid = new Map(local.map(e => [e.uuid, e]));
    let changes = 0;
    const tx = db.transaction(storeName as any, 'readwrite');

    for (const row of cloud) {
      const uuid = row.uuid;
      const existing = localByUuid.get(uuid);
      // Resolve _folder_name from cloud to local folderId
      const cloudData: any = { ...row.data };
      if (cloudData._folder_name && nameToId.has(cloudData._folder_name)) {
        cloudData.folderId = nameToId.get(cloudData._folder_name);
      }
      delete cloudData._folder_name;
      if (existing) {
        localByUuid.delete(uuid);
        if (row.deleted) {
          await tx.store.delete(existing.id!);
          changes++;
        } else if (row.timestamp > (existing.timestamp || 0)) {
          const merged = { ...cloudData, uuid, timestamp: row.timestamp };
          delete merged.id;
          await tx.store.put(merged);
          changes++;
        }
      } else if (!row.deleted) {
        const entry = { ...cloudData, uuid, timestamp: row.timestamp };
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
  } catch (e) { console.error(`pullTable(${table}) failed:`, e); return 0; }
}

// ─── Public API ────────────────────────────────────────────────

// Custom skills sync (localStorage, single row per user)
// Always merges local + cloud — newer side wins on key conflicts, no data loss
async function syncCustomSkills() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const localTs = parseInt(localStorage.getItem('hbr_skills_ts') || '0');
    const { data: cloud } = await supabase.from('custom_skills').select('*').eq('user_id', user.id).maybeSingle();
    const cloudTs = cloud?.updated_at || 0;
    const cloudData: Record<string, any> = cloud?.data || {};

    // Check if local has any actual content
    let localHasContent = false;
    for (const cat of ['buff', 'debuff', 'weakness'] as const) {
      const s = JSON.parse(localStorage.getItem('hbr-custom-skills-' + cat) || '[]');
      const o = JSON.parse(localStorage.getItem('hbr-builtin-overrides-' + cat) || '{}');
      if (s.length > 0 || Object.keys(o).length > 0) localHasContent = true;
    }
    const cloudHasContent = cloudData && (
      (cloudData['skills_buff'] || []).length > 0 || Object.keys(cloudData['overrides_buff'] || {}).length > 0 ||
      (cloudData['skills_debuff'] || []).length > 0 || Object.keys(cloudData['overrides_debuff'] || {}).length > 0 ||
      (cloudData['skills_weakness'] || []).length > 0 || Object.keys(cloudData['overrides_weakness'] || {}).length > 0
    );

    // If one side has no content, handle based on context
    if (cloudHasContent && !localHasContent) {
      if (localTs > 0) {
        // Synced before and now local is empty → intentional deletion → push empty to cloud
        const ts = Date.now();
        await supabase.from('custom_skills').upsert({ user_id: user.id, data: {}, updated_at: ts }, { onConflict: 'user_id' });
        localStorage.setItem('hbr_skills_ts', String(ts));
        return;
      }
      // First time on this device → pull cloud down
      for (const cat of ['buff', 'debuff', 'weakness'] as const) {
        if (cloudData['skills_' + cat]) localStorage.setItem('hbr-custom-skills-' + cat, JSON.stringify(cloudData['skills_' + cat]));
        if (cloudData['overrides_' + cat]) localStorage.setItem('hbr-builtin-overrides-' + cat, JSON.stringify(cloudData['overrides_' + cat]));
      }
      localStorage.setItem('hbr_skills_ts', String(cloudTs));
      return;
    }
    if (localHasContent && !cloudHasContent) {
      // Push local to cloud (first sync)
      const data: Record<string, any> = {};
      for (const cat of ['buff', 'debuff', 'weakness'] as const) {
        data['skills_' + cat] = JSON.parse(localStorage.getItem('hbr-custom-skills-' + cat) || '[]');
        data['overrides_' + cat] = JSON.parse(localStorage.getItem('hbr-builtin-overrides-' + cat) || '{}');
      }
      const ts = Date.now();
      await supabase.from('custom_skills').upsert({ user_id: user.id, data, updated_at: ts }, { onConflict: 'user_id' });
      localStorage.setItem('hbr_skills_ts', String(ts));
      return;
    }
    if (!localHasContent && !cloudHasContent) return;

    // Build merge: include all entries from both sides; for same skill/override, prefer local when localTs >= cloudTs
    const preferLocal = localTs >= cloudTs;
    const merged: Record<string, any> = {};
    let hasContent = false;
    for (const cat of ['buff', 'debuff', 'weakness'] as const) {
      const localSkills: any[] = JSON.parse(localStorage.getItem('hbr-custom-skills-' + cat) || '[]');
      const cloudSkills: any[] = cloudData['skills_' + cat] || [];
      const localOv: Record<string, any> = JSON.parse(localStorage.getItem('hbr-builtin-overrides-' + cat) || '{}');
      const cloudOv: Record<string, any> = cloudData['overrides_' + cat] || {};

      // Merge skills by name — preferLocal wins on conflict
      const byName = new Map<string, any>();
      const secondaryS = preferLocal ? cloudSkills : localSkills;
      const primaryS = preferLocal ? localSkills : cloudSkills;
      for (const s of secondaryS) { if (s && s.name) byName.set(s.name, s); }
      for (const s of primaryS) { if (s && s.name) byName.set(s.name, s); }
      merged['skills_' + cat] = [...byName.values()];

      // Merge overrides — preferLocal wins on same key
      const secondaryOv = preferLocal ? cloudOv : localOv;
      const primaryOv = preferLocal ? localOv : cloudOv;
      merged['overrides_' + cat] = { ...secondaryOv, ...primaryOv };

      if (merged['skills_' + cat].length > 0 || Object.keys(merged['overrides_' + cat]).length > 0) hasContent = true;
    }

    // Write merged to localStorage
    for (const cat of ['buff', 'debuff', 'weakness'] as const) {
      localStorage.setItem('hbr-custom-skills-' + cat, JSON.stringify(merged['skills_' + cat] || []));
      localStorage.setItem('hbr-builtin-overrides-' + cat, JSON.stringify(merged['overrides_' + cat] || {}));
    }

    // Push merged to cloud (only if has content or cloud record exists)
    if (hasContent || cloudTs > 0) {
      const ts = Date.now();
      await supabase.from('custom_skills').upsert({ user_id: user.id, data: merged, updated_at: ts }, { onConflict: 'user_id' });
      localStorage.setItem('hbr_skills_ts', String(ts));
    }
  } catch (e) { console.error('syncCustomSkills failed:', e); }
}

async function syncFolders() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const db = await openDB('hbr-calc-db', 5);
    // Upload local folders not in cloud
    const local = await db.getAll('folders').catch(() => [] as any[]);
    for (const f of local) {
      try {
        const { data: exist } = await supabase.from('folders').select('id').eq('user_id', user.id).eq('name', f.name).eq('type', f.type).maybeSingle();
        if (!exist) await supabase.from('folders').insert({ user_id: user.id, name: f.name, type: f.type, timestamp: f.timestamp || 0, sort_order: f.sortOrder || 0 });
      } catch (e) { console.error('syncFolders upload entry failed:', e); }
    }
    // Pull cloud folders not in local
    const { data: cloud } = await supabase.from('folders').select('*').eq('user_id', user.id);
    if (cloud) {
      const localNames = new Set(local.map(f => f.type + ':' + f.name));
      const tx = db.transaction('folders', 'readwrite');
      for (const row of cloud) {
        if (!localNames.has(row.type + ':' + row.name)) {
          await tx.store.add({ name: row.name, type: row.type, timestamp: row.timestamp || 0, sortOrder: row.sort_order || 0 });
        }
      }
      await tx.done;
    }
  } catch (e) { console.error('syncFolders failed:', e); }
}

export async function uploadAll() {
  await syncFolders();
  await uploadTable('calc_history', 'history', 'hbr-calc-db', 'calc');
  await uploadTable('planner_axles', 'planner_saves', 'hbr-calc-db', 'planner');
  await uploadTable('white_stats', 'history', 'hbr-white-stats');
  await syncCustomSkills();
}

export async function pullAll() {
  await syncFolders();
  await pullTable('calc_history', 'history', 'hbr-calc-db', 'calc');
  await pullTable('planner_axles', 'planner_saves', 'hbr-calc-db', 'planner');
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
