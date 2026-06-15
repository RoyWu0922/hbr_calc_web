import type { DamageInput } from '../types';

/**
 * Encode a DamageInput to a URL-safe base64 string.
 * Uses TextEncoder → base64url (RFC 4648 §5, no padding).
 */
export function encodeShareData(input: DamageInput): string {
  const json = JSON.stringify(input);
  const bytes = new TextEncoder().encode(json);
  // Convert bytes to binary string for btoa
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Decode a URL-safe base64 string back to DamageInput.
 * Returns null on any parse error.
 */
export function decodeShareData(encoded: string): DamageInput | null {
  try {
    // Reverse base64url → standard base64
    let base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) base64 += '=';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const json = new TextDecoder().decode(bytes);
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
  // Remove any history-load related params
  url.hash = '';
  return url.toString();
}
