import { supabase } from './supabase';
import { openDB } from 'idb';
import { MEDAL_CUSTOM_KEY, readMedalStore, writeMedalStore } from './medalStorage';

// Tables: calc_history, planner_axles, white_stats
// Each has: uuid TEXT UNIQUE, user_id UUID, data JSONB, timestamp BIGINT, deleted BOOLEAN

function uuid() { return crypto.randomUUID(); }

// ─── Sync watermarks ────────────────────────────────────────────────────────
// Three numbers per (user, table), kept in localStorage:
//   up   — newest record stamp this device has successfully pushed to the cloud
//   down — newest stamp this device has actually seen come back from the cloud
//   decl — newest stamp the user looked at and declined to pull
//
// "Are there new records in the cloud?" used to be answered by comparing the
// cloud's newest timestamp against a wall-clock mark taken when the local sync
// finished. Those are two different clocks: a second device running a few minutes
// ahead, or an upload path (visibilitychange / beforeunload) that re-stamped rows
// without refreshing the mark, made the cloud look permanently one step newer
// than "my last sync" — so the dialog kept firing while nothing new existed.
// Comparing cloud-observed values against cloud-observed values cannot drift.
//
// Watermarks alone are still not enough, because THIS device's own uploads move the
// cloud's newest stamp too. Where the data has an identity, compare identity as well
// — see cloudNeedsMerge() below.
type StampKind = 'up' | 'down' | 'decl';

function stampKey(kind: StampKind, userId: string, table: string) {
  return `hbr_sync_${kind}:${userId}:${table}`;
}
function readStamp(kind: StampKind, userId: string, table: string): number {
  const v = parseInt(localStorage.getItem(stampKey(kind, userId, table)) || '0', 10);
  return Number.isFinite(v) && v > 0 ? v : 0;
}
function writeStamp(kind: StampKind, userId: string, table: string, value: number) {
  if (!value || value <= readStamp(kind, userId, table)) return; // never move backwards
  try { localStorage.setItem(stampKey(kind, userId, table), String(value)); } catch { /* ignore */ }
}

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
    // Only push rows changed since the last successful push. Every mutation in the
    // storage layer bumps `timestamp` (see storage.ts / plannerStorage.ts), so that
    // stamp IS the change flag. Re-upserting every row of every table on every pass
    // cost one HTTP request per stored record, per user, every two minutes.
    const watermark = readStamp('up', user.id, table);
    let maxSent = 0;
    let failed = false;

    for (const entry of all) {
      ensureUUID(entry);
      const ts = Number(entry.timestamp) || 0;
      if (ts && ts <= watermark) continue; // unchanged since the last push
      // Attach folder name for cross-device matching
      if (entry.folderId != null && idToName.has(entry.folderId)) {
        entry._folder_name = idToName.get(entry.folderId);
      } else if (entry.folderId != null) {
        entry._folder_name = undefined; // unknown folder, don't carry stale ID
      }
      await db.put(storeName, entry);
      const { error } = await supabase.from(table).upsert({
        user_id: user.id, uuid: entry.uuid, data: entry,
        timestamp: entry.timestamp || Date.now(),
        deleted: !!entry.deleted,
      }, { onConflict: 'uuid' });
      if (error) { failed = true; break; }
      // The cloud demonstrably holds this stamp now, so it is not "new data".
      writeStamp('down', user.id, table, ts || Date.now());
      if (ts > maxSent) maxSent = ts;
    }
    // Only advance past what actually landed. On a failed pass the watermark stays
    // put, so the whole backlog is retried instead of being skipped as "sent".
    if (!failed && maxSent > watermark) writeStamp('up', user.id, table, maxSent);
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
    let maxSeen = 0;
    const tx = db.transaction(storeName as any, 'readwrite');

    for (const row of cloud) {
      const uuid = row.uuid;
      if (Number(row.timestamp) > maxSeen) maxSeen = Number(row.timestamp);
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
    // Everything above is now reconciled, so record how far the cloud's own
    // timeline has been seen — this is what stops the "new records" prompt from
    // repeating for data already sitting on this device.
    writeStamp('down', user.id, table, maxSeen);
    // Push local records not in cloud (new, created offline) — after the tx
    // so network awaits don't auto-commit the transaction mid-flight
    for (const [uid, entry] of localByUuid) {
      if (entry.deleted) continue;
      const ts = Number(entry.timestamp) || Date.now();
      const { error } = await supabase.from(table).upsert({
        user_id: user.id, uuid: uid, data: entry,
        timestamp: ts, deleted: false,
      }, { onConflict: 'uuid' });
      if (error) break;
      writeStamp('up', user.id, table, ts);
      writeStamp('down', user.id, table, ts);
      changes++;
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
      writeStamp('down', user.id, 'custom_skills', cloudTs);
    };
    const pushLocal = async (data: Record<string, any>, ts: number) => {
      const { error } = await supabase.from('custom_skills').upsert({ user_id: user.id, data, updated_at: ts }, { onConflict: 'user_id' });
      if (error) return;
      localStorage.setItem('hbr_skills_ts', String(ts));
      writeStamp('up', user.id, 'custom_skills', ts);
      writeStamp('down', user.id, 'custom_skills', ts);
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
      const ts = localTs || Date.now();
      const { error } = await supabase.from('medal_records').upsert({
        user_id: user.id,
        data: { store: local, customChars: localCustom },
        updated_at: ts,
      }, { onConflict: 'user_id' });
      if (error) return;
      writeStamp('up', user.id, 'medal_records', ts);
      writeStamp('down', user.id, 'medal_records', ts);
    };
    const pullCloud = () => {
      writeMedalStore(cloudStore);
      localStorage.setItem(MEDAL_CUSTOM_KEY, JSON.stringify(cloudCustom));
      writeStamp('down', user.id, 'medal_records', cloudTs);
    };

    if (!localHasContent && !cloudHasContent) return;

    if (cloudHasContent && !localHasContent) {
      if (localTs > 0) { await pushLocal(); return; } // intentional deletion → push empty
      pullCloud();
      return;
    }

    if (localHasContent && !cloudHasContent) {
      await pushLocal(); // first sync
      return;
    }

    // Both have content → newer side wins (whole-store)
    if (localTs >= cloudTs) await pushLocal();
    else pullCloud();
  } catch (e) { console.error('syncMedalRecords failed:', e); }
}

async function syncFolders() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const db = await openDB('hbr-calc-db', 5);

    // ─── Repair: dedupe local folders (older sync bugs flooded the store) ─────
    const allLocal = await db.getAll('folders').catch(() => [] as any[]);
    const keepByKey = new Map<string, number>();
    const removeIds: number[] = [];
    const remap = new Map<number, number>();
    for (const f of allLocal) {
      if (f.deleted) continue;
      const key = f.type + ':' + f.name;
      if (!keepByKey.has(key)) keepByKey.set(key, f.id);
      else { removeIds.push(f.id); remap.set(f.id, keepByKey.get(key)!); }
    }
    if (removeIds.length) {
      const hist = await db.getAll('history').catch(() => [] as any[]);
      for (const e of hist) {
        if (e.folderId != null && remap.has(e.folderId)) { e.folderId = remap.get(e.folderId); e.timestamp = Date.now(); await db.put('history', e); }
      }
      const pl = await db.getAll('planner_saves').catch(() => [] as any[]);
      for (const s of pl) {
        if (s.folderId != null && remap.has(s.folderId)) { s.folderId = remap.get(s.folderId); s.timestamp = Date.now(); await db.put('planner_saves', s); }
      }
      for (const id of removeIds) await db.delete('folders', id);
      console.log(`[sync] repaired ${removeIds.length} duplicate local folders`);
    }

    // Upload local folders not in cloud (handle rename + delete).
    // One read of the cloud folder list instead of a SELECT per local folder.
    const local = await db.getAll('folders').catch(() => [] as any[]);
    const { data: cloudFolders } = await supabase.from('folders').select('*').eq('user_id', user.id);
    const cloudKeys = new Set((cloudFolders || []).map((r: any) => r.type + ':' + r.name));
    for (const f of local) {
      try {
        // Folder renamed: remove old cloud row so it doesn't resurrect
        const prevName = f._prevName as string | undefined;
        if (prevName && prevName !== f.name) {
          await supabase.from('folders').delete().eq('user_id', user.id).eq('name', prevName).eq('type', f.type);
          cloudKeys.delete(f.type + ':' + prevName);
          delete f._prevName;
          await db.put('folders', f);
        }
        // Folder deleted: remove cloud row, don't re-insert
        if (f.deleted) {
          const key = f.type + ':' + f.name;
          if (cloudKeys.has(key)) {
            await supabase.from('folders').delete().eq('user_id', user.id).eq('name', f.name).eq('type', f.type);
            cloudKeys.delete(key);
          }
          continue;
        }
        const key = f.type + ':' + f.name;
        if (!cloudKeys.has(key)) {
          await supabase.from('folders').insert({ user_id: user.id, name: f.name, type: f.type, timestamp: f.timestamp || 0, sort_order: f.sortOrder || 0 });
          cloudKeys.add(key);
        }
      } catch (e) { console.error('syncFolders upload entry failed:', e); }
    }
    // Pull cloud folders not in local (locally deleted ones must not block this)
    if (cloudFolders) {
      const localNames = new Set(local.filter((f: any) => !f.deleted).map((f: any) => f.type + ':' + f.name));
      const tx = db.transaction('folders', 'readwrite');
      for (const row of cloudFolders) {
        const key = row.type + ':' + row.name;
        if (!localNames.has(key)) {
          localNames.add(key); // dedupe within this pull too
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

// ─── "Is there anything new in the cloud?" ─────────────────────────────────
// Answer it as "would a pull actually change anything on this device?", which is the
// only question the user cares about. Cloud-observed vs cloud-observed watermarks
// (see the note at the top) stop CLOCK drift, but not this device's OWN data: the
// page-leave uploads (visibilitychange / beforeunload) are cut off when the page goes
// away, so the server can have the row while the response — and therefore the "up"
// watermark — never comes back. The cloud's newest stamp then stays ahead of ours for
// good and the dialog fires every two minutes about a record already sitting here.
// Reproduced live: four local edits, four prompts, every one of them the device's own
// planner_axles row.
//
// So compare identity wherever identity exists. A per-record table is only "new" when
// it holds a uuid this device has never stored (or a newer stamp for one it has);
// single-row-per-user tables compare the cloud's stamp against the local store's own,
// which is the same test syncMedalRecords / syncCustomSkills use to choose a pull.
export interface CloudChange { table: string; label: string; ts: number }

const CHECK_TABLES: {
  table: string;
  label: string;
  col: string;
  /** Per-record tables also live locally, so identity can be compared. */
  local?: { dbName: string; storeName: string };
  /** Single-row-per-user tables carry their own stamp in local storage. */
  localStamp?: () => number;
}[] = [
  { table: 'calc_history', label: '伤害历史', col: 'timestamp', local: { dbName: 'hbr-calc-db', storeName: 'history' } },
  { table: 'planner_axles', label: '轴表记录', col: 'timestamp', local: { dbName: 'hbr-calc-db', storeName: 'planner_saves' } },
  { table: 'white_stats', label: '白值历史', col: 'timestamp', local: { dbName: 'hbr-white-stats', storeName: 'history' } },
  { table: 'medal_records', label: '进度记录', col: 'updated_at', localStamp: () => readMedalStore()?.updatedAt || 0 },
  { table: 'custom_skills', label: '技能库', col: 'updated_at', localStamp: () => parseInt(localStorage.getItem('hbr_skills_ts') || '0', 10) || 0 },
];

/** How many of the cloud's newest rows this device does not already hold. */
async function unmergedCloudRecords(
  table: string, col: string, userId: string, known: number,
  local: { dbName: string; storeName: string },
): Promise<{ newest: number; unmerged: number } | null> {
  // Newest first and bounded: anything at or below the watermark has been merged
  // already, so only the head of the list can hold something new.
  const { data } = await supabase.from(table)
    .select('uuid,' + col + ',deleted').eq('user_id', userId).order(col, { ascending: false }).limit(200);
  // Dynamic column list, so the library's row type cannot be expressed here.
  const rows = (data || []) as unknown as Record<string, unknown>[];
  if (!rows.length) return null;
  const newest = rows.reduce((m, r) => Math.max(m, Number(r[col]) || 0), 0);
  if (!newest || newest <= known) return { newest, unmerged: 0 };
  const db = await openDB(local.dbName, local.dbName === 'hbr-white-stats' ? 1 : 5).catch(() => null);
  const mine: any[] = db ? await db.getAll(local.storeName).catch(() => [] as any[]) : [];
  const byUuid = new Map(mine.map((e) => [e.uuid, e]));
  let unmerged = 0;
  for (const row of rows) {
    const ts = Number(row[col]) || 0;
    if (ts <= known) break; // ordered desc — the rest are already seen
    const existing: any = byUuid.get(row.uuid as string);
    if (!existing) { if (!row.deleted) unmerged++; continue; }
    if (row.deleted) { if (!existing.deleted) unmerged++; continue; }
    if (ts > Number(existing[col] || 0)) unmerged++;
  }
  return { newest, unmerged };
}

export async function checkCloudChanges(): Promise<CloudChange[]> {
  const out: CloudChange[] = [];
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return out;
    for (const t of CHECK_TABLES) {
      const known = Math.max(readStamp('down', user.id, t.table), readStamp('decl', user.id, t.table));
      if (t.local) {
        const r = await unmergedCloudRecords(t.table, t.col, user.id, known, t.local);
        if (!r) continue;
        // Nothing unmerged → declare the cloud's timeline seen and stay quiet. This is
        // what keeps an edit-then-upload cycle from re-prompting about our own record.
        if (r.unmerged > 0) out.push({ table: t.table, label: t.label, ts: r.newest });
        else writeStamp('down', user.id, t.table, r.newest);
        continue;
      }
      // Dynamic column name, so the library's row type cannot be expressed here.
      const { data } = await supabase.from(t.table).select(t.col).eq('user_id', user.id).order(t.col, { ascending: false }).limit(1);
      const ts = Number((data?.[0] as unknown as Record<string, unknown> | undefined)?.[t.col]) || 0;
      if (!ts || ts <= known) continue;
      const localTs = t.localStamp ? t.localStamp() : 0;
      if (ts > localTs) out.push({ table: t.table, label: t.label, ts });
      else writeStamp('down', user.id, t.table, ts);
    }
  } catch (e) { console.error('checkCloudChanges failed:', e); }
  return out;
}

/** The user answered "not now" — don't offer this same data again until it grows. */
export async function markCloudDeclined(changes: CloudChange[]): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    for (const c of changes) writeStamp('decl', user.id, c.table, c.ts);
  } catch { /* ignore */ }
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
