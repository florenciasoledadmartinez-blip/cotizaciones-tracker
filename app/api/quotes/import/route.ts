import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, isLeaderOrAdmin } from '@/lib/auth';
import { qInsert, qRun, generateQuoteTasks, updateQuoteProgress, logActivity } from '@/lib/db';

export async function POST(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user || !isLeaderOrAdmin(user.role))
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    if (!file) return NextResponse.json({ error: 'Archivo requerido' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const XLSX = require('xlsx');
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' }) as any[];

    if (!rows.length) return NextResponse.json({ error: 'Archivo vacío' }, { status: 400 });

    let imported = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const mapped = mapRow(row);
      if (!mapped.quote_number || !mapped.client_name || !mapped.received_date || !mapped.deadline_date) {
        errors.push(`Fila ${i + 2}: faltan campos requeridos`);
        continue;
      }
      try {
        const id = await qInsert(`
          INSERT INTO quotes (quote_number,client_name,description,quote_type,received_date,deadline_date,
            estimated_send_date,priority,observations,status,created_by)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
          ON CONFLICT (quote_number) DO NOTHING`,
          [mapped.quote_number, mapped.client_name, mapped.description, mapped.quote_type,
           mapped.received_date, mapped.deadline_date, mapped.estimated_send_date || null,
           mapped.priority, mapped.observations, mapped.status, user.userId]
        );
        if (id) {
          await generateQuoteTasks(id);
          await updateQuoteProgress(id);
          await logActivity(id, user.userId, 'Importada desde archivo');
          imported++;
        }
      } catch (e: any) {
        errors.push(`Fila ${i + 2}: ${e.message}`);
      }
    }

    return NextResponse.json({ imported, total: rows.length, errors });
  } catch (e: any) {
    return NextResponse.json({ error: 'Error al procesar: ' + e.message }, { status: 500 });
  }
}

function mapRow(row: any) {
  return {
    quote_number:       row['Número de Cotización'] || row['quote_number'] || row['numero'] || '',
    client_name:        row['Cliente'] || row['client_name'] || '',
    description:        row['Descripción'] || row['description'] || '',
    quote_type:         row['Tipo'] || row['quote_type'] || '',
    received_date:      fmtDate(row['Fecha Recepción'] || row['received_date']),
    deadline_date:      fmtDate(row['Deadline'] || row['deadline_date'] || row['fecha_limite']),
    estimated_send_date:fmtDate(row['Fecha Estimada'] || row['estimated_send_date']),
    priority:           mapPri(row['Prioridad'] || row['priority']),
    observations:       row['Observaciones'] || row['observations'] || '',
    status:             mapSt(row['Estado'] || row['status']),
  };
}

function fmtDate(v: any): string {
  if (!v) return '';
  if (v instanceof Date) return v.toISOString().split('T')[0];
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  return s;
}

function mapPri(v: string): string {
  const s = String(v).toLowerCase();
  if (s.includes('urgent')) return 'urgent';
  if (s.includes('alta') || s.includes('high')) return 'high';
  if (s.includes('baja') || s.includes('low')) return 'low';
  return 'medium';
}

function mapSt(v: string): string {
  const s = String(v).toLowerCase();
  if (s.includes('proceso') || s.includes('progress')) return 'in_progress';
  if (s.includes('revision') || s.includes('review')) return 'in_review';
  if (s.includes('enviada') || s.includes('sent')) return 'sent';
  if (s.includes('cancel')) return 'cancelled';
  if (s.includes('cerrada') || s.includes('closed')) return 'closed';
  if (s.includes('asignada') || s.includes('assigned')) return 'assigned';
  return 'pending_assignment';
}
