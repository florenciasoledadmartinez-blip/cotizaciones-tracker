import { qAll, qOne, qRun, qInsert } from './db';

// ─────────────────────────────────────────────────────────────────────────────
// SERTEC — Circuito de aprobación de facturas de servicio (Paso B, sin IRL/OC)
// Ver spec v3: certificación de prestación por período, precio de referencia
// por servicio, presupuesto total del contrato y colas de excepción.
// ─────────────────────────────────────────────────────────────────────────────

export type InvoiceStatus =
  | 'pendiente_prestacion'
  | 'periodo_a_confirmar'
  | 'conflicto_parcial'
  | 'conflicto_no_cumplido'
  | 'conflicto_precio'
  | 'conflicto_presupuesto'
  | 'lista_para_autorizar'
  | 'para_pagar'
  | 'pagada'
  | 'rechazada';

let initPromise: Promise<void> | null = null;

export async function ensureSertecInit(): Promise<void> {
  if (!initPromise) initPromise = initialize();
  return initPromise;
}

async function initialize(): Promise<void> {
  await qRun(`
    CREATE TABLE IF NOT EXISTS sertec_providers (
      id         SERIAL PRIMARY KEY,
      name       TEXT NOT NULL,
      cuit       TEXT,
      email      TEXT,
      active     INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sertec_services (
      id                      SERIAL PRIMARY KEY,
      provider_id             INTEGER NOT NULL REFERENCES sertec_providers(id),
      name                    TEXT NOT NULL,
      cost_center             TEXT,
      department              TEXT,
      responsible_name        TEXT,
      periodicity             TEXT NOT NULL DEFAULT 'mensual'
                               CHECK (periodicity IN ('mensual','quincenal','evento')),
      unit_price              NUMERIC NOT NULL DEFAULT 0,
      price_update_basis      TEXT,
      duracion_periodos       INTEGER,
      periodo_presupuestario  TEXT NOT NULL DEFAULT 'anual'
                               CHECK (periodo_presupuestario IN ('mensual','trimestral','anual')),
      contract_start_date     DATE NOT NULL DEFAULT CURRENT_DATE,
      active                  INTEGER NOT NULL DEFAULT 1,
      created_at              TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at              TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sertec_price_history (
      id          SERIAL PRIMARY KEY,
      service_id  INTEGER NOT NULL REFERENCES sertec_services(id),
      price       NUMERIC NOT NULL,
      reason      TEXT,
      changed_by  TEXT,
      changed_at  TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sertec_periods (
      id                          SERIAL PRIMARY KEY,
      service_id                  INTEGER NOT NULL REFERENCES sertec_services(id),
      label                       TEXT NOT NULL,
      period_start                DATE NOT NULL,
      period_end                  DATE NOT NULL,
      certification_status        TEXT NOT NULL DEFAULT 'pendiente'
                                   CHECK (certification_status IN ('pendiente','cumplido','parcial','no_cumplido')),
      certification_observation   TEXT,
      certified_by                TEXT,
      certified_at                TIMESTAMP,
      created_at                  TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE (service_id, label)
    );

    CREATE TABLE IF NOT EXISTS sertec_invoices (
      id                     SERIAL PRIMARY KEY,
      provider_id            INTEGER NOT NULL REFERENCES sertec_providers(id),
      service_id             INTEGER NOT NULL REFERENCES sertec_services(id),
      invoice_number         TEXT,
      amount                 NUMERIC NOT NULL,
      received_date          DATE NOT NULL DEFAULT CURRENT_DATE,
      status                 TEXT NOT NULL DEFAULT 'pendiente_prestacion',
      price_match            TEXT NOT NULL DEFAULT 'pendiente'
                              CHECK (price_match IN ('coincide','no_coincide','pendiente')),
      period_unclear         INTEGER NOT NULL DEFAULT 0,
      reference_amount       NUMERIC,
      budget_balance_at_check NUMERIC,
      no_cumplido_override   INTEGER NOT NULL DEFAULT 0,
      parcial_resolution     TEXT,
      reopen_justification   TEXT,
      notes                  TEXT,
      authorized_by          TEXT,
      authorized_at          TIMESTAMP,
      paid_at                TIMESTAMP,
      created_by              TEXT,
      created_at              TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at              TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sertec_invoice_periods (
      invoice_id INTEGER NOT NULL REFERENCES sertec_invoices(id) ON DELETE CASCADE,
      period_id  INTEGER NOT NULL REFERENCES sertec_periods(id),
      PRIMARY KEY (invoice_id, period_id)
    );

    CREATE TABLE IF NOT EXISTS sertec_activity_log (
      id          SERIAL PRIMARY KEY,
      invoice_id  INTEGER REFERENCES sertec_invoices(id),
      service_id  INTEGER REFERENCES sertec_services(id),
      actor       TEXT,
      actor_role  TEXT,
      action      TEXT NOT NULL,
      detail      TEXT,
      created_at  TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  const { count } = (await qOne(`SELECT COUNT(*)::int as count FROM sertec_providers`))!;
  if (count === 0) await seed();
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function iso(d: Date): string {
  return d.toISOString().split('T')[0];
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
}

function monthLabel(y: number, m: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}`;
}

// ─── Period generation ("apertura automática del período") ────────────────────

export async function ensureOpenPeriods(serviceId: number): Promise<void> {
  const service = await qOne<any>('SELECT * FROM sertec_services WHERE id=$1', [serviceId]);
  if (!service || !service.active || service.periodicity === 'evento') return;

  const today = new Date();
  const start = new Date(service.contract_start_date);

  if (service.periodicity === 'mensual') {
    let cur = new Date(start.getFullYear(), start.getMonth(), 1);
    const limit = new Date(today.getFullYear(), today.getMonth(), 1);
    while (cur <= limit) {
      const label = monthLabel(cur.getFullYear(), cur.getMonth());
      const periodStart = new Date(cur.getFullYear(), cur.getMonth(), 1);
      const periodEnd = new Date(cur.getFullYear(), cur.getMonth() + 1, 0);
      await qRun(
        `INSERT INTO sertec_periods (service_id,label,period_start,period_end)
         VALUES ($1,$2,$3,$4) ON CONFLICT (service_id,label) DO NOTHING`,
        [serviceId, label, iso(periodStart), iso(periodEnd)]
      );
      cur = addMonths(cur, 1);
    }
  } else if (service.periodicity === 'quincenal') {
    let cur = new Date(start.getFullYear(), start.getMonth(), start.getDate() <= 15 ? 1 : 16);
    const limit = today;
    while (cur <= limit) {
      const isFirstHalf = cur.getDate() === 1;
      const periodStart = new Date(cur.getFullYear(), cur.getMonth(), isFirstHalf ? 1 : 16);
      const periodEnd = isFirstHalf
        ? new Date(cur.getFullYear(), cur.getMonth(), 15)
        : new Date(cur.getFullYear(), cur.getMonth() + 1, 0);
      const label = `${monthLabel(cur.getFullYear(), cur.getMonth())}-Q${isFirstHalf ? 1 : 2}`;
      await qRun(
        `INSERT INTO sertec_periods (service_id,label,period_start,period_end)
         VALUES ($1,$2,$3,$4) ON CONFLICT (service_id,label) DO NOTHING`,
        [serviceId, label, iso(periodStart), iso(periodEnd)]
      );
      cur = isFirstHalf
        ? new Date(cur.getFullYear(), cur.getMonth(), 16)
        : new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }
  }
}

export async function ensureAllOpenPeriods(): Promise<void> {
  const services = await qAll<any>(`SELECT id FROM sertec_services WHERE active=1 AND periodicity != 'evento'`);
  for (const s of services) await ensureOpenPeriods(s.id);
}

/** Períodos disponibles para asociar a una factura nueva (sin factura vigente ya aplicada). */
export async function getOpenPeriodsForService(serviceId: number): Promise<any[]> {
  await ensureOpenPeriods(serviceId);
  return qAll(
    `SELECT p.* FROM sertec_periods p
     WHERE p.service_id=$1
       AND NOT EXISTS (
         SELECT 1 FROM sertec_invoice_periods ip
         JOIN sertec_invoices i ON i.id = ip.invoice_id
         WHERE ip.period_id = p.id AND i.status != 'rechazada'
       )
     ORDER BY p.period_start`,
    [serviceId]
  );
}

// ─── Presupuesto del contrato ───────────────────────────────────────────────

interface BudgetInfo {
  has_budget: boolean;
  presupuesto_total: number;
  saldo_disponible: number;
  window_start: string;
  window_end: string;
}

const WINDOW_MULTIPLIER: Record<string, Record<string, number>> = {
  mensual:    { mensual: 1, trimestral: 3,  anual: 12 },
  quincenal:  { mensual: 2, trimestral: 6,  anual: 24 },
};

/** Calcula presupuesto total y saldo disponible de un servicio, excluyendo (opcionalmente) una factura. */
export async function computeServiceBudget(serviceId: number, excludeInvoiceId?: number): Promise<BudgetInfo | null> {
  const service = await qOne<any>('SELECT * FROM sertec_services WHERE id=$1', [serviceId]);
  if (!service) return null;

  const unitPrice = Number(service.unit_price);
  let windowStart: Date, windowEnd: Date, presupuestoTotal: number;

  if (service.duracion_periodos) {
    windowStart = new Date(service.contract_start_date);
    if (service.periodicity === 'quincenal') {
      windowEnd = addMonths(windowStart, Math.ceil(service.duracion_periodos / 2));
    } else {
      windowEnd = addMonths(windowStart, service.duracion_periodos);
    }
    presupuestoTotal = unitPrice * service.duracion_periodos;
  } else {
    if (service.periodicity === 'evento') return null; // sin ventana natural
    const mult = WINDOW_MULTIPLIER[service.periodicity]?.[service.periodo_presupuestario];
    if (!mult) return null;
    const today = new Date();
    const span = service.periodo_presupuestario === 'anual' ? 12 : service.periodo_presupuestario === 'trimestral' ? 3 : 1;
    const monthIndex = Math.floor(today.getMonth() / span) * span;
    windowStart = new Date(today.getFullYear(), monthIndex, 1);
    windowEnd = addMonths(windowStart, span);
    presupuestoTotal = unitPrice * mult;
  }

  const params: any[] = [serviceId, iso(windowStart), iso(windowEnd)];
  let excludeClause = '';
  if (excludeInvoiceId) {
    params.push(excludeInvoiceId);
    excludeClause = `AND i.id != $4`;
  }
  const rows = await qAll<any>(
    `SELECT DISTINCT i.id, i.amount FROM sertec_invoices i
     JOIN sertec_invoice_periods ip ON ip.invoice_id = i.id
     JOIN sertec_periods p ON p.id = ip.period_id
     WHERE i.service_id = $1
       AND p.period_start >= $2 AND p.period_start < $3
       AND i.status IN ('lista_para_autorizar','para_pagar','pagada')
       ${excludeClause}`,
    params
  );
  const spent = rows.reduce((acc, r) => acc + Number(r.amount), 0);

  return {
    has_budget: true,
    presupuesto_total: presupuestoTotal,
    saldo_disponible: presupuestoTotal - spent,
    window_start: iso(windowStart),
    window_end: iso(windowEnd),
  };
}

// ─── Motor de estados de la factura ────────────────────────────────────────

async function setStatus(invoiceId: number, status: InvoiceStatus): Promise<void> {
  await qRun(`UPDATE sertec_invoices SET status=$1, updated_at=NOW() WHERE id=$2`, [status, invoiceId]);
}

export async function recomputeInvoiceStatus(invoiceId: number): Promise<void> {
  const inv = await qOne<any>('SELECT * FROM sertec_invoices WHERE id=$1', [invoiceId]);
  if (!inv) return;
  if (inv.status === 'rechazada' || inv.status === 'pagada' || inv.status === 'para_pagar') return;

  if (inv.period_unclear) { await setStatus(invoiceId, 'periodo_a_confirmar'); return; }

  const periods = await qAll<any>(
    `SELECT p.* FROM sertec_periods p
     JOIN sertec_invoice_periods ip ON ip.period_id = p.id
     WHERE ip.invoice_id = $1`,
    [invoiceId]
  );
  if (periods.length === 0) { await setStatus(invoiceId, 'periodo_a_confirmar'); return; }

  if (periods.some(p => p.certification_status === 'no_cumplido') && !inv.no_cumplido_override) {
    await setStatus(invoiceId, 'conflicto_no_cumplido');
    return;
  }
  if (periods.some(p => p.certification_status === 'parcial') && !inv.parcial_resolution) {
    await setStatus(invoiceId, 'conflicto_parcial');
    return;
  }
  if (periods.some(p => p.certification_status === 'pendiente')) {
    await setStatus(invoiceId, 'pendiente_prestacion');
    return;
  }

  const service = await qOne<any>('SELECT * FROM sertec_services WHERE id=$1', [inv.service_id]);
  const referenceAmount = Number(service.unit_price) * periods.length;

  // Si Compras ya resolvió un cumplimiento parcial (nota de crédito o pago parcial
  // autorizado), el importe fue ajustado a propósito: no se vuelve a comparar
  // contra el precio de referencia de un período completo.
  if (inv.parcial_resolution) {
    await qRun(`UPDATE sertec_invoices SET reference_amount=$1, price_match='coincide' WHERE id=$2`, [referenceAmount, invoiceId]);
  } else {
    const matches = referenceAmount === 0
      ? Number(inv.amount) === 0
      : Math.abs(Number(inv.amount) - referenceAmount) <= referenceAmount * 0.01;

    await qRun(`UPDATE sertec_invoices SET reference_amount=$1, price_match=$2 WHERE id=$3`,
      [referenceAmount, matches ? 'coincide' : 'no_coincide', invoiceId]);

    if (!matches) { await setStatus(invoiceId, 'conflicto_precio'); return; }
  }

  const budget = await computeServiceBudget(service.id, invoiceId);
  if (budget && Number(inv.amount) > budget.saldo_disponible + 0.005) {
    await qRun(`UPDATE sertec_invoices SET budget_balance_at_check=$1 WHERE id=$2`, [budget.saldo_disponible, invoiceId]);
    await setStatus(invoiceId, 'conflicto_presupuesto');
    return;
  }

  await setStatus(invoiceId, 'lista_para_autorizar');
}

export async function logActivity(opts: {
  invoiceId?: number; serviceId?: number; actor?: string; actorRole?: string; action: string; detail?: string;
}): Promise<void> {
  await qRun(
    `INSERT INTO sertec_activity_log (invoice_id,service_id,actor,actor_role,action,detail)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [opts.invoiceId ?? null, opts.serviceId ?? null, opts.actor ?? null, opts.actorRole ?? null, opts.action, opts.detail ?? null]
  );
}

// ─── Consultas ──────────────────────────────────────────────────────────────

export async function getInvoiceWithDetail(id: number): Promise<any | null> {
  const inv = await qOne<any>(
    `SELECT i.*, pr.name as provider_name, s.name as service_name, s.unit_price as service_unit_price,
            s.periodicity, s.responsible_name, s.department
     FROM sertec_invoices i
     JOIN sertec_providers pr ON pr.id = i.provider_id
     JOIN sertec_services s ON s.id = i.service_id
     WHERE i.id = $1`,
    [id]
  );
  if (!inv) return null;
  inv.periods = await qAll(
    `SELECT p.* FROM sertec_periods p
     JOIN sertec_invoice_periods ip ON ip.period_id = p.id
     WHERE ip.invoice_id = $1 ORDER BY p.period_start`,
    [id]
  );
  inv.activity = await qAll(
    `SELECT * FROM sertec_activity_log WHERE invoice_id = $1 ORDER BY created_at DESC`,
    [id]
  );
  inv.budget = await computeServiceBudget(inv.service_id, id);
  return inv;
}

export const STATUS_LABELS: Record<InvoiceStatus, string> = {
  pendiente_prestacion: 'Pendiente de prestación',
  periodo_a_confirmar: 'Período a confirmar',
  conflicto_parcial: 'Conflicto — cumplimiento parcial',
  conflicto_no_cumplido: 'Conflicto — servicio no prestado',
  conflicto_precio: 'Conflicto de precio',
  conflicto_presupuesto: 'Conflicto de presupuesto',
  lista_para_autorizar: 'Lista para autorizar',
  para_pagar: 'Para pagar',
  pagada: 'Pagada',
  rechazada: 'Rechazada',
};

// ─── Datos de ejemplo ───────────────────────────────────────────────────────

async function seed(): Promise<void> {
  const today = new Date();
  const monthsAgo = (n: number) => iso(new Date(today.getFullYear(), today.getMonth() - n, 1));
  const daysAgo = (n: number) => iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() - n));

  const providers = [
    { key: 'ecosan', name: 'Ecosan Servicios Sanitarios', cuit: '30-70123456-1', email: 'facturacion@ecosan.com.ar' },
    { key: 'wg', name: 'WG Transporte', cuit: '30-71234567-2', email: 'administracion@wgtransporte.com.ar' },
    { key: 'horus', name: 'Horus Dispensers', cuit: '30-72345678-3', email: 'ventas@horus.com.ar' },
    { key: 'bahia', name: 'Bahía Comunicaciones S.A.', cuit: '30-73456789-4', email: 'cobranzas@bahiacom.com.ar' },
    { key: 'limp', name: 'Limpieza Integral del Sur', cuit: '30-74567890-5', email: 'admin@limpiezasur.com.ar' },
  ];
  const providerId: Record<string, number> = {};
  for (const p of providers) {
    providerId[p.key] = await qInsert(
      `INSERT INTO sertec_providers (name,cuit,email) VALUES ($1,$2,$3)`, [p.name, p.cuit, p.email]
    );
  }

  // Servicio 1 — mensual, sin plazo fijo, presupuesto anual con saldo holgado
  const svc1 = await qInsert(
    `INSERT INTO sertec_services
       (provider_id,name,cost_center,department,responsible_name,periodicity,unit_price,price_update_basis,periodo_presupuestario,contract_start_date)
     VALUES ($1,$2,$3,$4,$5,'mensual',$6,$7,'anual',$8)`,
    [providerId.ecosan, 'Mantenimiento de baños químicos (2 unidades)', 'Depósito Patagones', 'Operaciones BB',
     'Nancy Fernández', 45000, 'Fijo, sin actualización pactada', monthsAgo(5)]
  );

  // Servicio 2 — quincenal, con historial de aumento (para demostrar conflicto de precio)
  const svc2 = await qInsert(
    `INSERT INTO sertec_services
       (provider_id,name,cost_center,department,responsible_name,periodicity,unit_price,price_update_basis,periodo_presupuestario,contract_start_date)
     VALUES ($1,$2,$3,$4,$5,'quincenal',$6,$7,'anual',$8)`,
    [providerId.wg, 'Transporte de personal (combis, 96 viajes/quincena)', 'PBB', 'Operaciones BB',
     'Karina Suárez', 6404336.64, 'Se actualiza según el acuerdo de combustible con el proveedor', monthsAgo(3)]
  );
  await qRun(`INSERT INTO sertec_price_history (service_id,price,reason,changed_by) VALUES ($1,$2,$3,$4)`,
    [svc2, 6404336.64, 'Precio inicial del contrato', 'Karina Suárez']);

  // Servicio 3 — evento (sin calendario fijo, no genera períodos automáticos)
  const svc3 = await qInsert(
    `INSERT INTO sertec_services
       (provider_id,name,cost_center,department,responsible_name,periodicity,unit_price,price_update_basis,periodo_presupuestario,contract_start_date)
     VALUES ($1,$2,$3,$4,$5,'evento',$6,$7,'anual',$8)`,
    [providerId.horus, 'Alquiler dispenser + consumo de bidones', 'Oficina Trelew', 'Adm y Finanzas',
     'Eduardo Vilaminch', 8000, 'Precio por bidón consumido, pactado por evento', monthsAgo(2)]
  );

  // Servicio 4 — mensual, CON plazo fijo (contrato de 12 meses) → presupuesto total del contrato
  const svc4 = await qInsert(
    `INSERT INTO sertec_services
       (provider_id,name,cost_center,department,responsible_name,periodicity,unit_price,price_update_basis,duracion_periodos,contract_start_date)
     VALUES ($1,$2,$3,$4,$5,'mensual',$6,$7,$8,$9)`,
    [providerId.bahia, 'Abono de construcciones — obra Profertil', 'Profertil', 'Operaciones BB',
     'Diego Balera', 1212195, 'Ajuste semestral por índice de la construcción', 12, monthsAgo(4)]
  );

  // Servicio 5 — mensual, plazo fijo corto (3 meses) → para forzar un conflicto de presupuesto
  const svc5 = await qInsert(
    `INSERT INTO sertec_services
       (provider_id,name,cost_center,department,responsible_name,periodicity,unit_price,price_update_basis,duracion_periodos,contract_start_date)
     VALUES ($1,$2,$3,$4,$5,'mensual',$6,$7,$8,$9)`,
    [providerId.limp, 'Limpieza de oficinas — contrato puntual 3 meses', 'Oficina Central', 'Adm y Finanzas',
     'Cecilia Gómez', 180000, 'Fijo por los 3 meses del contrato', 3, monthsAgo(2)]
  );

  await ensureOpenPeriods(svc1);
  await ensureOpenPeriods(svc2);
  await ensureOpenPeriods(svc4);
  await ensureOpenPeriods(svc5);

  async function periodsOf(serviceId: number) {
    return qAll<any>('SELECT * FROM sertec_periods WHERE service_id=$1 ORDER BY period_start', [serviceId]);
  }
  async function certify(periodId: number, status: string, obs: string | null) {
    await qRun(
      `UPDATE sertec_periods SET certification_status=$1, certification_observation=$2, certified_by=$3, certified_at=NOW() WHERE id=$4`,
      [status, obs, 'Responsable operativo', periodId]
    );
  }
  async function createInvoice(opts: {
    providerId: number; serviceId: number; periodIds: number[]; amount: number;
    invoiceNumber: string; receivedDaysAgo: number;
  }): Promise<number> {
    const id = await qInsert(
      `INSERT INTO sertec_invoices (provider_id,service_id,invoice_number,amount,received_date,created_by)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [opts.providerId, opts.serviceId, opts.invoiceNumber, opts.amount, daysAgo(opts.receivedDaysAgo), 'Analista Cuentas a Pagar']
    );
    for (const pid of opts.periodIds)
      await qRun(`INSERT INTO sertec_invoice_periods (invoice_id,period_id) VALUES ($1,$2)`, [id, pid]);
    await recomputeInvoiceStatus(id);
    return id;
  }
  async function authorizeAndPay(invoiceId: number, pay: boolean) {
    await qRun(`UPDATE sertec_invoices SET status='para_pagar', authorized_by=$1, authorized_at=NOW() WHERE id=$2`,
      ['Mariano (Gerencia)', invoiceId]);
    if (pay) await qRun(`UPDATE sertec_invoices SET status='pagada', paid_at=NOW() WHERE id=$1`, [invoiceId]);
  }

  // ── Servicio 1 (Ecosan): historial prolijo, última factura pagada, último período pendiente ──
  const p1 = await periodsOf(svc1);
  for (let i = 0; i < p1.length - 1; i++) await certify(p1[i].id, 'cumplido', null);
  for (let i = 0; i < p1.length - 1; i++) {
    const inv = await createInvoice({
      providerId: providerId.ecosan, serviceId: svc1, periodIds: [p1[i].id], amount: 45000,
      invoiceNumber: `A-0001-${1000 + i}`, receivedDaysAgo: (p1.length - i) * 28,
    });
    await authorizeAndPay(inv, true);
  }
  // el último período del mes en curso queda "Pendiente" — nadie certificó todavía

  // ── Servicio 2 (WG Transporte): aumento no reflejado aún → conflicto de precio ──
  const p2 = await periodsOf(svc2);
  for (let i = 0; i < p2.length - 1; i++) await certify(p2[i].id, 'cumplido', null);
  for (let i = 0; i < p2.length - 2; i++) {
    const inv = await createInvoice({
      providerId: providerId.wg, serviceId: svc2, periodIds: [p2[i].id], amount: 6404336.64,
      invoiceNumber: `B-0002-${2000 + i}`, receivedDaysAgo: (p2.length - i) * 15,
    });
    await authorizeAndPay(inv, true);
  }
  if (p2.length >= 2) {
    // la última quincena cumplida llega facturada con un 6% de aumento no acordado en el sistema todavía
    await createInvoice({
      providerId: providerId.wg, serviceId: svc2, periodIds: [p2[p2.length - 2].id], amount: 6788596.84,
      invoiceNumber: `B-0002-${2000 + p2.length - 2}`, receivedDaysAgo: 6,
    });
  }

  // ── Servicio 3 (Horus, evento): un período ad-hoc con cumplimiento parcial ──
  const evId = await qInsert(
    `INSERT INTO sertec_periods (service_id,label,period_start,period_end,certification_status,certification_observation,certified_by,certified_at)
     VALUES ($1,$2,$3,$4,'parcial',$5,'Responsable operativo',NOW())`,
    [svc3, `Evento ${daysAgo(10)}`, daysAgo(10), daysAgo(10),
     'Solo se repusieron 6 de los 10 bidones acordados para el mes de invierno.']
  );
  await createInvoice({
    providerId: providerId.horus, serviceId: svc3, periodIds: [evId], amount: 80000,
    invoiceNumber: 'C-0003-500', receivedDaysAgo: 4,
  });

  // ── Servicio 4 (Bahía): un período no cumplido → bloqueado automáticamente ──
  const p4 = await periodsOf(svc4);
  for (let i = 0; i < p4.length - 1; i++) await certify(p4[i].id, 'cumplido', null);
  for (let i = 0; i < p4.length - 2; i++) {
    const inv = await createInvoice({
      providerId: providerId.bahia, serviceId: svc4, periodIds: [p4[i].id], amount: 1212195,
      invoiceNumber: `D-0004-${3000 + i}`, receivedDaysAgo: (p4.length - i) * 28,
    });
    await authorizeAndPay(inv, true);
  }
  if (p4.length >= 2) {
    await certify(p4[p4.length - 2].id, 'no_cumplido', 'La obra estuvo detenida esa quincena; el proveedor no prestó servicio.');
    await createInvoice({
      providerId: providerId.bahia, serviceId: svc4, periodIds: [p4[p4.length - 2].id], amount: 1212195,
      invoiceNumber: `D-0004-${3000 + p4.length - 2}`, receivedDaysAgo: 5,
    });
  }

  // ── Servicio 5 (Limpieza Integral): contrato corto de 3 meses, presupuesto casi agotado ──
  const p5 = await periodsOf(svc5);
  for (const p of p5) await certify(p.id, 'cumplido', null);
  if (p5.length >= 3) {
    const inv1 = await createInvoice({
      providerId: providerId.limp, serviceId: svc5, periodIds: [p5[0].id], amount: 180000,
      invoiceNumber: 'E-0005-01', receivedDaysAgo: 55,
    });
    await authorizeAndPay(inv1, true);
    const inv2 = await createInvoice({
      providerId: providerId.limp, serviceId: svc5, periodIds: [p5[1].id], amount: 180000,
      invoiceNumber: 'E-0005-02', receivedDaysAgo: 27,
    });
    await authorizeAndPay(inv2, true);
    // el tercer y último mes del contrato llega apenas por encima del precio de referencia
    // (dentro de la tolerancia de precio) pero ya no queda saldo de presupuesto para cubrirlo
    await createInvoice({
      providerId: providerId.limp, serviceId: svc5, periodIds: [p5[2].id], amount: 180900,
      invoiceNumber: 'E-0005-03', receivedDaysAgo: 3,
    });
  }

  // ── Una factura con período ambiguo, para poblar la cola "Período a confirmar" ──
  const ambInv = await qInsert(
    `INSERT INTO sertec_invoices (provider_id,service_id,invoice_number,amount,received_date,period_unclear,created_by)
     VALUES ($1,$2,$3,$4,$5,1,$6)`,
    [providerId.ecosan, svc1, 'A-0001-9999', 90000, daysAgo(2), 'Analista Cuentas a Pagar']
  );
  await recomputeInvoiceStatus(ambInv);
  await logActivity({
    invoiceId: ambInv, serviceId: svc1, actor: 'Analista Cuentas a Pagar', actorRole: 'pago_a_proveedores',
    action: 'Factura registrada', detail: 'El importe parece cubrir dos meses; no está claro a qué período(s) corresponde.',
  });
}

export default { ensureSertecInit };
