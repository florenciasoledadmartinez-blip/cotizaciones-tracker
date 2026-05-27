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

    // ── 3. Deduplicate by quote_number (keep last occurrence) ────────────────
    const quoteMap = new Map<string, QuoteRow>();
    for (const q of quoteRows) quoteMap.set(q.quote_number, q);
    const dedupedRows = Array.from(quoteMap.values());

    // ── 4. Split into INSERT (new) vs UPDATE (existing) ───────────────────────
    // Avoid ON CONFLICT entirely — it fails when the Excel has duplicate N°
    const existingRecs: { id: number; quote_number: string }[] =
      await qAll('SELECT id, quote_number FROM quotes');
    const existingNums = new Set<string>(existingRecs.map((r: any) => r.quote_number));

    const toInsert = dedupedRows.filter(q => !existingNums.has(q.quote_number));
    const toUpdate = dedupedRows.filter(q =>  existingNums.has(q.quote_number));

    let imported = 0, updated = 0;
    const newActiveIds: number[] = [];

    // ── 4a. Batch INSERT new quotes (no conflict possible) ────────────────────
    const BATCH = 100;
    for (let i = 0; i < toInsert.length; i += BATCH) {
      const batch = toInsert.slice(i, i + BATCH);
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
        RETURNING id, status
      `, vals);
      for (const r of res) {
        imported++;
        if (ACTIVE_STATUSES.has(r.status)) newActiveIds.push(r.id);
      }
    }

    // ── 4b. Batch UPDATE existing quotes (UPDATE … FROM VALUES, no conflict) ──
    for (let i = 0; i < toUpdate.length; i += BATCH) {
      const batch = toUpdate.slice(i, i + BATCH);
      const vals: any[] = [];
      const rows = batch.map((q, j) => {
        const base = j * 11;
        vals.push(
          q.quote_number, q.client_name, q.description, q.quote_type,
          q.received_date, q.deadline_date, q.actual_send_date,
          q.assigned_user_id, q.status, q.priority, q.observations
        );
        // Cast types explicitly so PostgreSQL handles NULLs correctly
        return `($${base+1}::text,$${base+2}::text,$${base+3}::text,$${base+4}::text,`+
               `$${base+5}::date,$${base+6}::date,$${base+7}::date,`+
               `$${base+8}::integer,$${base+9}::text,$${base+10}::text,$${base+11}::text)`;
      });
      await qRun(`
        UPDATE quotes SET
          client_name      = v.client_name,
          description      = v.description,
          quote_type       = v.quote_type,
          received_date    = v.received_date,
          deadline_date    = v.deadline_date,
          actual_send_date = v.actual_send_date,
          assigned_user_id = COALESCE(v.assigned_user_id, quotes.assigned_user_id),
          status           = v.status,
          priority         = v.priority,
          observations     = COALESCE(v.observations, quotes.observations),
          updated_at       = NOW()
        FROM (VALUES ${rows.join(',')}) AS v(
          quote_number,client_name,description,quote_type,
          received_date,deadline_date,actual_send_date,
          assigned_user_id,status,priority,observations
        )
        WHERE quotes.quote_number = v.quote_number
      `, vals);
      updated += batch.length;
    }

    // ── 4. Bulk generate tasks for newly inserted active quotes ──────────────
    // Uses batches to stay under PostgreSQL's 65535-parameter limit
    if (newActiveIds.length > 0) {
      const taskTemplates: any[] = await qAll(
        'SELECT id, order_index FROM task_templates WHERE active=1 ORDER BY order_index'
      );
      const subtaskTemplates: any[] = await qAll(
        'SELECT id, task_template_id, order_index FROM subtask_templates WHERE active=1 ORDER BY order_index'
      );

      // Collect all (quoteId, taskTemplateId, orderIndex) rows
      type TaskRow = { quoteId: number; tmplId: number; orderIdx: number };
      const allTaskRows: TaskRow[] = [];
      for (const qid of newActiveIds)
        for (const tt of taskTemplates)
          allTaskRows.push({ quoteId: qid, tmplId: tt.id, orderIdx: tt.order_index });

      // Insert quote_tasks in batches of 500 rows (1500 params each — well under 65535)
      const TASK_BATCH = 500;
      const insertedTasks: any[] = [];
      for (let i = 0; i < allTaskRows.length; i += TASK_BATCH) {
        const batch = allTaskRows.slice(i, i + TASK_BATCH);
        let p = 1;
        const phs = batch.map(r => { const s = `($${p++},$${p++},'pending',0,$${p++})`; return s; });
        const vals: any[] = [];
        for (const r of batch) vals.push(r.quoteId, r.tmplId, r.orderIdx);
        const res: any[] = await qAll(`
          INSERT INTO quote_tasks (quote_id,task_template_id,status,progress_percentage,order_index)
          VALUES ${phs.join(',')} RETURNING id, quote_id, task_template_id
        `, vals);
        insertedTasks.push(...res);
      }

      // Collect all subtask rows
      type SubRow = { quoteId: number; taskId: number; stId: number };
      const allSubRows: SubRow[] = [];
      for (const qt of insertedTasks) {
        const subs = subtaskTemplates.filter((s: any) => s.task_template_id === qt.task_template_id);
        for (const st of subs)
          allSubRows.push({ quoteId: qt.quote_id, taskId: qt.id, stId: st.id });
      }

      // Insert quote_subtasks in batches of 400 rows (1200 params each — well under 65535)
      const SUB_BATCH = 400;
      for (let i = 0; i < allSubRows.length; i += SUB_BATCH) {
        const batch = allSubRows.slice(i, i + SUB_BATCH);
        let p = 1;
        const phs = batch.map(() => `($${p++},$${p++},$${p++},'pending')`);
        const vals: any[] = [];
        for (const r of batch) vals.push(r.quoteId, r.taskId, r.stId);
        await qRun(`
          INSERT INTO quote_subtasks (quote_id,quote_task_id,subtask_template_id,status)
          VALUES ${phs.join(',')}
        `, vals);
      }
    }

    return NextResponse.json({ imported, updated, skipped, total: dedupedRows.length });

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
