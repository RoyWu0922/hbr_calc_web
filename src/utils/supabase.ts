import { createClient } from '@supabase/supabase-js';

const URL = 'https://otecjnudmkszqxbxkddv.supabase.co';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im90ZWNqbnVkbWtzenF4YnhrZGR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyNjY0MzAsImV4cCI6MjA5ODg0MjQzMH0.-AngndLQx4Zw2DZGjjUS0juxjvog7Bc3od9ZwhSb5dQ';

export const supabase = createClient(URL, KEY, { auth: { autoRefreshToken: true, persistSession: true } });

export function toEmail(name: string) { return name.trim().toLowerCase() + '@hbrcalc.dev'; }

export async function authSignUp(username: string, password: string) {
  const { error } = await supabase.auth.signUp({ email: toEmail(username), password });
  return error?.message || null;
}

export async function authSignIn(username: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email: toEmail(username), password });
  return error?.message || null;
}

export async function authSignOut() { await supabase.auth.signOut(); }
