import { supabase, fetchCalcHistory, fetchPlannerAxles, fetchWhiteStats, fetchCustomSkills } from './supabase';
import { openDB } from 'idb';
import type { DBSchema } from 'idb';
import type { CalcHistoryEntry, Folder, PresetTemplate } from '../types';

// ─── Pull cloud data into local IndexedDB on login ─────────────

export async function pullFromCloud() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  try {
    // 1) Calc history
    const cloudHistory = await fetchCalcHistory();
    if (cloudHistory.length > 0) {
      const db = await openDB<{
        history: { key: number; value: CalcHistoryEntry; indexes: { timestamp: number } };
      }>('hbr-calc-db', 5);
      const local = await db.getAll('history');
      const localIds = new Set(local.map(e => e.timestamp));
      const tx = db.transaction('history', 'readwrite');
      for (const row of cloudHistory) {
        const entry = row.data as CalcHistoryEntry;
        entry.timestamp = row.timestamp;
        // Only add if not already present (match by timestamp)
        if (!localIds.has(row.timestamp)) {
          delete (entry as any).id;
          await tx.store.add(entry);
        }
      }
      await tx.done;
    }

    // 2) Planner axles
    const cloudAxles = await fetchPlannerAxles();
    if (cloudAxles.length > 0) {
      const db = await openDB<{
        planner_saves: { key: number; value: any; indexes: { timestamp: number } };
      }>('hbr-calc-db', 5);
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
    const cloudWS = await fetchWhiteStats();
    if (cloudWS.length > 0) {
      const db = await openDB<{
        white_stats: { key: number; value: any; indexes: { timestamp: number } };
      }>('hbr-calc-db', 5);
      const local = await db.getAll('white_stats');
      const localTs = new Set(local.map(e => e.timestamp));
      const tx = db.transaction('white_stats', 'readwrite');
      for (const row of cloudWS) {
        if (!localTs.has(row.timestamp)) {
          await tx.store.add({ ...row.data, timestamp: row.timestamp });
        }
      }
      await tx.done;
    }

    // 4) Custom skills — write to localStorage
    const cloudSkills = await fetchCustomSkills();
    if (cloudSkills) {
      for (const cat of ['buff', 'debuff', 'weakness'] as const) {
        const skills = cloudSkills['skills_' + cat];
        const overrides = cloudSkills['overrides_' + cat];
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
