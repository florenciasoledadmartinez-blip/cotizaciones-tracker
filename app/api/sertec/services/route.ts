import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { qAll, qInsert, qRun } from '@/lib/db';
import { ensureSertecInit, computeServiceBudget } from '@/lib/sertec-db';

export async function GET(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  await ensureSertecInit();

  const sp = request.nextUrl.searchParams;
  const providerId = sp.get('providerId');
  const activeOnly = sp.get('active') !== 'false';
  const withBudget = sp.get('withBudget') === 'true';

  const where: string[] = [];
  const params: any[] = [];
  if (providerId) { params.push(providerId); where.push(`s.provider_id=$${params.length}`); }
  if (activeOnly) where.push('s.active=1');

  const services = await qAll(`
    SELECT s.*, p.name as provider_name
    FROM sertec_services s
    JOIN sertec_providers p ON p.id = s.provider_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY p.name, s.name
  `, params);

  if (withBudget) {
    for (const s of services) s.budget = await computeServiceBudget(s.id);
  }

  return NextResponse.json({ services });
}

export async function POST(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  await ensureSertecInit();

  const body = await request.json();
  const {
    provider_id, name, cost_center, department, responsible_name,
    periodicity, unit_price, price_update_basis,
    duracion_periodos, periodo_presupuestario, contract_start_date,
  } = body;

  if (!provider_id || !name?.trim())
    return NextResponse.json({ error: 'Proveedor y nombre del servicio son requeridos' }, { status: 400 });
  if (!['mensual', 'quincenal', 'evento'].includes(periodicity))
    return NextResponse.json({ error: 'Periodicidad inválida' }, { status: 400 });

  const id = await qInsert(`
    INSERT INTO sertec_services
      (provider_id,name,cost_center,department,responsible_name,periodicity,unit_price,
       price_update_basis,duracion_periodos,periodo_presupuestario,contract_start_date)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,COALESCE($11,CURRENT_DATE))`,
    [provider_id, name.trim(), cost_center?.trim() || null, department?.trim() || null,
     responsible_name?.trim() || null, periodicity, Number(unit_price) || 0,
     price_update_basis?.trim() || null, duracion_periodos ? Number(duracion_periodos) : null,
     periodo_presupuestario || 'anual', contract_start_date || null]
  );

  if (Number(unit_price) > 0) {
    await qRun(`INSERT INTO sertec_price_history (service_id,price,reason,changed_by) VALUES ($1,$2,$3,$4)`,
      [id, Number(unit_price), 'Precio inicial del contrato', responsible_name?.trim() || 'Responsable operativo']);
  }

  return NextResponse.json({ id }, { status: 201 });
}
