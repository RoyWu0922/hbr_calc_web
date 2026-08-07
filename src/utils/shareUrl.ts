import { compressToBase64, decompressFromBase64 } from 'lz-string';
import type { DamageInput } from '../types';

// Compressed codes carry this prefix; legacy (uncompressed) codes don't.
const COMPRESS_PREFIX = 'z1';

function toBase64Url(s: string): string {
  return s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): string {
  let base64 = s.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  return base64;
}

/** base64url of a raw string (UTF-8 bytes) — used by legacy codes. */
function rawToBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return toBase64Url(btoa(binary));
}

/** Decode a legacy base64url string back to its original UTF-8 text. */
function rawFromBase64Url(s: string): string {
  const binary = atob(fromBase64Url(s));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/**
 * Encode a DamageInput to a short, URL-safe string.
 *
 * JSON → lz-string (compressToBase64) → base64url, prefixed with "z1".
 * We keep the compressed form only when it's actually shorter than the raw
 * base64url (tiny configs compress poorly), otherwise fall back to the raw
 * encoding. Legacy codes (no "z1" prefix) still decode.
 */
export function encodeShareData(input: DamageInput): string {
  const json = JSON.stringify(input);
  const encoded = COMPRESS_PREFIX + toBase64Url(compressToBase64(json));
  if (encoded.length < rawToBase64Url(json).length) return encoded;
  return rawToBase64Url(json);
}

/**
 * Decode a share string back to DamageInput. Handles both compressed ("z1")
 * and legacy uncompressed codes. Returns null on any error.
 */
export function decodeShareData(encoded: string): DamageInput | null {
  try {
    const json = encoded.startsWith(COMPRESS_PREFIX)
      ? decompressFromBase64(fromBase64Url(encoded.slice(COMPRESS_PREFIX.length)))
      : rawFromBase64Url(encoded);
    if (!json) return null;
    return JSON.parse(json) as DamageInput;
  } catch {
    return null;
  }
}

/**
 * Build a full share URL from the current location and encoded data.
 */
export function buildShareUrl(input: DamageInput): string {
  const encoded = encodeShareData(input);
  const url = new URL(window.location.href);
  url.searchParams.set('share', encoded);
  url.hash = '';
  return url.toString();
}
