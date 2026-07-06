import { supabase } from './supabase';
import { openDB, type DBSchema } from 'idb';
import type { CalcHistoryEntry } from '../types';

interface CloudSyncDB extends DBSchema {
  history: { key: number; value: CalcHistoryEntry; indexes: { timestamp: number } };
  planner_saves: { key: number; value: any; indexes: { timestamp: number } };
}

function getCalcDB() { return openDB<CloudSyncDB>('hbr-calc-db', 5); }
function getWSDB() { return openDB<{ entries: { key: number; value: any; indexes: { timestamp: number } } }>('hbr-white-stats', 1); }

// ─── Full sync on login ──────────────────────────────────────

export async function syncOnLogin() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const uid = user.id;

  // Push local entries not in cloud
  const db = await getCalcDB();
  const wsDb = await getWSDB();
  const localHistory = await db.getAll('history').catch(() => [] as CalcHistoryEntry[]);
  const localAxles = await db.getAll('planner_saves').catch(() => [] as any[]);
  const localWS = await wsDb.getAll('entries').catch(() => [] as any[]);

  // Push history
  if (localHistory.length > 0) {
    const { data: cloud } = await supabase.from('calc_history').select('timestamp').eq('user_id', uid);
    const cloudTs = new Set((cloud || []).map(r => r.timestamp));
    for (const entry of localHistory) {
      const ts = entry.timestamp || 0;
      if (!cloudTs.has(ts)) await supabase.from('calc_history').insert({ user_id: uid, data: entry, timestamp: ts });
    }
  }
  // Push axles
  if (localAxles.length > 0) {
    const { data: cloud } = await supabase.from('planner_axles').select('timestamp').eq('user_id', uid);
    const cloudTs = new Set((cloud || []).map(r => r.timestamp));
    for (const a of localAxles) {
      const ts = a.timestamp || 0;
      if (!cloudTs.has(ts)) await supabase.from('planner_axles').insert({ user_id: uid, data: a, timestamp: ts });
    }
  }
  // Push white stats
  if (localWS.length > 0) {
    const { data: cloud } = await supabase.from('white_stats').select('timestamp').eq('user_id', uid);
    const cloudTs = new Set((cloud || []).map(r => r.timestamp));
    for (const w of localWS) {
      const ts = w.timestamp || 0;
      if (!cloudTs.has(ts)) await supabase.from('white_stats').insert({ user_id: uid, data: w, timestamp: ts });
    }
  }
  // Custom skills
  const skillsData: Record<string, unknown> = {};
  for (const cat of ['buff', 'debuff', 'weakness'] as const) {
    skillsData['skills_' + cat] = JSON.parse(localStorage.getItem('hbr-custom-skills-' + cat) || '[]');
    skillsData['overrides_' + cat] = JSON.parse(localStorage.getItem('hbr-builtin-overrides-' + cat) || '{}');
  }
  await supabase.from('custom_skills').upsert({ user_id: uid, data: skillsData, updated_at: Date.now() });

  // Pull all cloud data
  await pullHistory();
  await pullAxles();
  await pullWhiteStats();
  await pullCustomSkills();
}

// ─── Pull functions — call from any component to refresh ─────

export async function pullHistory() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { data: cloud } = await supabase.from('calc_history').select('*').eq('user_id', user.id).order('timestamp', { ascending: false });
  if (!cloud || cloud.length === 0) return;
  const db = await getCalcDB();
  const local = await db.getAll('history').catch(() => [] as CalcHistoryEntry[]);
  const localTs = new Set(local.map(e => e.timestamp));
  const tx = db.transaction('history', 'readwrite');
  for (const row of cloud) {
    if (!localTs.has(row.timestamp)) {
      const entry = { ...row.data, timestamp: row.timestamp };
      delete entry.id;
      await tx.store.add(entry);
    }
  }
  await tx.done;
}

export async function pullAxles() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { data: cloud } = await supabase.from('planner_axles').select('*').eq('user_id', user.id).order('timestamp', { ascending: false });
  if (!cloud || cloud.length === 0) return;
  const db = await getCalcDB();
  const local = await db.getAll('planner_saves').catch(() => [] as any[]);
  const localTs = new Set(local.map(e => e.timestamp));
  const tx = db.transaction('planner_saves', 'readwrite');
  for (const row of cloud) {
    if (!localTs.has(row.timestamp)) {
      const entry = { ...row.data, timestamp: row.timestamp };
      delete entry.id;
      await tx.store.add(entry);
    }
  }
  await tx.done;
}

export async function pullWhiteStats() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { data: cloud } = await supabase.from('white_stats').select('*').eq('user_id', user.id).order('timestamp', { ascending: false });
  if (!cloud || cloud.length === 0) return;
  const wsDb = await getWSDB();
  const local = await wsDb.getAll('entries').catch(() => [] as any[]);
  const localTs = new Set(local.map(e => e.timestamp));
  const tx = wsDb.transaction('entries', 'readwrite');
  for (const row of cloud) {
    if (!localTs.has(row.timestamp)) {
      const entry = { ...row.data, timestamp: row.timestamp };
      delete entry.id;
      await tx.store.add(entry);
    }
  }
  await tx.done;
}

export async function pullCustomSkills() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { data: cloud } = await supabase.from('custom_skills').select('*').eq('user_id', user.id).maybeSingle();
  if (cloud?.data) {
    for (const cat of ['buff', 'debuff', 'weakness'] as const) {
      const s = cloud.data['skills_' + cat];
      const o = cloud.data['overrides_' + cat];
      if (s) localStorage.setItem('hbr-custom-skills-' + cat, JSON.stringify(s));
      if (o) localStorage.setItem('hbr-builtin-overrides-' + cat, JSON.stringify(o));
    }
  }
}
