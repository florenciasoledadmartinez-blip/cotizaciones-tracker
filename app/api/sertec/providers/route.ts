import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { qAll, qInsert } from '@/lib/db';
import { ensureSertecInit } from '@/lib/sertec-db';

export async function GET(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  await ensureSertecInit();

  const sp = request.nextUrl.searchParams;
  const activeOnly = sp.get('active') === 'true';

  const providers = await qAll(`
    SELECT p.*,
      (SELECT COUNT(*)::int FROM sertec_services s WHERE s.provider_id = p.id AND s.active = 1) as active_services_count
    FROM sertec_providers p
    ${activeOnly ? 'WHERE p.active = 1' : ''}
    ORDER BY p.name
  `);
  return NextResponse.json({ providers });
}

export async function POST(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  await ensureSertecInit();

  const body = await request.json();
  const { name, cuit, email } = body;
  if (!name?.trim()) return NextResponse.json({ error: 'El nombre del proveedor es requerido' }, { status: 400 });

  const id = await qInsert(
    `INSERT INTO sertec_providers (name, cuit, email) VALUES ($1,$2,$3)`,
    [name.trim(), cuit?.trim() || null, email?.trim() || null]
  );
  return NextResponse.json({ id }, { status: 201 });
}
