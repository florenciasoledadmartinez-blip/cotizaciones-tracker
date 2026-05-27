import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { qAll } from '@/lib/db';

export async function GET(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const includeExpired = searchParams.get('expired') === 'true';
  const userId        = searchParams.get('user_id') ? parseInt(searchParams.get('user_id')!) : null;
  const priority      = searchParams.get('priority') || '';
  const search        = searchParams.get('search') || '';

  const params: any[] = [];
  let p = 0;
  const $ = (v: any) => { params.push(v); return `$${++p}`; };

  // Default: active quotes only; optionally include expired
  let statusClause = `q.status NOT IN ('cancelled','closed','sent')`;
  if (!includeExpired) statusClause += ` AND q.status != 'expired'`;

  let where = `WHERE ${statusClause}`;
  if (userId)   where += ` AND q.assigned_user_id = ${$(userId)}`;
  if (priority) where += ` AND q.priority = ${$(priority)}`;
  if (search) {
    const s = `%${search}%`;
    where += ` AND (q.quote_number ILIKE ${$(s)} OR q.client_name ILIKE ${$(s)})`;
  }

  const quotes = await qAll(`
    SELECT
      q.id,
      q.quote_number,
      q.client_name,
      q.status,
      q.priority,
      q.deadline_date,
      q.received_date,
      ROUND(q.progress_percentage::numeric, 0)::int   AS progress_percentage,
      (q.deadline_date::date - CURRENT_DATE)::int      AS days_remaining,
      u.name                                            AS assigned_user_name,
      COALESCE(
        json_agg(
          json_build_object(
            'name',                tt.name,
            'order_index',         qt.order_index,
            'progress_percentage', ROUND(qt.progress_percentage::numeric, 0)::int
          ) ORDER BY qt.order_index
        ) FILTER (WHERE qt.id IS NOT NULL),
        '[]'::json
      ) AS tasks
    FROM quotes q
    LEFT JOIN users u   ON q.assigned_user_id = u.id
    LEFT JOIN quote_tasks qt ON qt.quote_id = q.id
    LEFT JOIN task_templates tt ON qt.task_template_id = tt.id
    ${where}
    GROUP BY q.id, u.name
    ORDER BY q.deadline_date ASC, q.quote_number::int DESC NULLS LAST
  `, params);

  const taskHeaders = await qAll(
    'SELECT id, name, order_index FROM task_templates WHERE active=1 ORDER BY order_index'
  );

  const users = await qAll(
    `SELECT id, name FROM users WHERE role='operator' AND active=1 ORDER BY name`
  );

  return NextResponse.json({ quotes, taskHeaders, users });
}
