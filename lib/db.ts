import { Pool } from 'pg';
import { types as pgTypes } from 'pg';

// ─── Return dates as plain strings (YYYY-MM-DD) instead of JS Date objects ───
pgTypes.setTypeParser(1082, (val: string) => val);  // DATE
pgTypes.setTypeParser(1114, (val: string) => val);  // TIMESTAMP
pgTypes.setTypeParser(1184, (val: string) => val);  // TIMESTAMPTZ

// ─── Singleton pool (survives Next.js hot-reload in dev) ─────────────────────
const g = global as unknown as { _pgPool?: Pool };

function getPool(): Pool {
  if (!g._pgPool) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL no está configurada.');
    g._pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
      max: 5,
    });
  }
  return g._pgPool;
}

// ─── Initialization guard ────────────────────────────────────────────────────
let initPromise: Promise<void> | null = null;

async function ensureInit(): Promise<void> {
  if (!initPromise) initPromise = initialize();
  return initPromise;
}

// ─── Query helpers ────────────────────────────────────────────────────────────

export async function qAll<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  await ensureInit();
  const { rows } = await getPool().query(sql, params);
  return rows as T[];
}

export async function qOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
  const rows = await qAll<T>(sql, params);
  return rows[0] ?? null;
}

export async function qRun(sql: string, params: any[] = []): Promise<number> {
  await ensureInit();
  const r = await getPool().query(sql, params);
  return r.rowCount ?? 0;
}

/** INSERT … returning the new row's id */
export async function qInsert(sql: string, params: any[] = []): Promise<number> {
  await ensureInit();
  const { rows } = await getPool().query(`${sql} RETURNING id`, params);
  return rows[0]?.id as number;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

async function initialize(): Promise<void> {
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id        SERIAL PRIMARY KEY,
      name      TEXT    NOT NULL,
      email     TEXT    UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role      TEXT    NOT NULL DEFAULT 'operator'
                CHECK (role IN ('admin','leader','operator')),
      active    INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS quotes (
      id                   SERIAL PRIMARY KEY,
      quote_number         TEXT UNIQUE NOT NULL,
      client_name          TEXT NOT NULL,
      description          TEXT,
      quote_type           TEXT,
      received_date        DATE NOT NULL,
      deadline_date        DATE NOT NULL,
      estimated_send_date  DATE,
      actual_send_date     DATE,
      assigned_user_id     INTEGER REFERENCES users(id),
      status               TEXT NOT NULL DEFAULT 'pending_assignment'
                           CHECK (status IN (
                             'pending_assignment','assigned','in_progress',
                             'in_review','sent','expired','cancelled','closed')),
      priority             TEXT NOT NULL DEFAULT 'medium'
                           CHECK (priority IN ('low','medium','high','urgent')),
      observations         TEXT,
      progress_percentage  REAL NOT NULL DEFAULT 0,
      created_by           INTEGER REFERENCES users(id),
      created_at           TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at           TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS task_templates (
      id          SERIAL PRIMARY KEY,
      name        TEXT    NOT NULL,
      description TEXT,
      order_index INTEGER NOT NULL DEFAULT 0,
      active      INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS subtask_templates (
      id               SERIAL PRIMARY KEY,
      task_template_id INTEGER NOT NULL REFERENCES task_templates(id),
      name             TEXT    NOT NULL,
      description      TEXT,
      order_index      INTEGER NOT NULL DEFAULT 0,
      active           INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS quote_tasks (
      id               SERIAL PRIMARY KEY,
      quote_id         INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      task_template_id INTEGER NOT NULL REFERENCES task_templates(id),
      status           TEXT    NOT NULL DEFAULT 'pending',
      progress_percentage REAL NOT NULL DEFAULT 0,
      order_index      INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS quote_subtasks (
      id                  SERIAL PRIMARY KEY,
      quote_id            INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      quote_task_id       INTEGER NOT NULL REFERENCES quote_tasks(id) ON DELETE CASCADE,
      subtask_template_id INTEGER NOT NULL REFERENCES subtask_templates(id),
      status              TEXT    NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','done','not_applicable')),
      completed_by        INTEGER REFERENCES users(id),
      completed_at        TIMESTAMP,
      observations        TEXT
    );

    CREATE TABLE IF NOT EXISTS activity_log (
      id             SERIAL PRIMARY KEY,
      quote_id       INTEGER REFERENCES quotes(id),
      user_id        INTEGER REFERENCES users(id),
      action         TEXT NOT NULL,
      field_name     TEXT,
      previous_value TEXT,
      new_value      TEXT,
      created_at     TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ai_insights (
      id                   SERIAL PRIMARY KEY,
      quote_id             INTEGER NOT NULL REFERENCES quotes(id),
      summary              TEXT,
      risk_level           TEXT,
      suggested_next_action TEXT,
      created_at           TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  const { rows } = await pool.query('SELECT COUNT(*)::int as count FROM users');
  if (rows[0].count === 0) await seed(pool);
}

// ─── Seed data ────────────────────────────────────────────────────────────────

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

async function seed(pool: Pool): Promise<void> {
  const bcrypt = await import('bcryptjs');

  // Users
  const users = [
    { name: 'Administrador Sistema', email: 'admin@empresa.com', pass: 'admin123',  role: 'admin'    },
    { name: 'María García',          email: 'lider@empresa.com', pass: 'lider123',  role: 'leader'   },
    { name: 'Juan López',            email: 'juan@empresa.com',  pass: 'usuario123', role: 'operator' },
    { name: 'Ana Martínez',          email: 'ana@empresa.com',   pass: 'usuario123', role: 'operator' },
    { name: 'Carlos Rodríguez',      email: 'carlos@empresa.com', pass: 'usuario123', role: 'operator' },
  ];
  for (const u of users) {
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
      [u.name, u.email, bcrypt.hashSync(u.pass, 10), u.role]
    );
  }

  // Task templates
  const templates = [
    { name: 'Recepción y análisis inicial',  desc: 'Confirmar y analizar la solicitud', subs: ['Confirmar recepción de la solicitud','Revisar información recibida','Identificar información faltante'] },
    { name: 'Relevamiento técnico/comercial', desc: 'Levantar info técnica y armar propuesta', subs: ['Revisar requerimientos técnicos','Consultar información interna','Armar propuesta preliminar'] },
    { name: 'Validación interna',             desc: 'Revisar y validar internamente', subs: ['Revisar consistencia de la cotización','Validar condiciones comerciales','Solicitar aprobación si corresponde'] },
    { name: 'Envío al cliente',               desc: 'Preparar y enviar documentación', subs: ['Preparar documentación final','Enviar cotización al cliente','Registrar fecha real de envío'] },
    { name: 'Seguimiento posterior',          desc: 'Seguimiento post-envío y cierre', subs: ['Registrar respuesta del cliente','Actualizar estado de oportunidad','Cerrar, mantener o cancelar'] },
  ];

  const taskIds: number[] = [];
  for (let i = 0; i < templates.length; i++) {
    const t = templates[i];
    const { rows } = await pool.query(
      `INSERT INTO task_templates (name, description, order_index) VALUES ($1,$2,$3) RETURNING id`,
      [t.name, t.desc, i + 1]
    );
    const tid = rows[0].id as number;
    taskIds.push(tid);
    for (let j = 0; j < t.subs.length; j++) {
      await pool.query(
        `INSERT INTO subtask_templates (task_template_id, name, order_index) VALUES ($1,$2,$3)`,
        [tid, t.subs[j], j + 1]
      );
    }
  }

  // Sample quotes
  const { rows: userRows } = await pool.query('SELECT id, email FROM users ORDER BY id');
  const uid = (email: string) => userRows.find((u: any) => u.email === email)?.id;

  const samples = [
    { num:'COT-2024-001', client:'Empresa ABC S.A.',       desc:'Provisión de equipos de refrigeración industrial', type:'Equipamiento', recv:addDays(-15), dl:addDays(5),   est:addDays(3),   actual:null,        user:uid('juan@empresa.com'),   status:'in_progress',        pri:'high',   obs:'Cliente solicita plazo reducido' },
    { num:'COT-2024-002', client:'Corporación XYZ',        desc:'Servicio de mantenimiento anual preventivo',       type:'Servicio',     recv:addDays(-10), dl:addDays(10),  est:addDays(8),   actual:null,        user:uid('ana@empresa.com'),    status:'in_progress',        pri:'medium', obs:'' },
    { num:'COT-2024-003', client:'Industrias Norte S.R.L.',desc:'Instalación de sistema de monitoreo',              type:'Instalación',  recv:addDays(-20), dl:addDays(-2),  est:addDays(-3),  actual:null,        user:uid('juan@empresa.com'),   status:'in_progress',        pri:'urgent', obs:'Requiere visita técnica previa' },
    { num:'COT-2024-004', client:'Comercial Sur S.A.',     desc:'Repuestos y suministros varios',                   type:'Repuestos',    recv:addDays(-5),  dl:addDays(15),  est:addDays(12),  actual:null,        user:null,                      status:'pending_assignment', pri:'low',    obs:'' },
    { num:'COT-2024-005', client:'Global Tech Argentina',  desc:'Consultoría técnica especializada',                type:'Consultoría',  recv:addDays(-30), dl:addDays(-10), est:addDays(-12), actual:addDays(-8), user:uid('ana@empresa.com'),    status:'sent',               pri:'medium', obs:'Enviada en fecha pactada' },
    { num:'COT-2024-006', client:'Minera del Sur',         desc:'Suministro de equipos de protección industrial',   type:'Equipamiento', recv:addDays(-8),  dl:addDays(20),  est:addDays(18),  actual:null,        user:uid('carlos@empresa.com'), status:'assigned',           pri:'medium', obs:'' },
    { num:'COT-2024-007', client:'Transporte Rápido S.A.', desc:'Servicio de consultoría logística',                type:'Consultoría',  recv:addDays(-3),  dl:addDays(7),   est:addDays(6),   actual:null,        user:uid('carlos@empresa.com'), status:'in_review',          pri:'high',   obs:'En revisión por gerencia' },
  ];

  const leaderId = uid('lider@empresa.com');
  for (const q of samples) {
    const { rows: qr } = await pool.query(`
      INSERT INTO quotes (quote_number,client_name,description,quote_type,received_date,deadline_date,
        estimated_send_date,actual_send_date,assigned_user_id,status,priority,observations,created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
      [q.num,q.client,q.desc,q.type,q.recv,q.dl,q.est,q.actual,q.user,q.status,q.pri,q.obs,leaderId]
    );
    const qid = qr[0].id as number;
    await _generateQuoteTasks(pool, qid);

    const doneCount = q.status==='sent' ? 15 : q.status==='in_review' ? 12 : q.status==='in_progress' ? 6 : q.status==='assigned' ? 3 : 0;
    if (doneCount > 0 && q.user) await _markSubtasks(pool, qid, q.user, doneCount);
    await _updateQuoteProgress(pool, qid);
  }

  // Auto-expire overdue
  await pool.query(`
    UPDATE quotes SET status='expired', updated_at=NOW()
    WHERE deadline_date < CURRENT_DATE
    AND actual_send_date IS NULL
    AND status NOT IN ('sent','cancelled','closed','expired')
  `);
}

// ─── Internal helpers (use pool directly, no ensureInit needed) ───────────────

async function _generateQuoteTasks(pool: Pool, quoteId: number): Promise<void> {
  const { rows: tasks } = await pool.query('SELECT * FROM task_templates WHERE active=1 ORDER BY order_index');
  const { rows: subs }  = await pool.query('SELECT * FROM subtask_templates WHERE active=1 ORDER BY order_index');
  for (const t of tasks) {
    const { rows: tr } = await pool.query(
      `INSERT INTO quote_tasks (quote_id,task_template_id,status,progress_percentage,order_index) VALUES ($1,$2,'pending',0,$3) RETURNING id`,
      [quoteId, t.id, t.order_index]
    );
    const qtId = tr[0].id as number;
    for (const s of subs.filter((x: any) => x.task_template_id === t.id)) {
      await pool.query(
        `INSERT INTO quote_subtasks (quote_id,quote_task_id,subtask_template_id,status) VALUES ($1,$2,$3,'pending')`,
        [quoteId, qtId, s.id]
      );
    }
  }
}

async function _markSubtasks(pool: Pool, quoteId: number, userId: number, count: number): Promise<void> {
  const { rows } = await pool.query(`
    SELECT qs.id FROM quote_subtasks qs
    JOIN quote_tasks qt ON qs.quote_task_id=qt.id
    WHERE qs.quote_id=$1 ORDER BY qt.order_index, qs.id
  `, [quoteId]);
  for (let i = 0; i < Math.min(count, rows.length); i++) {
    await pool.query(
      `UPDATE quote_subtasks SET status='done', completed_by=$1, completed_at=NOW()-INTERVAL '2 hours' WHERE id=$2`,
      [userId, rows[i].id]
    );
  }
}

async function _updateQuoteProgress(pool: Pool, quoteId: number): Promise<number> {
  const { rows: subs } = await pool.query(
    `SELECT status FROM quote_subtasks WHERE quote_id=$1 AND status!='not_applicable'`,
    [quoteId]
  );
  const total = subs.length;
  const done  = subs.filter((s: any) => s.status === 'done').length;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;
  await pool.query(`UPDATE quotes SET progress_percentage=$1, updated_at=NOW() WHERE id=$2`, [progress, quoteId]);

  const { rows: tasks } = await pool.query('SELECT id FROM quote_tasks WHERE quote_id=$1', [quoteId]);
  for (const task of tasks) {
    const { rows: ts } = await pool.query(
      `SELECT status FROM quote_subtasks WHERE quote_task_id=$1 AND status!='not_applicable'`, [task.id]
    );
    const tp = ts.length > 0 ? Math.round((ts.filter((s:any) => s.status==='done').length / ts.length) * 100) : 0;
    await pool.query('UPDATE quote_tasks SET progress_percentage=$1 WHERE id=$2', [tp, task.id]);
  }
  return progress;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function generateQuoteTasks(quoteId: number): Promise<void> {
  await ensureInit();
  await _generateQuoteTasks(getPool(), quoteId);
}

export async function updateQuoteProgress(quoteId: number): Promise<number> {
  await ensureInit();
  return _updateQuoteProgress(getPool(), quoteId);
}

export async function checkAndUpdateExpiredQuotes(): Promise<void> {
  await ensureInit();
  await getPool().query(`
    UPDATE quotes SET status='expired', updated_at=NOW()
    WHERE deadline_date < CURRENT_DATE
    AND actual_send_date IS NULL
    AND status NOT IN ('sent','cancelled','closed','expired')
  `);
}

export async function logActivity(
  quoteId: number, userId: number, action: string,
  fieldName?: string, prevVal?: string, newVal?: string
): Promise<void> {
  await ensureInit();
  await getPool().query(
    `INSERT INTO activity_log (quote_id,user_id,action,field_name,previous_value,new_value) VALUES ($1,$2,$3,$4,$5,$6)`,
    [quoteId, userId, action, fieldName ?? null, prevVal ?? null, newVal ?? null]
  );
}

export async function getAllQuotes(filters?: {
  status?: string; priority?: string; assignedUserId?: number;
  search?: string; expiredOnly?: boolean; dueSoonDays?: number;
}): Promise<any[]> {
  await checkAndUpdateExpiredQuotes();

  const params: any[] = [];
  let p = 0;
  const $ = (v: any) => { params.push(v); return `$${++p}`; };

  let where = 'WHERE 1=1';
  if (filters?.status)         where += ` AND q.status=${$(filters.status)}`;
  if (filters?.priority)       where += ` AND q.priority=${$(filters.priority)}`;
  if (filters?.assignedUserId) where += ` AND q.assigned_user_id=${$(filters.assignedUserId)}`;
  if (filters?.search) {
    const s = `%${filters.search}%`;
    where += ` AND (q.quote_number ILIKE ${$(s)} OR q.client_name ILIKE ${$(s)} OR q.description ILIKE ${$(s)})`;
  }
  if (filters?.expiredOnly) where += ` AND q.status='expired'`;
  if (filters?.dueSoonDays) {
    const until = addDays(filters.dueSoonDays);
    where += ` AND q.deadline_date BETWEEN CURRENT_DATE AND ${$(until)}::date AND q.status NOT IN ('sent','cancelled','closed','expired')`;
  }

  const { rows } = await getPool().query(`
    SELECT q.*,
           u.name as assigned_user_name,
           (q.deadline_date::date - CURRENT_DATE)::int as days_remaining
    FROM quotes q
    LEFT JOIN users u ON q.assigned_user_id=u.id
    ${where}
    ORDER BY q.priority DESC, q.deadline_date ASC
  `, params);
  return rows;
}

export async function getQuoteById(id: number): Promise<any | null> {
  await ensureInit();
  const pool = getPool();

  const quote = await qOne(`
    SELECT q.*, u.name as assigned_user_name, c.name as created_by_name
    FROM quotes q
    LEFT JOIN users u ON q.assigned_user_id=u.id
    LEFT JOIN users c ON q.created_by=c.id
    WHERE q.id=$1
  `, [id]);
  if (!quote) return null;

  const tasks = await qAll(`
    SELECT qt.*, tt.name as template_name, tt.description as template_description
    FROM quote_tasks qt
    JOIN task_templates tt ON qt.task_template_id=tt.id
    WHERE qt.quote_id=$1 ORDER BY qt.order_index
  `, [id]);

  for (const task of tasks) {
    task.subtasks = await qAll(`
      SELECT qs.*, st.name as template_name, u.name as completed_by_name
      FROM quote_subtasks qs
      JOIN subtask_templates st ON qs.subtask_template_id=st.id
      LEFT JOIN users u ON qs.completed_by=u.id
      WHERE qs.quote_task_id=$1 ORDER BY st.order_index
    `, [task.id]);
  }

  const activityLog = await qAll(`
    SELECT al.*, u.name as user_name
    FROM activity_log al LEFT JOIN users u ON al.user_id=u.id
    WHERE al.quote_id=$1 ORDER BY al.created_at DESC LIMIT 50
  `, [id]);

  const aiInsight = await qOne(`
    SELECT * FROM ai_insights WHERE quote_id=$1 ORDER BY created_at DESC LIMIT 1
  `, [id]);

  return { ...quote, tasks, activityLog, aiInsight };
}

export async function getDashboardStats(): Promise<any> {
  await checkAndUpdateExpiredQuotes();

  const stats = await qOne(`
    SELECT
      COUNT(*)::int                                                       as total,
      SUM(CASE WHEN status NOT IN ('sent','cancelled','closed') THEN 1 ELSE 0 END)::int as open,
      SUM(CASE WHEN status='pending_assignment' THEN 1 ELSE 0 END)::int  as pending_assignment,
      SUM(CASE WHEN status IN ('in_progress','in_review','assigned') THEN 1 ELSE 0 END)::int as in_progress,
      SUM(CASE WHEN status='expired' THEN 1 ELSE 0 END)::int             as expired,
      SUM(CASE WHEN status='sent' THEN 1 ELSE 0 END)::int                as sent,
      SUM(CASE WHEN status='cancelled' THEN 1 ELSE 0 END)::int           as cancelled,
      ROUND(AVG(CASE WHEN status NOT IN ('sent','cancelled','closed') THEN progress_percentage END)::numeric,1) as avg_progress,
      SUM(CASE WHEN deadline_date BETWEEN CURRENT_DATE AND CURRENT_DATE+INTERVAL '3 days'
               AND status NOT IN ('sent','cancelled','closed','expired') THEN 1 ELSE 0 END)::int as due_soon_3d,
      SUM(CASE WHEN deadline_date BETWEEN CURRENT_DATE AND CURRENT_DATE+INTERVAL '7 days'
               AND status NOT IN ('sent','cancelled','closed','expired') THEN 1 ELSE 0 END)::int as due_soon_7d
    FROM quotes
  `);

  const byUser = await qAll(`
    SELECT u.id, u.name,
      COUNT(q.id)::int                                                               as total,
      SUM(CASE WHEN q.status NOT IN ('sent','cancelled','closed') THEN 1 ELSE 0 END)::int as active,
      SUM(CASE WHEN q.status='expired' THEN 1 ELSE 0 END)::int                      as expired,
      ROUND(AVG(q.progress_percentage)::numeric,1)                                  as avg_progress
    FROM users u
    LEFT JOIN quotes q ON q.assigned_user_id=u.id
    WHERE u.role='operator' AND u.active=1
    GROUP BY u.id, u.name
    HAVING COUNT(q.id) > 0
    ORDER BY u.name
  `);

  const byStatus   = await qAll(`SELECT status, COUNT(*)::int as count FROM quotes GROUP BY status`);
  const byPriority = await qAll(`SELECT priority, COUNT(*)::int as count FROM quotes GROUP BY priority`);
  const recentActivity = await qAll(`
    SELECT al.*, u.name as user_name, q.quote_number
    FROM activity_log al
    LEFT JOIN users u ON al.user_id=u.id
    LEFT JOIN quotes q ON al.quote_id=q.id
    ORDER BY al.created_at DESC LIMIT 10
  `);

  return { stats, byUser, byStatus, byPriority, recentActivity };
}

export async function getAllUsers(): Promise<any[]> {
  return qAll(`
    SELECT
      u.id, u.name, u.email, u.role, u.active, u.created_at,
      COUNT(q.id)::int AS quote_count
    FROM users u
    LEFT JOIN quotes q ON q.assigned_user_id = u.id
    GROUP BY u.id
    ORDER BY u.name
  `);
}

export async function getTaskTemplates(): Promise<any[]> {
  await ensureInit();
  const tasks = await qAll('SELECT * FROM task_templates ORDER BY order_index');
  for (const t of tasks) {
    t.subtasks = await qAll(
      'SELECT * FROM subtask_templates WHERE task_template_id=$1 ORDER BY order_index', [t.id]
    );
  }
  return tasks;
}

export default getPool;
