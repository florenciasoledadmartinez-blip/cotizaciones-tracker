import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { qAll, qOne, qRun } from '@/lib/db';
import { ensureSertecInit, computeServiceBudget, recomputeInvoiceStatus, logActivity } from '@/lib/sertec-db';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  await ensureSertecInit();

  const service = await qOne(`
    SELECT s.*, p.name as provider_name FROM sertec_services s
    JOIN sertec_providers p ON p.id = s.provider_id WHERE s.id=$1`, [params.id]);
  if (!service) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  const priceHistory = await qAll('SELECT * FROM sertec_price_history WHERE service_id=$1 ORDER BY changed_at DESC', [params.id]);
  const periods = await qAll('SELECT * FROM sertec_periods WHERE service_id=$1 ORDER BY period_start DESC LIMIT 24', [params.id]);
  const budget = await computeServiceBudget(Number(params.id));

  return NextResponse.json({ service, priceHistory, periods, budget });
}

/**
 * Edición de la condición del servicio (alta/edición, paso 8 del proceso).
 * Un cambio de precio queda en el historial. Cambios en el plazo/período
 * presupuestario ("ampliar o renovar presupuesto") recalculan las facturas
 * que estaban frenadas en conflicto de presupuesto.
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  await ensureSertecInit();

  const body = await request.json();
  const serviceId = Number(params.id);
  const current = await qOne<any>('SELECT * FROM sertec_services WHERE id=$1', [serviceId]);
  if (!current) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  const fields: string[] = [];
  const values: any[] = [];
  let i = 1;
  for (const key of ['name', 'cost_center', 'department', 'responsible_name', 'periodicity',
    'price_update_basis', 'duracion_periodos', 'periodo_presupuestario', 'contract_start_date', 'active']) {
    if (key in body) { fields.push(`${key}=$${i++}`); values.push(body[key]); }
  }

  const newPrice = body.unit_price != null ? Number(body.unit_price) : null;
  const priceChanged = newPrice != null && newPrice !== Number(current.unit_price);
  if (priceChanged) { fields.push(`unit_price=$${i++}`); values.push(newPrice); }

  if (!fields.length) return NextResponse.json({ error: 'Nada para actualizar' }, { status: 400 });
  fields.push('updated_at=NOW()');
  values.push(serviceId);
  await qRun(`UPDATE sertec_services SET ${fields.join(',')} WHERE id=$${i}`, values);

  if (priceChanged) {
    await qRun(`INSERT INTO sertec_price_history (service_id,price,reason,changed_by) VALUES ($1,$2,$3,$4)`,
      [serviceId, newPrice, body.price_change_reason?.trim() || 'Actualización de precio', body.actor?.trim() || 'Responsable operativo']);
    await logActivity({
      serviceId, actor: body.actor || 'Responsable operativo', actorRole: body.actorRole,
      action: 'Precio vigente actualizado', detail: `Nuevo precio: ${newPrice}. Motivo: ${body.price_change_reason || '(sin motivo indicado)'}`,
    });
  }

  // Recalcular facturas frenadas por precio o presupuesto de este servicio
  const stuck = await qAll<any>(
    `SELECT id FROM sertec_invoices WHERE service_id=$1 AND status IN ('conflicto_precio','conflicto_presupuesto')`,
    [serviceId]
  );
  for (const inv of stuck) await recomputeInvoiceStatus(inv.id);

  return NextResponse.json({ ok: true, recalculated: stuck.length });
}
