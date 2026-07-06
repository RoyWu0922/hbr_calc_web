import { supabase } from './supabase';
import { openDB, type DBSchema } from 'idb';
import type { CalcHistoryEntry } from '../types';

interface CloudSyncDB extends DBSchema {
  history: { key: number; value: CalcHistoryEntry; indexes: { timestamp: number } };
  planner_saves: { key: number; value: any; indexes: { timestamp: number } };
}

function getCalcDB() { return openDB<CloudSyncDB>('hbr-calc-db', 5); }

async function safeGetAll(table: string): Promise<any[]> {
  try { const db = await getCalcDB(); return await db.getAll(table as any); }
  catch { return []; }
}

async function safeGetAllWS(): Promise<any[]> {
  try {
    const db = await openDB<{ entries: { key: number; value: any; indexes: { timestamp: number } } }>('hbr-white-stats', 1);
    return await db.getAll('entries');
  } catch { return []; }
}

// ─── Push all local data to cloud on login ───────────────────

export async function pushLocalToCloud() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const uid = user.id;

  async function syncTable(table: string, localEntries: any[]) {
    if (localEntries.length === 0) return;
    const { data: cloud } = await supabase.from(table).select('timestamp').eq('user_id', uid);
    const cloudTs = new Set((cloud || []).map(r => r.timestamp));
    for (const entry of localEntries) {
      if (!cloudTs.has(entry.timestamp)) {
        await supabase.from(table).insert({ user_id: uid, data: entry, timestamp: entry.timestamp }).then(() => {}, () => {});
      }
    }
  }

  await syncTable('calc_history', await safeGetAll('history'));
  await syncTable('planner_axles', await safeGetAll('planner_saves'));
  await syncTable('white_stats', await safeGetAllWS());

  const data: Record<string, unknown> = {};
  for (const cat of ['buff', 'debuff', 'weakness'] as const) {
    data['skills_' + cat] = JSON.parse(localStorage.getItem('hbr-custom-skills-' + cat) || '[]');
    data['overrides_' + cat] = JSON.parse(localStorage.getItem('hbr-builtin-overrides-' + cat) || '{}');
  }
  await supabase.from('custom_skills').upsert({ user_id: uid, data, updated_at: Date.now() });
}

// ─── Pull cloud data into local on login ──────────────────────

export async function pullFromCloud() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  // Helper: safely write cloud rows to a store
  async function safeInsert(table: string, cloudRows: any[]) {
    if (!cloudRows || cloudRows.length === 0) return;
    try {
      const db = await getCalcDB();
      const local = await safeGetAll(table);
      const localTs = new Set(local.map(e => e.timestamp));
      const tx = db.transaction(table as any, 'readwrite');
      for (const row of cloudRows) {
        if (!localTs.has(row.timestamp)) {
          const copy = JSON.parse(JSON.stringify(row.data));
          delete copy.id;
          copy.timestamp = row.timestamp;
          await tx.store.add(copy);
        }
      }
      await tx.done;
    } catch { /* store missing, ignore */ }
  }

  try {
    const { data: cloudHistory } = await supabase.from('calc_history').select('*').eq('user_id', user.id).order('timestamp', { ascending: false });
    await safeInsert('history', cloudHistory || []);

    const { data: cloudAxles } = await supabase.from('planner_axles').select('*').eq('user_id', user.id).order('timestamp', { ascending: false });
    await safeInsert('planner_saves', cloudAxles || []);

    // White stats
    try {
      const { data: cloudWS } = await supabase.from('white_stats').select('*').eq('user_id', user.id).order('timestamp', { ascending: false });
      if (cloudWS && cloudWS.length > 0) {
        const local = await safeGetAllWS();
        const localTs = new Set(local.map(e => e.timestamp));
        const wsDb = await openDB<{ entries: { key: number; value: any; indexes: { timestamp: number } } }>('hbr-white-stats', 1);
        const tx = wsDb.transaction('entries', 'readwrite');
        for (const row of cloudWS) {
          if (!localTs.has(row.timestamp)) {
            const copy = JSON.parse(JSON.stringify(row.data));
            delete copy.id;
            copy.timestamp = row.timestamp;
            await tx.store.add(copy);
          }
        }
        await tx.done;
      }
    } catch { /* DB may not exist */ }

    // Custom skills
    const { data: cloudSkills } = await supabase.from('custom_skills').select('*').eq('user_id', user.id).maybeSingle();
    if (cloudSkills?.data) {
      for (const cat of ['buff', 'debuff', 'weakness'] as const) {
        const skills = cloudSkills.data['skills_' + cat];
        const overrides = cloudSkills.data['overrides_' + cat];
        if (skills) localStorage.setItem('hbr-custom-skills-' + cat, JSON.stringify(skills));
        if (overrides) localStorage.setItem('hbr-builtin-overrides-' + cat, JSON.stringify(overrides));
      }
    }
  } catch (e) {
    console.error('Cloud sync pull failed', e);
  }
}
