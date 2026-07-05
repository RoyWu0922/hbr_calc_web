import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://otecjnudmkszqxbxkddv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im90ZWNqbnVkbWtzenF4YnhrZGR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyNjY0MzAsImV4cCI6MjA5ODg0MjQzMH0.-AngndLQx4Zw2DZGjjUS0juxjvog7Bc3od9ZwhSb5dQ';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: true, persistSession: true },
});

// ─── Auth helpers ──────────────────────────────────────────────

export async function signInWithGoogle() {
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  });
}

export async function signUp(email: string, password: string) {
  return supabase.auth.signUp({ email, password });
}

export async function signIn(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  return supabase.auth.signOut();
}

// ─── Data sync helpers ─────────────────────────────────────────
// Each table has: id (auto), user_id (uuid), data (jsonb), timestamp (bigint)
// Row-level security ensures users only see their own data

// Calc history
export async function fetchCalcHistory() {
  const { data } = await supabase.from('calc_history').select('*').order('timestamp', { ascending: false });
  return (data || []) as { id: number; data: any; timestamp: number }[];
}
export async function pushCalcHistory(entry: any) {
  const user = await supabase.auth.getUser();
  if (!user.data.user) return;
  return supabase.from('calc_history').insert({ user_id: user.data.user.id, data: entry, timestamp: entry.timestamp || Date.now() });
}

// Planner axles
export async function fetchPlannerAxles() {
  const { data } = await supabase.from('planner_axles').select('*').order('timestamp', { ascending: false });
  return (data || []) as { id: number; data: any; timestamp: number }[];
}
export async function pushPlannerAxle(entry: any) {
  const user = await supabase.auth.getUser();
  if (!user.data.user) return;
  return supabase.from('planner_axles').insert({ user_id: user.data.user.id, data: entry, timestamp: entry.timestamp || Date.now() });
}

// White stats
export async function fetchWhiteStats() {
  const { data } = await supabase.from('white_stats').select('*').order('timestamp', { ascending: false });
  return (data || []) as { id: number; data: any; timestamp: number }[];
}
export async function pushWhiteStats(entry: any) {
  const user = await supabase.auth.getUser();
  if (!user.data.user) return;
  return supabase.from('white_stats').insert({ user_id: user.data.user.id, data: entry, timestamp: entry.timestamp || Date.now() });
}

// Custom skills (key-value: skill name -> skill data)
export async function fetchCustomSkills() {
  const user = await supabase.auth.getUser();
  if (!user.data.user) return null;
  const { data } = await supabase.from('custom_skills').select('*').eq('user_id', user.data.user.id).single();
  return data ? (data.data as Record<string, any>) : null;
}
export async function pushCustomSkills(skills: Record<string, any>) {
  const user = await supabase.auth.getUser();
  if (!user.data.user) return;
  return supabase.from('custom_skills').upsert({ user_id: user.data.user.id, data: skills, updated_at: Date.now() });
}
