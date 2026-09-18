import crypto from 'node:crypto';
import fs from 'node:fs';
import bcrypt from 'bcryptjs';

let _secret = process.env.HBR_JWT_SECRET;
if (!_secret) {
  try {
    const env = fs.readFileSync(new URL('./.env', import.meta.url), 'utf8');
    const m = env.match(/^HBR_JWT_SECRET=(.+)$/m);
    if (m) _secret = m[1].trim();
  } catch { /* ignore */ }
}
export const JWT_SECRET = _secret || 'hbr-local-dev-secret-change-me';
const JWT_ALG = 'HS256';
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

// Mirrors frontend toEmail(): ASCII stays, non-ASCII (Chinese) is base64-encoded into local part.
export function toEmail(name) {
  const n = String(name).trim().toLowerCase();
  if (/^[a-z0-9._-]+$/.test(n)) return n + '@hbrcalc.dev';
  const b64 = Buffer.from(n, 'utf8').toString('base64').replace(/[+/=]/g, '_');
  return b64 + '@hbrcalc.dev';
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return 'scrypt:' + salt + ':' + hash;
}

export function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const parts = stored.split(':');
  if (parts[0] === 'scrypt') {
    const [, salt, hash] = parts;
    const calc = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(calc, 'hex'));
  }
  // Migrated Supabase bcrypt hashes ($2a$/$2b$/$2y$).
  if (/^\$(2[aby])\$/.test(stored)) {
    try { return bcrypt.compareSync(password, stored); } catch { return false; }
  }
  return false;
}

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlDecode = (s) => {
  let x = s.replace(/-/g, '+').replace(/_/g, '/');
  while (x.length % 4) x += '=';
  return Buffer.from(x, 'base64');
};

export function signToken(user) {
  const now = Date.now();
  const payload = {
    sub: user.id,
    role: 'authenticated',
    user_metadata: { username: user.username },
    iat: Math.floor(now / 1000),
    exp: Math.floor((now + TOKEN_TTL_MS) / 1000),
  };
  const h = b64url(JSON.stringify({ alg: JWT_ALG, typ: 'JWT' }));
  const p = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(h + '.' + p).digest('base64').replace(/[+/=]/g, '_');
  return h + '.' + p + '.' + sig;
}

export function verifyToken(token) {
  try {
    const [h, p, s] = String(token).split('.');
    if (!h || !p || !s) return null;
    const expected = crypto.createHmac('sha256', JWT_SECRET).update(h + '.' + p).digest('base64').replace(/[+/=]/g, '_');
    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(s))) return null;
    const payload = JSON.parse(b64urlDecode(p).toString('utf8'));
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
