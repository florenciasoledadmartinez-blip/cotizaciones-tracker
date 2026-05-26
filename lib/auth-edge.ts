import { NextRequest } from 'next/server';

export const COOKIE_NAME = 'auth_token';

export interface JWTPayload {
  userId: number;
  email: string;
  role: 'admin' | 'leader' | 'operator';
  name: string;
  exp?: number;
  iat?: number;
}

export function getTokenFromRequest(req: NextRequest): string | null {
  return req.cookies.get(COOKIE_NAME)?.value ?? null;
}

function base64urlDecode(str: string): Uint8Array<ArrayBuffer> {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, '=');
  const binary = atob(padded);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Verifies a JWT signed with HS256 using Web Crypto API.
 * Works in Edge Runtime (no Node.js dependencies).
 * Compatible with tokens produced by jsonwebtoken (same algorithm/format).
 */
export async function verifyTokenEdge(token: string): Promise<JWTPayload | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, sigB64] = parts;
    const secret = process.env.JWT_SECRET || 'cotizaciones-secret-key-2024-change-in-production';

    const keyData = new TextEncoder().encode(secret);
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const signature = base64urlDecode(sigB64);

    const valid = await crypto.subtle.verify('HMAC', cryptoKey, signature, signingInput);
    if (!valid) return null;

    const payloadStr = new TextDecoder().decode(base64urlDecode(payloadB64));
    const payload = JSON.parse(payloadStr) as JWTPayload;

    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch {
    return null;
  }
}
