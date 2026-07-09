import { createClient } from '@supabase/supabase-js';

const URL = 'https://gxedvmpgpascpmkmsgof.supabase.co';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd4ZWR2bXBncGFzY3Bta21zZ29mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1NTM3NjEsImV4cCI6MjA5OTEyOTc2MX0.EhGdDPh58rSTuyrf7OiiwwKRcJU45CimMPxSgRFQ7oc';

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
