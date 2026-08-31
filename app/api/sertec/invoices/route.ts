import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { qAll, qInsert, qOne, qRun } from '@/lib/db';
import { ensureSertecInit, recomputeInvoiceStatus, getOpenPeriodsForService, logActivity, getInvoiceWithDetail } from '@/lib/sertec-db';

export async function GET(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  await ensureSertecInit();

  const sp = request.nextUrl.searchParams;
  const where: string[] = [];
  const params: any[] = [];
  const $ = (v: any) => { params.push(v); return `$${params.length}`; };

  if (sp.get('providerId')) where.push(`i.provider_id=${$(sp.get('providerId'))}`);
  if (sp.get('serviceId'))  where.push(`i.service_id=${$(sp.get('serviceId'))}`);
  if (sp.get('status'))     where.push(`i.status=${$(sp.get('status'))}`);
  if (sp.get('statusIn'))   where.push(`i.status = ANY(${$(sp.get('statusIn')!.split(','))})`);
  if (sp.get('priceMatch')) where.push(`i.price_match=${$(sp.get('priceMatch'))}`);
  if (sp.get('q')) {
    const s = `%${sp.get('q')}%`;
    where.push(`(pr.name ILIKE ${$(s)} OR s.name ILIKE ${$(s)} OR i.invoice_number ILIKE ${$(s)})`);
  }

  const invoices = await qAll(`
    SELECT i.*, pr.name as provider_name, s.name as service_name, s.department, s.periodicity,
      (SELECT STRING_AGG(p.label, ', ' ORDER BY p.period_start)
       FROM sertec_periods p JOIN sertec_invoice_periods ip ON ip.period_id=p.id WHERE ip.invoice_id=i.id) as period_labels,
      GREATEST(0, (CURRENT_DATE - i.received_date))::int as days_since_received
    FROM sertec_invoices i
    JOIN sertec_providers pr ON pr.id = i.provider_id
    JOIN sertec_services s ON s.id = i.service_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY i.created_at DESC
  `, params);

  return NextResponse.json({ invoices });
}

/**
 * Registro de la factura y asignación de período(s) — paso 11.
 * Flujo de bajo esfuerzo: el analista solo elige proveedor + servicio + período(s)
 * (ya filtrados a los abiertos) y carga el importe; el sistema resuelve a qué
 * cola va (autorización directa o alguna excepción).
 */
export async function POST(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  await ensureSertecInit();

  const body = await request.json();
  const { provider_id, service_id, amount, received_date, invoice_number, period_ids, period_unclear, notes, actor, actorRole } = body;

  if (!provider_id || !service_id || amount == null)
    return NextResponse.json({ error: 'Proveedor, servicio e importe son requeridos' }, { status: 400 });

  const service = await qOne<any>('SELECT * FROM sertec_services WHERE id=$1 AND provider_id=$2', [service_id, provider_id]);
  if (!service) return NextResponse.json({ error: 'El servicio no corresponde al proveedor elegido' }, { status: 400 });

  let validPeriodIds: number[] = [];
  if (!period_unclear) {
    if (!Array.isArray(period_ids) || period_ids.length === 0)
      return NextResponse.json({ error: 'Elegí al menos un período, o marcá "período a confirmar"' }, { status: 400 });

    const open = await getOpenPeriodsForService(service_id);
    const openIds = new Set(open.map((p: any) => p.id));
    for (const pid of period_ids) {
      if (!openIds.has(Number(pid)))
        return NextResponse.json({ error: 'Uno de los períodos elegidos ya no está abierto' }, { status: 409 });
    }
    validPeriodIds = period_ids.map((p: any) => Number(p));
  }

  const id = await qInsert(
    `INSERT INTO sertec_invoices (provider_id,service_id,invoice_number,amount,received_date,period_unclear,notes,created_by)
     VALUES ($1,$2,$3,$4,COALESCE($5,CURRENT_DATE),$6,$7,$8)`,
    [provider_id, service_id, invoice_number?.trim() || null, Number(amount), received_date || null,
     period_unclear ? 1 : 0, notes?.trim() || null, actor?.trim() || 'Analista Cuentas a Pagar']
  );

  for (const pid of validPeriodIds)
    await qRun(`INSERT INTO sertec_invoice_periods (invoice_id,period_id) VALUES ($1,$2)`, [id, pid]);

  await recomputeInvoiceStatus(id);
  await logActivity({
    invoiceId: id, serviceId: service_id, actor, actorRole,
    action: 'Factura registrada',
    detail: period_unclear ? 'Período a confirmar — se deriva al responsable operativo.' : undefined,
  });

  const invoice = await getInvoiceWithDetail(id);
  return NextResponse.json({ invoice }, { status: 201 });
}
