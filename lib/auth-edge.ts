import { jwtVerify } from 'jose';
import { NextRequest } from 'next/server';

export const COOKIE_NAME = 'auth_token';

export interface JWTPayload {
  userId: number;
  email: string;
  role: 'admin' | 'leader' | 'operator';
  name: string;
}

export function getTokenFromRequest(req: NextRequest): string | null {
  return req.cookies.get(COOKIE_NAME)?.value ?? null;
}

export async function verifyTokenEdge(token: string): Promise<JWTPayload | null> {
  try {
    const secret = new TextEncoder().encode(
      process.env.JWT_SECRET || 'cotizaciones-secret-key-2024-change-in-production'
    );
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as JWTPayload;
  } catch {
    return null;
  }
}
