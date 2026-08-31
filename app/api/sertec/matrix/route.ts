import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { qAll } from '@/lib/db';
import { ensureSertecInit, ensureAllOpenPeriods } from '@/lib/sertec-db';

/**
 * Vista agrupada por proveedor: matriz proveedor × período, con el estado
 * de cada período (certificación + factura asociada, si la hay).
 */
export async function GET(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  await ensureSertecInit();
  await ensureAllOpenPeriods();

  const sp = request.nextUrl.searchParams;
  const providerId = sp.get('providerId');

  const services = await qAll(`
    SELECT s.id, s.name, s.provider_id, p.name as provider_name
    FROM sertec_services s JOIN sertec_providers p ON p.id = s.provider_id
    WHERE s.active = 1 ${providerId ? 'AND s.provider_id = $1' : ''}
    ORDER BY p.name, s.name
  `, providerId ? [providerId] : []);

  for (const s of services as any[]) {
    s.periods = await qAll(`
      SELECT pe.id, pe.label, pe.period_start, pe.certification_status,
        i.id as invoice_id, i.status as invoice_status, i.amount as invoice_amount
      FROM sertec_periods pe
      LEFT JOIN sertec_invoice_periods ip ON ip.period_id = pe.id
      LEFT JOIN sertec_invoices i ON i.id = ip.invoice_id AND i.status != 'rechazada'
      WHERE pe.service_id = $1
      ORDER BY pe.period_start DESC
      LIMIT 14
    `, [s.id]);
  }

  return NextResponse.json({ services });
}
