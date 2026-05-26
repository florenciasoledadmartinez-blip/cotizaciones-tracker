import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { qAll, checkAndUpdateExpiredQuotes } from '@/lib/db';
import { STATUS_LABELS, PRIORITY_LABELS } from '@/lib/utils';

export async function GET(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const type = request.nextUrl.searchParams.get('type') || 'quotes';
  await checkAndUpdateExpiredQuotes();
  const XLSX = require('xlsx');

  let data: any[] = [];
  let sheetName = 'Cotizaciones';

  if (type === 'quotes') {
    const rows = await qAll(`
      SELECT q.quote_number,q.client_name,q.description,q.quote_type,
             q.received_date,q.deadline_date,q.estimated_send_date,q.actual_send_date,
             u.name as responsable,q.status,q.priority,q.progress_percentage,q.observations,
             q.created_at,q.updated_at,
             (q.deadline_date::date - CURRENT_DATE)::int as dias_restantes
      FROM quotes q LEFT JOIN users u ON q.assigned_user_id=u.id ORDER BY q.deadline_date
    `);
    data = rows.map(r => ({
      'Número Cotización': r.quote_number, 'Cliente': r.client_name,
      'Descripción': r.description ?? '', 'Tipo': r.quote_type ?? '',
      'Fecha Recepción': r.received_date, 'Deadline': r.deadline_date,
      'Fecha Estimada Envío': r.estimated_send_date ?? '', 'Fecha Real Envío': r.actual_send_date ?? '',
      'Responsable': r.responsable ?? 'Sin asignar',
      'Estado': STATUS_LABELS[r.status] ?? r.status, 'Prioridad': PRIORITY_LABELS[r.priority] ?? r.priority,
      'Avance %': r.progress_percentage, 'Días Restantes': r.dias_restantes,
      'Observaciones': r.observations ?? '', 'Creada': r.created_at, 'Última Actualización': r.updated_at,
    }));
  } else if (type === 'workload') {
    sheetName = 'Carga por Responsable';
    data = await qAll(`
      SELECT u.name as Responsable,
        COUNT(q.id)::int as Total,
        SUM(CASE WHEN q.status NOT IN ('sent','cancelled','closed') THEN 1 ELSE 0 END)::int as Activas,
        SUM(CASE WHEN q.status='expired' THEN 1 ELSE 0 END)::int as Vencidas,
        SUM(CASE WHEN q.status='sent' THEN 1 ELSE 0 END)::int as Enviadas,
        ROUND(AVG(q.progress_percentage)::numeric,1) as "Avance Promedio %"
      FROM users u LEFT JOIN quotes q ON q.assigned_user_id=u.id
      WHERE u.role='operator' AND u.active=1 GROUP BY u.id,u.name ORDER BY u.name
    `);
  } else if (type === 'expired') {
    sheetName = 'Vencidas';
    const rows = await qAll(`
      SELECT q.quote_number,q.client_name,q.deadline_date,u.name as responsable,
             q.progress_percentage,(CURRENT_DATE-q.deadline_date::date)::int as dias_vencida,q.observations
      FROM quotes q LEFT JOIN users u ON q.assigned_user_id=u.id
      WHERE q.status='expired' ORDER BY q.deadline_date
    `);
    data = rows.map(r => ({
      'Número': r.quote_number, 'Cliente': r.client_name, 'Deadline': r.deadline_date,
      'Responsable': r.responsable ?? 'Sin asignar', 'Avance %': r.progress_percentage,
      'Días Vencida': r.dias_vencida, 'Observaciones': r.observations ?? '',
    }));
  } else if (type === 'history') {
    sheetName = 'Historial';
    data = await qAll(`
      SELECT q.quote_number,u.name as usuario,al.action,al.field_name,al.previous_value,al.new_value,al.created_at
      FROM activity_log al LEFT JOIN users u ON al.user_id=u.id LEFT JOIN quotes q ON al.quote_id=q.id
      ORDER BY al.created_at DESC LIMIT 1000
    `);
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), sheetName);
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${sheetName}-${new Date().toISOString().split('T')[0]}.xlsx"`,
    },
  });
}
