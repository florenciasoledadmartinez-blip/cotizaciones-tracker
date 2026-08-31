import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, isLeaderOrAdmin } from '@/lib/auth';
import { qAll, qInsert, qRun } from '@/lib/db';
import { ensureSertecInit } from '@/lib/sertec-db';

/**
 * Importación / reinicio de base (sección 6 de la spec) — exclusivo del rol
 * Administrador. Pensado para la carga inicial única: reemplaza por completo
 * los datos de ejemplo por los datos reales de proveedores y condición de
 * servicio. No es un flujo de uso recurrente.
 */
export async function POST(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user || !isLeaderOrAdmin(user.role))
    return NextResponse.json({ error: 'Sin permiso — esta acción es exclusiva del rol Administrador' }, { status: 403 });
  await ensureSertecInit();

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const text = formData.get('text') as string | null;
    const replaceAll = formData.get('replaceAll') === 'true';

    let rows: any[] = [];
    if (file) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const XLSX = require('xlsx');
      const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
      const ws = workbook.Sheets[workbook.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    } else if (text?.trim()) {
      rows = parseDelimited(text);
    } else {
      return NextResponse.json({ error: 'Subí un archivo o pegá los datos' }, { status: 400 });
    }

    if (!rows.length) return NextResponse.json({ error: 'No se encontraron filas de datos' }, { status: 400 });

    let deletedProviders = 0;
    if (replaceAll) {
      const countRow = await qAll('SELECT COUNT(*)::int as n FROM sertec_providers');
      deletedProviders = countRow[0]?.n ?? 0;
      await qRun('DELETE FROM sertec_activity_log');
      await qRun('DELETE FROM sertec_invoice_periods');
      await qRun('DELETE FROM sertec_invoices');
      await qRun('DELETE FROM sertec_price_history');
      await qRun('DELETE FROM sertec_periods');
      await qRun('DELETE FROM sertec_services');
      await qRun('DELETE FROM sertec_providers');
    }

    const existingProviders = await qAll<any>('SELECT id, name FROM sertec_providers');
    const providerByName = new Map<string, number>(existingProviders.map(p => [norm(p.name), p.id]));

    let providersCreated = 0, servicesCreated = 0, skipped = 0;

    for (const row of rows) {
      const providerName = String(row['Proveedor'] || row['proveedor'] || '').trim();
      const serviceName = String(row['Servicio'] || row['servicio'] || row['Concepto'] || '').trim();
      if (!providerName || !serviceName) { skipped++; continue; }

      let providerId = providerByName.get(norm(providerName));
      if (!providerId) {
        providerId = await qInsert(`INSERT INTO sertec_providers (name,cuit,email) VALUES ($1,$2,$3)`, [
          providerName,
          String(row['CUIT'] || row['cuit'] || '').trim() || null,
          String(row['Email'] || row['email'] || '').trim() || null,
        ]);
        providerByName.set(norm(providerName), providerId);
        providersCreated++;
      }

      const periodicity = mapPeriodicity(row['Periodicidad'] || row['periodicidad']);
      const price = parseNumber(row['Precio'] || row['precio'] || row['Presupuesto']) ?? 0;
      const duracion = parseNumber(row['Duración períodos'] || row['Duracion periodos'] || row['duracion_periodos']);
      const periodoPresupuestario = mapBudgetPeriod(row['Período presupuestario'] || row['periodo_presupuestario']);
      const contractStart = parseDate(row['Fecha inicio'] || row['fecha_inicio']) || null;

      const svcId = await qInsert(`
        INSERT INTO sertec_services
          (provider_id,name,cost_center,department,responsible_name,periodicity,unit_price,
           price_update_basis,duracion_periodos,periodo_presupuestario,contract_start_date)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,COALESCE($11,CURRENT_DATE))`,
        [providerId, serviceName,
         String(row['Centro de costos'] || row['centro_de_costos'] || '').trim() || null,
         String(row['Gerencia'] || row['Gerencia responsable'] || row['departamento'] || '').trim() || null,
         String(row['Responsable'] || row['responsable'] || '').trim() || null,
         periodicity, price,
         String(row['Base de actualización'] || row['base_actualizacion'] || '').trim() || null,
         duracion, periodoPresupuestario, contractStart]
      );
      if (price > 0) {
        await qRun(`INSERT INTO sertec_price_history (service_id,price,reason,changed_by) VALUES ($1,$2,$3,$4)`,
          [svcId, price, 'Importado desde archivo', user.name]);
      }
      servicesCreated++;
    }

    return NextResponse.json({
      deletedProviders, providersCreated, servicesCreated, skipped, total: rows.length,
    });
  } catch (e: any) {
    console.error('SERTEC import error:', e);
    return NextResponse.json({ error: 'Error al procesar: ' + e.message }, { status: 500 });
  }
}

function norm(s: string) { return s.toLowerCase().trim().replace(/\s+/g, ' '); }

function parseNumber(v: any): number | null {
  if (v === '' || v == null) return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/\./g, '').replace(',', '.'));
  return isNaN(n) ? null : n;
}

function parseDate(v: any): string | null {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString().split('T')[0];
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

function mapPeriodicity(v: any): string {
  const s = String(v || '').toLowerCase().trim();
  if (s.startsWith('quinc')) return 'quincenal';
  if (s.startsWith('event')) return 'evento';
  return 'mensual';
}

function mapBudgetPeriod(v: any): string {
  const s = String(v || '').toLowerCase().trim();
  if (s.startsWith('mensual')) return 'mensual';
  if (s.startsWith('trimest')) return 'trimestral';
  return 'anual';
}

/** Parsea texto pegado (TSV o CSV) usando la primera fila como encabezado. */
function parseDelimited(text: string): any[] {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim().length);
  if (!lines.length) return [];
  const delim = lines[0].includes('\t') ? '\t' : ',';
  const headers = lines[0].split(delim).map(h => h.trim());
  return lines.slice(1).map(line => {
    const cells = line.split(delim);
    const row: any = {};
    headers.forEach((h, i) => { row[h] = (cells[i] ?? '').trim(); });
    return row;
  });
}
