import { createClient } from '@supabase/supabase-js';

const URL = 'https://gxedvmpgpascpmkmsgof.supabase.co';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd4ZWR2bXBncGFzY3Bta21zZ29mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1NTM3NjEsImV4cCI6MjA5OTEyOTc2MX0.EhGdDPh58rSTuyrf7OiiwwKRcJU45CimMPxSgRFQ7oc';

export const supabase = createClient(URL, KEY, { auth: { autoRefreshToken: true, persistSession: true } });

/** Convert a username to an ASCII-safe Supabase email.
 *  Pure-ASCII names stay as-is (preserves existing accounts).
 *  Non-ASCII (Chinese) names are base64-encoded into the local part. */
export function toEmail(name: string) {
  const n = name.trim().toLowerCase();
  if (/^[a-z0-9._-]+$/.test(n)) return n + '@hbrcalc.dev';
  const bytes = new TextEncoder().encode(n);
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  const b64 = btoa(bin).replace(/[+/=]/g, '_');
  return b64 + '@hbrcalc.dev';
}

export async function authSignUp(username: string, password: string) {
  const { error } = await supabase.auth.signUp({
    email: toEmail(username), password,
    options: { data: { username: username.trim() } },
  });
  return error?.message || null;
}

export async function authSignIn(username: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email: toEmail(username), password });
  return error?.message || null;
}

export async function authSignOut() { await supabase.auth.signOut(); }
