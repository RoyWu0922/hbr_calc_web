import { supabase } from './supabase';
import { openDB } from 'idb';
import { MEDAL_CUSTOM_KEY, readMedalStore, writeMedalStore } from './medalStorage';

// Tables: calc_history, planner_axles, white_stats
// Each has: uuid TEXT UNIQUE, user_id UUID, data JSONB, timestamp BIGINT, deleted BOOLEAN

function uuid() { return crypto.randomUUID(); }

// ─── Sync lock (queues concurrent pullAll/uploadAll instead of dropping) ─────
let syncBusy = false;
let pendingSync: { fn: () => Promise<void>; resolve: () => void } | null = null;

function runWithLock(fn: () => Promise<void>): Promise<void> {
  if (syncBusy) {
    return new Promise<void>((resolve) => {
      // Coalesce: only the latest queued request matters (upload/pull are full passes)
      if (pendingSync) pendingSync.resolve();
      pendingSync = { fn, resolve };
    });
  }
  syncBusy = true;
  return fn().finally(async () => {
    syncBusy = false;
    const next = pendingSync;
    pendingSync = null;
    if (next) {
      await runWithLock(next.fn);
      next.resolve();
    }
  });
}

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
          // Soft tombstone — never physically destroy user data
          const merged = { ...existing, deleted: true, uuid, timestamp: row.timestamp };
          await tx.store.put(merged);
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
    await tx.done;
    // Push local records not in cloud (new, created offline) — after the tx
    // so network awaits don't auto-commit the transaction mid-flight
    for (const [uid, entry] of localByUuid) {
      if (!entry.deleted) {
        await supabase.from(table).upsert({
          user_id: user.id, uuid: uid, data: entry,
          timestamp: entry.timestamp || Date.now(), deleted: false,
        }, { onConflict: 'uuid' });
        changes++;
      }
    }
    return changes;
  } catch (e) { console.error(`pullTable(${table}) failed:`, e); return 0; }
}

// ─── Public API ────────────────────────────────────────────────

// Custom skills sync (localStorage, single row per user)
// Whole-store newer-wins merge (like medal_records) so deletions propagate.
async function syncCustomSkills() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const CATS = ['buff', 'debuff', 'weakness'] as const;
    const localTs = parseInt(localStorage.getItem('hbr_skills_ts') || '0');
    const { data: cloud } = await supabase.from('custom_skills').select('*').eq('user_id', user.id).maybeSingle();
    const cloudTs = cloud?.updated_at || 0;
    const cloudData: Record<string, any> = cloud?.data || {};

    const readLocal = () => {
      const data: Record<string, any> = {};
      let has = false;
      for (const cat of CATS) {
        const s = JSON.parse(localStorage.getItem('hbr-custom-skills-' + cat) || '[]');
        const o = JSON.parse(localStorage.getItem('hbr-builtin-overrides-' + cat) || '{}');
        data['skills_' + cat] = s;
        data['overrides_' + cat] = o;
        if (s.length > 0 || Object.keys(o).length > 0) has = true;
      }
      return { data, has };
    };
    const applyCloud = () => {
      for (const cat of CATS) {
        localStorage.setItem('hbr-custom-skills-' + cat, JSON.stringify(cloudData['skills_' + cat] || []));
        localStorage.setItem('hbr-builtin-overrides-' + cat, JSON.stringify(cloudData['overrides_' + cat] || {}));
      }
      localStorage.setItem('hbr_skills_ts', String(cloudTs));
    };
    const pushLocal = async (data: Record<string, any>, ts: number) => {
      await supabase.from('custom_skills').upsert({ user_id: user.id, data, updated_at: ts }, { onConflict: 'user_id' });
      localStorage.setItem('hbr_skills_ts', String(ts));
    };

    const { data: localData, has: localHasContent } = readLocal();
    const cloudHasContent = cloudData && (
      (cloudData['skills_buff'] || []).length > 0 || Object.keys(cloudData['overrides_buff'] || {}).length > 0 ||
      (cloudData['skills_debuff'] || []).length > 0 || Object.keys(cloudData['overrides_debuff'] || {}).length > 0 ||
      (cloudData['skills_weakness'] || []).length > 0 || Object.keys(cloudData['overrides_weakness'] || {}).length > 0
    );

    if (!localHasContent && !cloudHasContent) return;

    if (cloudHasContent && !localHasContent) {
      if (localTs > 0) { await pushLocal({}, Date.now()); return; } // synced before → intentional deletion → propagate
      applyCloud(); // first time on this device → pull cloud down
      return;
    }
    if (localHasContent && !cloudHasContent) {
      await pushLocal(localData, localTs || Date.now()); // first sync
      return;
    }
    // Both have content → newer side wins (whole-store, so deletions propagate)
    if (localTs >= cloudTs) await pushLocal(localData, localTs);
    else applyCloud();
  } catch (e) { console.error('syncCustomSkills failed:', e); }
}

// Medal progress records sync (localStorage, single row per user)
// Whole-store newer-wins merge (like custom_skills), plus the custom char roster.
async function syncMedalRecords() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const local = readMedalStore();
    const localCustom = JSON.parse(localStorage.getItem(MEDAL_CUSTOM_KEY) || '[]');
    const localTs = local?.updatedAt || 0;
    const localHasContent = !!local && Object.keys(local.records).length > 0;

    const { data: cloud } = await supabase.from('medal_records').select('*').eq('user_id', user.id).maybeSingle();
    const cloudTs = cloud?.updated_at || 0;
    const payload: any = cloud?.data || {};
    const cloudStore = payload.store || null;
    const cloudCustom = payload.customChars || [];
    const cloudHasContent = !!cloudStore && Object.keys(cloudStore.records || {}).length > 0;

    const pushLocal = async () => {
      await supabase.from('medal_records').upsert({
        user_id: user.id,
        data: { store: local, customChars: localCustom },
        updated_at: localTs || Date.now(),
      }, { onConflict: 'user_id' });
    };

    if (!localHasContent && !cloudHasContent) return;

    if (cloudHasContent && !localHasContent) {
      if (localTs > 0) { await pushLocal(); return; } // intentional deletion → push empty
      writeMedalStore(cloudStore);
      localStorage.setItem(MEDAL_CUSTOM_KEY, JSON.stringify(cloudCustom));
      return;
    }

    if (localHasContent && !cloudHasContent) {
      await pushLocal(); // first sync
      return;
    }

    // Both have content → newer side wins (whole-store)
    if (localTs >= cloudTs) {
      await pushLocal();
    } else {
      writeMedalStore(cloudStore);
      localStorage.setItem(MEDAL_CUSTOM_KEY, JSON.stringify(cloudCustom));
    }
  } catch (e) { console.error('syncMedalRecords failed:', e); }
}

async function syncFolders() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const db = await openDB('hbr-calc-db', 5);
    // Upload local folders not in cloud (handle rename + delete)
    const local = await db.getAll('folders').catch(() => [] as any[]);
    for (const f of local) {
      try {
        // Folder renamed: remove old cloud row so it doesn't resurrect
        const prevName = f._prevName as string | undefined;
        if (prevName && prevName !== f.name) {
          await supabase.from('folders').delete().eq('user_id', user.id).eq('name', prevName).eq('type', f.type);
          delete f._prevName;
          await db.put('folders', f);
        }
        // Folder deleted: remove cloud row, don't re-insert
        if (f.deleted) {
          await supabase.from('folders').delete().eq('user_id', user.id).eq('name', f.name).eq('type', f.type);
          continue;
        }
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

export function uploadAll(): Promise<void> {
  return runWithLock(async () => {
    await syncFolders();
    await uploadTable('calc_history', 'history', 'hbr-calc-db', 'calc');
    await uploadTable('planner_axles', 'planner_saves', 'hbr-calc-db', 'planner');
    await uploadTable('white_stats', 'history', 'hbr-white-stats');
    await syncCustomSkills();
    await syncMedalRecords();
  });
}

export function pullAll(): Promise<void> {
  return runWithLock(async () => {
    await syncFolders();
    await pullTable('calc_history', 'history', 'hbr-calc-db', 'calc');
    await pullTable('planner_axles', 'planner_saves', 'hbr-calc-db', 'planner');
    await pullTable('white_stats', 'history', 'hbr-white-stats');
    await syncCustomSkills();
    await syncMedalRecords();
  });
}

export async function fullSync() {
  await uploadAll();
  await pullAll();
}

// Attach sync on page leave (only when logged in)
export function attachSyncTriggers() {
  const doUpload = () => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) uploadAll();
    }).catch(() => {});
  };
  const handler = () => { if (document.visibilityState === 'hidden') doUpload(); };
  document.addEventListener('visibilitychange', handler);
  window.addEventListener('beforeunload', doUpload);
}
