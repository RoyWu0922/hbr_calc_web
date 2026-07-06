import { supabase } from './supabase';
import { openDB, type DBSchema } from 'idb';
import type { CalcHistoryEntry } from '../types';

interface CloudSyncDB extends DBSchema {
  history: { key: number; value: CalcHistoryEntry; indexes: { timestamp: number } };
  planner_saves: { key: number; value: any; indexes: { timestamp: number } };
}

function getCalcDB() { return openDB<CloudSyncDB>('hbr-calc-db', 5); }
function getWSDB() { return openDB<{ entries: { key: number; value: any; indexes: { timestamp: number } } }>('hbr-white-stats', 1); }

// ─── Sync on login: push new local entries, then pull missing cloud entries ──

export async function syncOnLogin() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const uid = user.id;

  // ─── 1) Push: upload local entries that aren't in cloud yet ─────
  // History
  const db = await getCalcDB();
  const localHistory = await db.getAll('history').catch(() => [] as CalcHistoryEntry[]);
  if (localHistory.length > 0) {
    const { data: cloud } = await supabase.from('calc_history').select('timestamp').eq('user_id', uid);
    const cloudTs = new Set((cloud || []).map(r => r.timestamp));
    for (const entry of localHistory) {
      const ts = entry.timestamp || 0;
      if (!cloudTs.has(ts)) {
        await supabase.from('calc_history').insert({ user_id: uid, data: entry, timestamp: ts });
      }
    }
  }

  // Planner axles
  const localAxles = await db.getAll('planner_saves').catch(() => [] as any[]);
  if (localAxles.length > 0) {
    const { data: cloud } = await supabase.from('planner_axles').select('timestamp').eq('user_id', uid);
    const cloudTs = new Set((cloud || []).map(r => r.timestamp));
    for (const a of localAxles) {
      const ts = a.timestamp || 0;
      if (!cloudTs.has(ts)) {
        await supabase.from('planner_axles').insert({ user_id: uid, data: a, timestamp: ts });
      }
    }
  }

  // White stats
  const wsDb = await getWSDB();
  const localWS = await wsDb.getAll('entries').catch(() => [] as any[]);
  if (localWS.length > 0) {
    const { data: cloud } = await supabase.from('white_stats').select('timestamp').eq('user_id', uid);
    const cloudTs = new Set((cloud || []).map(r => r.timestamp));
    for (const w of localWS) {
      const ts = w.timestamp || 0;
      if (!cloudTs.has(ts)) {
        await supabase.from('white_stats').insert({ user_id: uid, data: w, timestamp: ts });
      }
    }
  }

  // Custom skills
  const skillsData: Record<string, unknown> = {};
  for (const cat of ['buff', 'debuff', 'weakness'] as const) {
    skillsData['skills_' + cat] = JSON.parse(localStorage.getItem('hbr-custom-skills-' + cat) || '[]');
    skillsData['overrides_' + cat] = JSON.parse(localStorage.getItem('hbr-builtin-overrides-' + cat) || '{}');
  }
  await supabase.from('custom_skills').upsert({ user_id: uid, data: skillsData, updated_at: Date.now() });

  // ─── 2) Pull: fetch cloud entries not yet in local ──────────────
  // History
  const { data: cloudHistory, error: hErr } = await supabase.from('calc_history').select('*').eq('user_id', uid).order('timestamp', { ascending: false });
  if (!hErr && cloudHistory && cloudHistory.length > 0) {
    const localTs = new Set(localHistory.map(e => e.timestamp));
    const tx = db.transaction('history', 'readwrite');
    for (const row of cloudHistory) {
      if (!localTs.has(row.timestamp)) {
        const entry = { ...row.data, timestamp: row.timestamp };
        delete entry.id;
        await tx.store.add(entry);
      }
    }
    await tx.done;
  }

  // Axles
  const { data: cloudAxles, error: aErr } = await supabase.from('planner_axles').select('*').eq('user_id', uid).order('timestamp', { ascending: false });
  if (!aErr && cloudAxles && cloudAxles.length > 0) {
    const localTs = new Set(localAxles.map(e => e.timestamp));
    const tx = db.transaction('planner_saves', 'readwrite');
    for (const row of cloudAxles) {
      if (!localTs.has(row.timestamp)) {
        const entry = { ...row.data, timestamp: row.timestamp };
        delete entry.id;
        await tx.store.add(entry);
      }
    }
    await tx.done;
  }

  // White stats
  const { data: cloudWS, error: wErr } = await supabase.from('white_stats').select('*').eq('user_id', uid).order('timestamp', { ascending: false });
  if (!wErr && cloudWS && cloudWS.length > 0) {
    const localTs = new Set(localWS.map(e => e.timestamp));
    const tx = wsDb.transaction('entries', 'readwrite');
    for (const row of cloudWS) {
      if (!localTs.has(row.timestamp)) {
        const entry = { ...row.data, timestamp: row.timestamp };
        delete entry.id;
        await tx.store.add(entry);
      }
    }
    await tx.done;
  }

  // Custom skills
  const { data: cloudSkills } = await supabase.from('custom_skills').select('*').eq('user_id', uid).maybeSingle();
  if (cloudSkills?.data) {
    for (const cat of ['buff', 'debuff', 'weakness'] as const) {
      const s = cloudSkills.data['skills_' + cat];
      const o = cloudSkills.data['overrides_' + cat];
      if (s) localStorage.setItem('hbr-custom-skills-' + cat, JSON.stringify(s));
      if (o) localStorage.setItem('hbr-builtin-overrides-' + cat, JSON.stringify(o));
    }
  }
}
