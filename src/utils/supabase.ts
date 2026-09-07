import type { Session, User } from '@supabase/supabase-js';

const base = (() => {
  if (import.meta.env.VITE_SUPABASE_URL) return import.meta.env.VITE_SUPABASE_URL;
  // Same-origin by default: the reverse proxy (Caddy) serves the SPA and proxies
  // /api/* to the local SQLite backend, so no mixed-content / CORS issues.
  if (typeof location !== 'undefined' && location.origin) return location.origin;
  return 'http://127.0.0.1:8123';
})();
const BASE = base;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'local';

const SESSION_KEY = 'hbr_local_session';
let session: any = null;
try { session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { session = null; }

const listeners: ((event: string, session: any) => void)[] = [];
function setSession(s: any) {
  session = s;
  try { s ? localStorage.setItem(SESSION_KEY, JSON.stringify(s)) : localStorage.removeItem(SESSION_KEY); }
  catch { /* ignore */ }
}
function emit(event: string, s: any) { setSession(s); listeners.slice().forEach((l) => l(event, s)); }

async function call(method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session?.access_token) headers.Authorization = 'Bearer ' + session.access_token;
  let res: Response;
  try {
    res = await fetch(BASE + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch (e) {
    return { data: null, error: { message: 'network: ' + ((e as Error).message || 'unreachable') } };
  }
  let j: any = {};
  try { j = await res.json(); } catch { /* ignore */ }
  return { data: j.data ?? null, error: j.error ? { message: typeof j.error === 'string' ? j.error : j.error.message } : null };
}

/** Mirrors the original toEmail end-to-end so emails stay intact across clients. */
export function toEmail(name: string) {
  const n = name.trim().toLowerCase();
  if (/^[a-z0-9._-]+$/.test(n)) return n + '@hbrcalc.dev';
  const b64 = btoa(unescape(encodeURIComponent(n))).replace(/[+/=]/g, '_');
  return b64 + '@hbrcalc.dev';
}

function usernameFromEmail(email: string) {
  const local = email.split('@')[0];
  if (/^[a-z0-9._-]+$/.test(local)) return local;
  try { return decodeURIComponent(escape(atob(local.replace(/_/g, '+').replace(/-/g, '/')))); } catch { return local; }
}

// ── QueryBuilder (thenable, supabase-js compatible) ─────────────────────────
class QueryBuilder {
  table: string;
  filters: Record<string, unknown> = {};
  orderBy: string | null = null;
  orderAsc = true;
  limitV: number | null = null;
  singleV = false;
  method = 'GET';
  mode = 'insert';
  onConflict = 'id';
  cols = '*';
  body: any = null;

  constructor(table: string) { this.table = table; }
  select(cols = '*') { this.method = 'GET'; this.cols = cols; return this; }
  insert(row: any) { this.method = 'POST'; this.mode = 'insert'; this.body = row; return this; }
  upsert(row: any, opts?: { onConflict?: string }) { this.method = 'POST'; this.mode = 'upsert'; this.onConflict = opts?.onConflict || 'id'; this.body = row; return this; }
  update(row: any) { this.method = 'PATCH'; this.body = row; return this; }
  delete() { this.method = 'DELETE'; return this; }
  eq(col: string, value: unknown) { this.filters[col] = value; return this; }
  order(col: string, o?: { ascending?: boolean }) { this.orderBy = col; this.orderAsc = o?.ascending !== false; return this; }
  limit(n: number) { this.limitV = n; return this; }
  maybeSingle() { this.singleV = true; return this; }
  single() { this.singleV = true; return this; }
  then<TResult1 = { data: unknown; error: { message: string } | { message: string } | null }, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.exec().then(onfulfilled, onrejected);
  }
  async exec() {
    if (this.method === 'GET') {
      const params = new URLSearchParams();
      if (this.cols && this.cols !== '*') params.set('cols', this.cols);
      const fq = JSON.stringify(this.filters);
      if (fq !== '{}') params.set('filters', fq);
      if (this.orderBy) { params.set('order', this.orderBy); params.set('asc', this.orderAsc ? '1' : '0'); }
      if (this.limitV != null) params.set('limit', String(this.limitV));
      if (this.singleV) params.set('single', '1');
      return call('GET', `/api/data/${this.table}?` + params.toString());
    }
    if (this.method === 'POST') {
      return call('POST', `/api/data/${this.table}?mode=${this.mode}&onConflict=${this.onConflict}`, this.body);
    }
    if (this.method === 'PATCH') {
      const params = new URLSearchParams();
      const fq = JSON.stringify(this.filters);
      if (fq !== '{}') params.set('filters', fq);
      return call('PATCH', `/api/data/${this.table}?` + params.toString(), this.body);
    }
    if (this.method === 'DELETE') {
      const params = new URLSearchParams();
      const fq = JSON.stringify(this.filters);
      if (fq !== '{}') params.set('filters', fq);
      return call('DELETE', `/api/data/${this.table}?` + params.toString());
    }
    return { data: null, error: { message: 'unknown op' } };
  }
}

// ── Auth ────────────────────────────────────────────────────────────────────
const auth = {
  async signUp(args: { email: string; password: string; options?: { data?: { username?: string } } }) {
    const username = (args.options?.data?.username || usernameFromEmail(args.email)).trim();
    if (!username) return { error: { message: 'missing username' } };
    const r = await call('POST', '/api/auth/signup', { username, password: args.password });
    if (r.error) return { error: r.error };
    emit('SIGNED_IN', { access_token: (r.data as any).token, user: (r.data as any).user });
    return { error: null };
  },
  async signInWithPassword(args: { email: string; password: string }) {
    const r = await call('POST', '/api/auth/signin', { email: args.email, password: args.password });
    if (r.error) return { error: r.error };
    emit('SIGNED_IN', { access_token: (r.data as any).token, user: (r.data as any).user });
    return { error: null };
  },
  async signOut() {
    await call('POST', '/api/auth/signout');
    emit('SIGNED_OUT', null);
  },
  async getSession() {
    return { data: { session }, error: null };
  },
  onAuthStateChange(cb: (event: string, session: any) => void) {
    const l = cb;
    listeners.push(l);
    return { data: { subscription: { unsubscribe: () => { const i = listeners.indexOf(l); if (i >= 0) listeners.splice(i, 1); } } } };
  },
  async getUser() {
    const r = await call('GET', '/api/auth/user');
    return { data: { user: r.data?.user ?? null }, error: r.error };
  },
};

// ── from(table) ─────────────────────────────────────────────────────────────
function from(table: string) { return new QueryBuilder(table); }

// ── rpc ─────────────────────────────────────────────────────────────────────
function rpc(fn: string, params: Record<string, unknown>) {
  if (fn === 'toggle_guide_like') return call('POST', '/api/rpc/toggle_guide_like', params);
  return Promise.resolve({ data: null, error: { message: 'unknown rpc: ' + fn } });
}

export const supabase = { auth, from, rpc };
export const SUPABASE_URL = BASE;
export const SUPABASE_ANON_KEY = KEY;

export async function authSignUp(username: string, password: string) {
  const { error } = await supabase.auth.signUp({ email: toEmail(username), password, options: { data: { username: username.trim() } } });
  return error?.message || null;
}
export async function authSignIn(username: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email: toEmail(username), password });
  return error?.message || null;
}
export async function authSignOut() { await supabase.auth.signOut(); }

export type { Session, User };
