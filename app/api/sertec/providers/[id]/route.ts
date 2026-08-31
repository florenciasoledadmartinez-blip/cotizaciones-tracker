import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { qAll, qOne, qRun } from '@/lib/db';
import { ensureSertecInit } from '@/lib/sertec-db';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  await ensureSertecInit();

  const provider = await qOne('SELECT * FROM sertec_providers WHERE id=$1', [params.id]);
  if (!provider) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  const services = await qAll('SELECT * FROM sertec_services WHERE provider_id=$1 ORDER BY active DESC, name', [params.id]);
  return NextResponse.json({ provider, services });
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  await ensureSertecInit();

  const body = await request.json();
  const fields: string[] = [];
  const values: any[] = [];
  let i = 1;
  for (const key of ['name', 'cuit', 'email', 'active']) {
    if (key in body) { fields.push(`${key}=$${i++}`); values.push(body[key]); }
  }
  if (!fields.length) return NextResponse.json({ error: 'Nada para actualizar' }, { status: 400 });
  values.push(params.id);
  await qRun(`UPDATE sertec_providers SET ${fields.join(',')} WHERE id=$${i}`, values);
  return NextResponse.json({ ok: true });
}
