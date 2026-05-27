import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, isLeaderOrAdmin } from '@/lib/auth';
import { qAll, qRun } from '@/lib/db';
import bcrypt from 'bcryptjs';

// Active statuses that need a task checklist
const ACTIVE_STATUSES = new Set(['pending_assignment', 'assigned', 'in_progress', 'in_review']);

export async function POST(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user || !isLeaderOrAdmin(user.role))
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const clearDemo = formData.get('clearDemo') === 'true';

    if (!file) return NextResponse.json({ error: 'Archivo requerido' }, { status: 400 });

    // ── Optional: delete demo quotes (COT-XXXX format) ──────────────────────
    if (clearDemo) {
      // Delete dependent records first (activity_log and ai_insights lack ON DELETE CASCADE)
      await qRun(`
        DELETE FROM activity_log WHERE quote_id IN (
          SELECT id FROM quotes WHERE quote_number LIKE 'COT-%'
        )
      `);
      await qRun(`
        DELETE FROM ai_insights WHERE quote_id IN (
          SELECT id FROM quotes WHERE quote_number LIKE 'COT-%'
        )
      `);
      await qRun(`DELETE FROM quotes WHERE quote_number LIKE 'COT-%'`);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const XLSX = require('xlsx');
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const ws = workbook.Sheets[workbook.SheetNames[0]];

    // ── Detect header row (column A = 'N°') ─────────────────────────────────
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][];
    let headerRowIdx = -1;
    for (let i = 0; i < Math.min(20, raw.length); i++) {
      const cell = String(raw[i][0]).trim();
      if (cell === 'N°' || cell === 'N°' || cell === 'Nro' || cell === 'Numero') {
        headerRowIdx = i;
        break;
      }
    }
    if (headerRowIdx === -1) {
      return NextResponse.json({
        error: 'No se encontró la fila de encabezados. Asegurate de que la columna A tenga el encabezado "N°".',
      }, { status: 400 });
    }

    // Re-read using the detected header row
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    range.s.r = headerRowIdx;
    ws['!ref'] = XLSX.utils.encode_range(range);
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' }) as any[];
    if (!rows.length) return NextResponse.json({ error: 'El archivo no tiene filas de datos.' }, { status: 400 });

    // ── 1. Collect unique cotizadores and resolve/create users ───────────────
    const existingUsers: { id: number; name: string; email: string }[] =
      await qAll('SELECT id, name, email FROM users WHERE active = 1');
    const userByNorm = new Map<string, number>();
    for (const u of existingUsers) userByNorm.set(normName(u.name), u.id);

    const cotizadoresRaw = new Set<string>();
    for (const row of rows) {
      const raw = String(row['Cotizó'] || row['RespEstado'] || '').trim();
      if (raw) cotizadoresRaw.add(raw);
    }

    // Resolve / auto-create users (batch)
    const cotizadorToUserId = new Map<string, number>();
    const defaultHash = await bcrypt.hash('cambiar123', 10);
    for (const rawName of cotizadoresRaw) {
      const namePart = rawName.includes(' - ')
        ? rawName.split(' - ').slice(1).join(' ').trim()
        : rawName.trim();
      const initials = rawName.split(' - ')[0]?.trim().toLowerCase() ?? 'op';
      const key = normName(namePart);

      // Try exact match
      if (userByNorm.has(key)) { cotizadorToUserId.set(rawName, userByNorm.get(key)!); continue; }
      // Try partial match
      let found = false;
      for (const [k, id] of userByNorm) {
        if (k.includes(key) || key.includes(k)) { cotizadorToUserId.set(rawName, id); found = true; break; }
      }
      if (found) continue;

      // Auto-create
      const email = `${initials}@empresa.com`;
      const existing = await qAll('SELECT id FROM users WHERE email=$1', [email]);
      if (existing.length) {
        cotizadorToUserId.set(rawName, existing[0].id);
        userByNorm.set(key, existing[0].id);
      } else {
        const res = await qAll(
          `INSERT INTO users (name,email,password_hash,role,active) VALUES ($1,$2,$3,'operator',1) RETURNING id`,
          [namePart, email, defaultHash]
        );
        const newId = res[0].id;
        cotizadorToUserId.set(rawName, newId);
        userByNorm.set(key, newId);
      }
    }

    // ── 2. Parse all rows into quote records ─────────────────────────────────
    interface QuoteRow {
      quote_number: string; client_name: string; description: string;
      quote_type: string | null; received_date: string; deadline_date: string;
      actual_send_date: string | null; assigned_user_id: number | null;
      status: string; priority: string; observations: string | null;
    }
    const quoteRows: QuoteRow[] = [];
    let skipped = 0;

    for (const row of rows) {
      const num = row['N°'];
      if (!num || typeof num !== 'number') { skipped++; continue; }
      const clientName = String(row['Cliente_Full'] || '').trim();
      const receivedDate = parseDate(row['Recepción']);
      if (!clientName || !receivedDate) { skipped++; continue; }

      const deadlineDate = parseDate(row['Dead-line']) || addDays(receivedDate, 30);
      const cotizadoRaw = String(row['Cotizó'] || row['RespEstado'] || '').trim();

      quoteRows.push({
        quote_number:     String(Math.round(num)),
        client_name:      clientName,
        description:      String(row['Nombre'] || '').trim() || null,
        quote_type:       String(row['TIPO'] || '').trim() || null,
        received_date:    receivedDate,
        deadline_date:    deadlineDate,
        actual_send_date: parseDate(row['Fecha envío']),
        assigned_user_id: cotizadorToUserId.get(cotizadoRaw) ?? null,
        status:           mapStatus(row['Estado Inicial'], row['Estado Intermedio'], row['Estado Final'], parseDate(row['Fecha envío'])),
        priority:         mapEscala(row['ESCALA']),
        observations:     String(row['Observaciones'] || '').trim() || null,
      } as QuoteRow);
    }

    // ── 3. Bulk upsert quotes in batches of 200 ──────────────────────────────
    const BATCH = 200;
    let imported = 0, updated = 0;
    const newActiveIds: number[] = [];

    for (let i = 0; i < quoteRows.length; i += BATCH) {
      const batch = quoteRows.slice(i, i + BATCH);

      // Build multi-row INSERT … ON CONFLICT … DO UPDATE
      const vals: any[] = [];
      const placeholders = batch.map((q, j) => {
        const base = j * 11;
        vals.push(
          q.quote_number, q.client_name, q.description, q.quote_type,
          q.received_date, q.deadline_date, q.actual_send_date,
          q.assigned_user_id, q.status, q.priority, q.observations
        );
        return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},$${base+7},$${base+8},$${base+9},$${base+10},$${base+11},${user.userId})`;
      });

      const res: any[] = await qAll(`
        INSERT INTO quotes
          (quote_number,client_name,description,quote_type,received_date,deadline_date,
           actual_send_date,assigned_user_id,status,priority,observations,created_by)
        VALUES ${placeholders.join(',')}
        ON CONFLICT (quote_number) DO UPDATE SET
          client_name      = EXCLUDED.client_name,
          description      = EXCLUDED.description,
          quote_type       = EXCLUDED.quote_type,
          received_date    = EXCLUDED.received_date,
          deadline_date    = EXCLUDED.deadline_date,
          actual_send_date = EXCLUDED.actual_send_date,
          assigned_user_id = COALESCE(EXCLUDED.assigned_user_id, quotes.assigned_user_id),
          status           = EXCLUDED.status,
          priority         = EXCLUDED.priority,
          observations     = COALESCE(EXCLUDED.observations, quotes.observations),
          updated_at       = NOW()
        RETURNING id, status, (xmax = 0) AS is_new
      `, vals);

      for (const r of res) {
        if (r.is_new) {
          imported++;
          if (ACTIVE_STATUSES.has(r.status)) newActiveIds.push(r.id);
        } else {
          updated++;
        }
      }
    }

    // ── 4. Bulk generate tasks ONLY for newly inserted active quotes ─────────
    if (newActiveIds.length > 0) {
      // Fetch templates once
      const taskTemplates: any[] = await qAll(
        'SELECT id, order_index FROM task_templates WHERE active=1 ORDER BY order_index'
      );
      const subtaskTemplates: any[] = await qAll(
        'SELECT id, task_template_id, order_index FROM subtask_templates WHERE active=1 ORDER BY order_index'
      );

      // Bulk insert quote_tasks
      const taskVals: any[] = [];
      const taskPlaceholders: string[] = [];
      let p = 1;
      for (const qid of newActiveIds) {
        for (const tt of taskTemplates) {
          taskPlaceholders.push(`($${p++},$${p++},'pending',0,$${p++})`);
          taskVals.push(qid, tt.id, tt.order_index);
        }
      }
      const insertedTasks: any[] = await qAll(`
        INSERT INTO quote_tasks (quote_id,task_template_id,status,progress_percentage,order_index)
        VALUES ${taskPlaceholders.join(',')}
        RETURNING id, quote_id, task_template_id
      `, taskVals);

      // Bulk insert quote_subtasks
      const subVals: any[] = [];
      const subPlaceholders: string[] = [];
      p = 1;
      for (const qt of insertedTasks) {
        const subs = subtaskTemplates.filter(s => s.task_template_id === qt.task_template_id);
        for (const st of subs) {
          subPlaceholders.push(`($${p++},$${p++},$${p++},'pending')`);
          subVals.push(qt.quote_id, qt.id, st.id);
        }
      }
      if (subPlaceholders.length > 0) {
        await qRun(`
          INSERT INTO quote_subtasks (quote_id,quote_task_id,subtask_template_id,status)
          VALUES ${subPlaceholders.join(',')}
        `, subVals);
      }
    }

    return NextResponse.json({ imported, updated, skipped, total: quoteRows.length });

  } catch (e: any) {
    console.error('Import error:', e);
    return NextResponse.json({ error: 'Error al procesar: ' + e.message }, { status: 500 });
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function normName(s: string) { return s.toLowerCase().trim().replace(/\s+/g, ' '); }

function parseDate(v: any): string | null {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString().split('T')[0];
  const s = String(v).trim();
  if (!s || s === 'FALSE' || s === 'TRUE' || s === '0') return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  const n = Number(s);
  if (!isNaN(n) && n > 40000 && n < 60000) {
    return new Date(Date.UTC(1899, 11, 30) + n * 86400000).toISOString().split('T')[0];
  }
  return null;
}

function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr); d.setDate(d.getDate() + days); return d.toISOString().split('T')[0];
}

function mapEscala(v: any) {
  const s = String(v || '').toUpperCase().trim();
  return s === 'CHICA' ? 'low' : s === 'GRANDE' ? 'high' : 'medium';
}

function mapStatus(init: any, mid: any, fin: any, sent: string | null): string {
  const f = String(fin  || '').trim();
  const m = String(mid  || '').trim();
  const i = String(init || '').trim();
  if (f === 'Adjudicada')          return 'closed';
  if (f === 'No Adjudicada')       return 'cancelled';
  if (f === 'Falta Determinacion') return 'in_review';
  if (m === 'Anulada')             return 'cancelled';
  if (m === 'Negociación')         return 'in_review';
  if (m === 'Hacer Seguimiento')   return 'in_review';
  if (m === 'Cotización Enviada')  return 'sent';
  if (m === 'A Futuro')            return 'pending_assignment';
  if (i === 'Cotización Enviada')  return sent ? 'sent' : 'in_review';
  if (i === 'Pendiente de Corrección') return 'in_progress';
  return 'pending_assignment';
}
