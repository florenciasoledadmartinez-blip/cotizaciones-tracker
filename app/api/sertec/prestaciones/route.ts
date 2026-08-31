import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { qAll } from '@/lib/db';
import { ensureSertecInit, ensureAllOpenPeriods } from '@/lib/sertec-db';

/**
 * Bandeja de certificación de prestación: períodos abiertos pendientes de
 * certificar, con indicador de antigüedad ("lleva N días sin certificar")
 * para que no se conviertan en un cuello de botella silencioso.
 */
export async function GET(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  await ensureSertecInit();
  await ensureAllOpenPeriods();

  const sp = request.nextUrl.searchParams;
  const onlyPending = sp.get('status') !== 'all';

  const periods = await qAll(`
    SELECT pe.*, s.name as service_name, s.department, s.responsible_name, p.name as provider_name,
      GREATEST(0, (CURRENT_DATE - pe.period_end))::int as days_since_period_end
    FROM sertec_periods pe
    JOIN sertec_services s ON s.id = pe.service_id
    JOIN sertec_providers p ON p.id = s.provider_id
    WHERE s.active = 1
    ${onlyPending ? "AND pe.certification_status = 'pendiente'" : ''}
    ORDER BY pe.period_end ASC
  `);
  return NextResponse.json({ periods });
}
