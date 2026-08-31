import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { qAll, qInsert, qOne } from '@/lib/db';
import { ensureSertecInit, getOpenPeriodsForService } from '@/lib/sertec-db';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  await ensureSertecInit();

  const sp = request.nextUrl.searchParams;
  const serviceId = Number(params.id);

  if (sp.get('all') === 'true') {
    const periods = await qAll('SELECT * FROM sertec_periods WHERE service_id=$1 ORDER BY period_start DESC', [serviceId]);
    return NextResponse.json({ periods });
  }

  const periods = await getOpenPeriodsForService(serviceId);
  return NextResponse.json({ periods });
}

/** Alta manual de un período para servicios "evento" (sin calendario automático). */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  await ensureSertecInit();

  const serviceId = Number(params.id);
  const service = await qOne<any>('SELECT * FROM sertec_services WHERE id=$1', [serviceId]);
  if (!service) return NextResponse.json({ error: 'Servicio no encontrado' }, { status: 404 });

  const body = await request.json();
  const label = body.label?.trim();
  const periodStart = body.period_start;
  const periodEnd = body.period_end || body.period_start;
  if (!label || !periodStart)
    return NextResponse.json({ error: 'Descripción y fecha del evento son requeridas' }, { status: 400 });

  const id = await qInsert(
    `INSERT INTO sertec_periods (service_id,label,period_start,period_end) VALUES ($1,$2,$3,$4)`,
    [serviceId, label, periodStart, periodEnd]
  );
  return NextResponse.json({ id }, { status: 201 });
}
