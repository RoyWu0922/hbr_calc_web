import { supabase } from './supabase';
import { openDB, type DBSchema } from 'idb';
import type { CalcHistoryEntry } from '../types';

interface CloudSyncDB extends DBSchema {
  history: { key: number; value: CalcHistoryEntry; indexes: { timestamp: number } };
  planner_saves: { key: number; value: any; indexes: { timestamp: number } };
}

function getCalcDB() { return openDB<CloudSyncDB>('hbr-calc-db', 5); }
function getWSDB() { return openDB<{ entries: { key: number; value: any; indexes: { timestamp: number } } }>('hbr-white-stats', 1); }

// ─── Sync on login: local → cloud → clear local → pull cloud → local ──

export async function syncOnLogin() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const uid = user.id;

  try {
    // 1) Push all local entries to cloud (only new ones)
    const db = await getCalcDB();
    const wsDb = await getWSDB();

    // Push history
    const localHistory = await db.getAll('history').catch(() => [] as CalcHistoryEntry[]);
    if (localHistory.length > 0) {
      const { data: cloud } = await supabase.from('calc_history').select('timestamp').eq('user_id', uid);
      const cloudTs = new Set((cloud || []).map(r => r.timestamp));
      for (const entry of localHistory) {
        if (!cloudTs.has(entry.timestamp || 0)) {
          await supabase.from('calc_history').insert({ user_id: uid, data: entry, timestamp: entry.timestamp || Date.now() });
        }
      }
    }

    // Push axles
    const localAxles = await db.getAll('planner_saves').catch(() => [] as any[]);
    if (localAxles.length > 0) {
      const { data: cloud } = await supabase.from('planner_axles').select('timestamp').eq('user_id', uid);
      const cloudTs = new Set((cloud || []).map(r => r.timestamp));
      for (const a of localAxles) {
        if (!cloudTs.has(a.timestamp || 0)) {
          await supabase.from('planner_axles').insert({ user_id: uid, data: a, timestamp: a.timestamp || Date.now() });
        }
      }
    }

    // Push white stats
    const localWS = await wsDb.getAll('entries').catch(() => [] as any[]);
    if (localWS.length > 0) {
      const { data: cloud } = await supabase.from('white_stats').select('timestamp').eq('user_id', uid);
      const cloudTs = new Set((cloud || []).map(r => r.timestamp));
      for (const w of localWS) {
        if (!cloudTs.has(w.timestamp || 0)) {
          await supabase.from('white_stats').insert({ user_id: uid, data: w, timestamp: w.timestamp || Date.now() });
        }
      }
    }

    // Push custom skills
    const skillsData: Record<string, unknown> = {};
    for (const cat of ['buff', 'debuff', 'weakness'] as const) {
      skillsData['skills_' + cat] = JSON.parse(localStorage.getItem('hbr-custom-skills-' + cat) || '[]');
      skillsData['overrides_' + cat] = JSON.parse(localStorage.getItem('hbr-builtin-overrides-' + cat) || '{}');
    }
    await supabase.from('custom_skills').upsert({ user_id: uid, data: skillsData, updated_at: Date.now() });

    // 2) Clear local IndexedDB
    await db.clear('history');
    await db.clear('planner_saves');
    await wsDb.clear('entries');

    // 3) Pull all cloud data into local
    // History
    const { data: cloudHistory } = await supabase.from('calc_history').select('*').eq('user_id', uid).order('timestamp', { ascending: false });
    if (cloudHistory && cloudHistory.length > 0) {
      const tx = db.transaction('history', 'readwrite');
      for (const row of cloudHistory) {
        const entry = { ...row.data, timestamp: row.timestamp };
        delete entry.id;
        await tx.store.add(entry);
      }
      await tx.done;
    }

    // Axles
    const { data: cloudAxles } = await supabase.from('planner_axles').select('*').eq('user_id', uid).order('timestamp', { ascending: false });
    if (cloudAxles && cloudAxles.length > 0) {
      const tx = db.transaction('planner_saves', 'readwrite');
      for (const row of cloudAxles) {
        const entry = { ...row.data, timestamp: row.timestamp };
        delete entry.id;
        await tx.store.add(entry);
      }
      await tx.done;
    }

    // White stats
    const { data: cloudWS } = await supabase.from('white_stats').select('*').eq('user_id', uid).order('timestamp', { ascending: false });
    if (cloudWS && cloudWS.length > 0) {
      const tx = wsDb.transaction('entries', 'readwrite');
      for (const row of cloudWS) {
        const entry = { ...row.data, timestamp: row.timestamp };
        delete entry.id;
        await tx.store.add(entry);
      }
      await tx.done;
    }

    // Custom skills
    const { data: cloudSkills } = await supabase.from('custom_skills').select('*').eq('user_id', uid).maybeSingle();
    if (cloudSkills?.data) {
      for (const cat of ['buff', 'debuff', 'weakness'] as const) {
        if (cloudSkills.data['skills_' + cat]) localStorage.setItem('hbr-custom-skills-' + cat, JSON.stringify(cloudSkills.data['skills_' + cat]));
        if (cloudSkills.data['overrides_' + cat]) localStorage.setItem('hbr-builtin-overrides-' + cat, JSON.stringify(cloudSkills.data['overrides_' + cat]));
      }
    }
  } catch (e) {
    console.error('Sync failed', e);
  }
}
