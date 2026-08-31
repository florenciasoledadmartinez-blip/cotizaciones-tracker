import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { qAll, qOne, qRun } from '@/lib/db';
import { ensureSertecInit, recomputeInvoiceStatus, logActivity } from '@/lib/sertec-db';

/**
 * Certificación de la prestación por período (paso 10 del proceso).
 * Obligatoria antes de que la factura pueda avanzar. Observación obligatoria
 * salvo que el estado sea "cumplido".
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  await ensureSertecInit();

  const periodId = Number(params.id);
  const period = await qOne<any>('SELECT * FROM sertec_periods WHERE id=$1', [periodId]);
  if (!period) return NextResponse.json({ error: 'Período no encontrado' }, { status: 404 });

  const body = await request.json();
  const { status, observation, actor, actorRole } = body;
  if (!['cumplido', 'parcial', 'no_cumplido'].includes(status))
    return NextResponse.json({ error: 'Estado de certificación inválido' }, { status: 400 });
  if (status !== 'cumplido' && !observation?.trim())
    return NextResponse.json({ error: 'La observación es obligatoria salvo que el período se haya cumplido' }, { status: 400 });

  await qRun(
    `UPDATE sertec_periods SET certification_status=$1, certification_observation=$2, certified_by=$3, certified_at=NOW() WHERE id=$4`,
    [status, observation?.trim() || null, actor?.trim() || 'Responsable operativo', periodId]
  );

  await logActivity({
    serviceId: period.service_id, actor, actorRole,
    action: `Período ${period.label} certificado: ${status}`,
    detail: observation?.trim() || undefined,
  });

  // Recalcular cualquier factura ya cargada que dependa de este período
  const invoices = await qAll<any>(
    `SELECT invoice_id FROM sertec_invoice_periods WHERE period_id=$1`, [periodId]
  );
  for (const inv of invoices) await recomputeInvoiceStatus(inv.invoice_id);

  return NextResponse.json({ ok: true });
}
