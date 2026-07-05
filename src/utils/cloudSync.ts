import { supabase } from './supabase';
import { openDB } from 'idb';
import type { CalcHistoryEntry } from '../types';

// ─── Push all local data to cloud on login ───────────────────

export async function pushLocalToCloud() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  // 1) Calc history
  const db1 = await openDB<{ history: { key: number; value: CalcHistoryEntry; indexes: { timestamp: number } } }>('hbr-calc-db', 5);
  const localHistory = await db1.getAll('history');
  for (const entry of localHistory) {
    await supabase.from('calc_history').upsert({
      user_id: user.id, data: entry, timestamp: entry.timestamp
    }, { onConflict: 'user_id, timestamp' }).then(() => {}, () => {});
  }

  // 2) Planner axles
  const localAxles = await db1.getAll('planner_saves') as any[];
  for (const axle of localAxles) {
    await supabase.from('planner_axles').upsert({
      user_id: user.id, data: axle, timestamp: axle.timestamp
    }, { onConflict: 'user_id, timestamp' }).then(() => {}, () => {});
  }

  // 3) White stats
  const db2 = await openDB<{ entries: { key: number; value: any; indexes: { timestamp: number } } }>('hbr-white-stats', 1);
  const localWS = await db2.getAll('entries');
  for (const entry of localWS) {
    await supabase.from('white_stats').upsert({
      user_id: user.id, data: entry, timestamp: entry.timestamp
    }, { onConflict: 'user_id, timestamp' }).then(() => {}, () => {});
  }

  // 4) Custom skills (from localStorage)
  const data: Record<string, unknown> = {};
  for (const cat of ['buff', 'debuff', 'weakness'] as const) {
    data['skills_' + cat] = JSON.parse(localStorage.getItem('hbr-custom-skills-' + cat) || '[]');
    data['overrides_' + cat] = JSON.parse(localStorage.getItem('hbr-builtin-overrides-' + cat) || '{}');
  }
  await supabase.from('custom_skills').upsert({ user_id: user.id, data, updated_at: Date.now() }).then(() => {}, () => {});
}

// ─── Pull cloud data into local on login ──────────────────────

export async function pullFromCloud() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  try {
    // 1) Calc history
    const { data: cloudHistory } = await supabase.from('calc_history').select('*').order('timestamp', { ascending: false });
    if (cloudHistory && cloudHistory.length > 0) {
      const db = await openDB<{ history: { key: number; value: CalcHistoryEntry; indexes: { timestamp: number } } }>('hbr-calc-db', 5);
      const local = await db.getAll('history');
      const localTs = new Set(local.map(e => e.timestamp));
      const tx = db.transaction('history', 'readwrite');
      for (const row of cloudHistory) {
        const entry = row.data as CalcHistoryEntry;
        entry.timestamp = row.timestamp;
        if (!localTs.has(row.timestamp)) {
          delete (entry as any).id;
          await tx.store.add(entry);
        }
      }
      await tx.done;
    }

    // 2) Planner axles
    const { data: cloudAxles } = await supabase.from('planner_axles').select('*').order('timestamp', { ascending: false });
    if (cloudAxles && cloudAxles.length > 0) {
      const db = await openDB<{ planner_saves: { key: number; value: any; indexes: { timestamp: number } } }>('hbr-calc-db', 5);
      const local = await db.getAll('planner_saves');
      const localTs = new Set(local.map(e => e.timestamp));
      const tx = db.transaction('planner_saves', 'readwrite');
      for (const row of cloudAxles) {
        if (!localTs.has(row.timestamp)) {
          await tx.store.add({ ...row.data, timestamp: row.timestamp });
        }
      }
      await tx.done;
    }

    // 3) White stats
    const { data: cloudWS } = await supabase.from('white_stats').select('*').order('timestamp', { ascending: false });
    if (cloudWS && cloudWS.length > 0) {
      const db = await openDB<{ entries: { key: number; value: any; indexes: { timestamp: number } } }>('hbr-white-stats', 1);
      const local = await db.getAll('entries');
      const localTs = new Set(local.map(e => e.timestamp));
      const tx = db.transaction('entries', 'readwrite');
      for (const row of cloudWS) {
        if (!localTs.has(row.timestamp)) {
          delete row.data.id;
          await tx.store.add({ ...row.data, timestamp: row.timestamp });
        }
      }
      await tx.done;
    }

    // 4) Custom skills
    const { data: cloudSkills } = await supabase.from('custom_skills').select('*').eq('user_id', user.id).single();
    if (cloudSkills?.data) {
      for (const cat of ['buff', 'debuff', 'weakness'] as const) {
        const skills = cloudSkills.data['skills_' + cat];
        const overrides = cloudSkills.data['overrides_' + cat];
        if (skills && Array.isArray(skills)) {
          localStorage.setItem('hbr-custom-skills-' + cat, JSON.stringify(skills));
        }
        if (overrides && typeof overrides === 'object') {
          localStorage.setItem('hbr-builtin-overrides-' + cat, JSON.stringify(overrides));
        }
      }
    }
  } catch (e) {
    console.error('Cloud sync pull failed', e);
  }
}
