import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, isLeaderOrAdmin } from '@/lib/auth';
import { qInsert, qRun, qOne, qAll, generateQuoteTasks, updateQuoteProgress, logActivity } from '@/lib/db';
import bcrypt from 'bcryptjs';

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
    const ws = workbook.Sheets[workbook.SheetNames[0]];

    // ── Detect header row (first row with N° in column A) ──────────────────
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][];
    let headerRowIdx = -1;
    for (let i = 0; i < Math.min(20, raw.length); i++) {
      if (String(raw[i][0]).trim() === 'N°') { headerRowIdx = i; break; }
    }
    if (headerRowIdx === -1)
      return NextResponse.json({ error: 'No se encontró la fila de encabezados (columna N°). Verificá que el archivo sea el correcto.' }, { status: 400 });

    // Re-read using the detected header row
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    range.s.r = headerRowIdx;
    ws['!ref'] = XLSX.utils.encode_range(range);
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' }) as any[];

    if (!rows.length) return NextResponse.json({ error: 'El archivo no tiene filas de datos' }, { status: 400 });

    // ── Pre-load existing users for name matching ──────────────────────────
    const existingUsers: { id: number; name: string; email: string }[] =
      await qAll('SELECT id, name, email FROM users WHERE active = 1');
    const userMap = new Map<string, number>(); // normalizedName → id
    for (const u of existingUsers) {
      userMap.set(normName(u.name), u.id);
    }

    // ── Helper: find or create operator user from "XXX - Full Name" ────────
    async function resolveUser(raw: string): Promise<number | null> {
      if (!raw || typeof raw !== 'string') return null;
      // Format: "GUM - Guidobono Mariana"  or  "GUM - Mariana Guidobono"
      const namePart = raw.includes(' - ') ? raw.split(' - ').slice(1).join(' - ').trim() : raw.trim();
      if (!namePart) return null;

      const key = normName(namePart);
      if (userMap.has(key)) return userMap.get(key)!;

      // Try partial match (last name contained)
      for (const [k, id] of userMap.entries()) {
        if (k.includes(key) || key.includes(k)) return id;
      }

      // Create new operator user (auto-generated credentials)
      const initials = raw.split(' - ')[0]?.trim().toLowerCase() ?? 'op';
      const email = `${initials}@empresa.com`;
      const existingEmail = await qOne('SELECT id FROM users WHERE email = $1', [email]);
      if (existingEmail) {
        userMap.set(key, existingEmail.id);
        return existingEmail.id;
      }

      const hash = await bcrypt.hash('cambiar123', 10);
      const newId = await qInsert(
        `INSERT INTO users (name, email, password_hash, role, active) VALUES ($1,$2,$3,'operator',1)`,
        [namePart, email, hash]
      );
      userMap.set(key, newId);
      return newId;
    }

    // ── Process rows ──────────────────────────────────────────────────────
    let imported = 0, skipped = 0, updated = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const num = row['N°'];

      // Skip rows without a numeric N°
      if (!num || typeof num !== 'number') continue;

      const quoteNumber = String(Math.round(num));
      const clientName  = String(row['Cliente_Full'] || '').trim();
      const description = String(row['Nombre'] || '').trim();
      const receivedRaw = row['Recepción'];
      const deadlineRaw = row['Dead-line'];

      if (!clientName) { skipped++; continue; }

      const receivedDate = parseDate(receivedRaw);
      if (!receivedDate) { skipped++; continue; }

      // If no deadline, default to received + 30 days
      const deadlineDate = parseDate(deadlineRaw) || addDays(receivedDate, 30);

      const actualSendDate = parseDate(row['Fecha envío']) || null;
      const quoteType      = String(row['TIPO'] || '').trim() || null;
      const priority       = mapEscala(row['ESCALA']);
      const status         = mapStatus(row['Estado Inicial'], row['Estado Intermedio'], row['Estado Final'], actualSendDate);
      const observations   = String(row['Observaciones'] || '').trim() || null;

      let assignedUserId: number | null = null;
      try {
        assignedUserId = await resolveUser(String(row['Cotizó'] || ''));
      } catch { /* leave unassigned */ }

      try {
        // Check if already exists
        const existing = await qOne('SELECT id FROM quotes WHERE quote_number = $1', [quoteNumber]);

        if (existing) {
          // Update existing quote (sync from Excel)
          await qRun(`
            UPDATE quotes SET
              client_name=$1, description=$2, quote_type=$3,
              received_date=$4, deadline_date=$5, actual_send_date=$6,
              status=$7, priority=$8, observations=$9,
              assigned_user_id=COALESCE($10, assigned_user_id),
              updated_at=NOW()
            WHERE quote_number=$11`,
            [clientName, description, quoteType, receivedDate, deadlineDate,
             actualSendDate, status, priority, observations,
             assignedUserId, quoteNumber]
          );
          updated++;
        } else {
          // Insert new quote
          const id = await qInsert(`
            INSERT INTO quotes (
              quote_number, client_name, description, quote_type,
              received_date, deadline_date, actual_send_date,
              assigned_user_id, status, priority, observations, created_by
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
            [quoteNumber, clientName, description, quoteType,
             receivedDate, deadlineDate, actualSendDate,
             assignedUserId, status, priority, observations, user.userId]
          );
          await generateQuoteTasks(id);
          await updateQuoteProgress(id);
          await logActivity(id, user.userId, 'Importada desde Excel');
          imported++;
        }
      } catch (e: any) {
        errors.push(`Fila ${i + 2} (N° ${quoteNumber}): ${e.message}`);
      }
    }

    return NextResponse.json({
      imported,
      updated,
      skipped,
      total: rows.length,
      errors: errors.slice(0, 20), // cap at 20 errors
    });

  } catch (e: any) {
    return NextResponse.json({ error: 'Error al procesar: ' + e.message }, { status: 500 });
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function normName(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}

function parseDate(v: any): string | null {
  if (!v) return null;
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    return v.toISOString().split('T')[0];
  }
  const s = String(v).trim();
  if (!s || s === 'FALSE' || s === 'TRUE') return null;
  // ISO date
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  // DD/MM/YYYY
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  // Excel serial number
  const n = Number(s);
  if (!isNaN(n) && n > 40000 && n < 60000) {
    const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000);
    return d.toISOString().split('T')[0];
  }
  return null;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function mapEscala(v: any): string {
  const s = String(v || '').toUpperCase().trim();
  if (s === 'CHICA')   return 'low';
  if (s === 'MEDIANA') return 'medium';
  if (s === 'GRANDE')  return 'high';
  return 'medium';
}

function mapStatus(init: any, mid: any, fin: any, actualSendDate: string | null): string {
  const i = String(init || '').trim();
  const m = String(mid  || '').trim();
  const f = String(fin  || '').trim();

  // Estado Final (most definitive)
  if (f === 'Adjudicada')          return 'closed';
  if (f === 'No Adjudicada')       return 'cancelled';
  if (f === 'Falta Determinacion') return 'in_review';

  // Estado Intermedio
  if (m === 'Anulada')             return 'cancelled';
  if (m === 'Negociación')         return 'in_review';
  if (m === 'Hacer Seguimiento')   return 'in_review';
  if (m === 'Cotización Enviada')  return 'sent';
  if (m === 'A Futuro')            return 'pending_assignment';

  // Estado Inicial
  if (i === 'Cotización Enviada')      return actualSendDate ? 'sent' : 'in_review';
  if (i === 'Pendiente de Corrección') return 'in_progress';
  if (i === 'Pendiente de Cotizar')    return 'pending_assignment';

  return 'pending_assignment';
}
