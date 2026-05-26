import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, isLeaderOrAdmin } from '@/lib/auth';
import { qAll, qOne, qInsert, generateQuoteTasks, updateQuoteProgress, logActivity, getAllQuotes } from '@/lib/db';

export async function GET(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const filters: any = {};
  if (sp.get('status'))   filters.status   = sp.get('status');
  if (sp.get('priority')) filters.priority = sp.get('priority');
  if (sp.get('search'))   filters.search   = sp.get('search');
  if (sp.get('expired') === 'true') filters.expiredOnly = true;
  if (sp.get('dueSoon'))  filters.dueSoonDays = parseInt(sp.get('dueSoon')!);
  if (sp.get('assignedUserId')) filters.assignedUserId = parseInt(sp.get('assignedUserId')!);

  if (user.role === 'operator') filters.assignedUserId = user.userId;

  const quotes = await getAllQuotes(filters);
  return NextResponse.json({ quotes });
}

export async function POST(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user)                        return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!isLeaderOrAdmin(user.role))  return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });

  try {
    const body = await request.json();
    const { quote_number, client_name, description, quote_type, received_date,
            deadline_date, estimated_send_date, assigned_user_id, priority, observations } = body;

    if (!quote_number || !client_name || !received_date || !deadline_date)
      return NextResponse.json({ error: 'Campos requeridos faltantes' }, { status: 400 });

    const status = assigned_user_id ? 'assigned' : 'pending_assignment';
    const id = await qInsert(`
      INSERT INTO quotes (quote_number,client_name,description,quote_type,received_date,deadline_date,
        estimated_send_date,assigned_user_id,status,priority,observations,created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [quote_number, client_name, description ?? null, quote_type ?? null,
       received_date, deadline_date, estimated_send_date ?? null,
       assigned_user_id ?? null, status, priority ?? 'medium', observations ?? null, user.userId]
    );

    await generateQuoteTasks(id);
    await updateQuoteProgress(id);
    await logActivity(id, user.userId, 'Cotización creada', 'status', null, status);

    const created = await qOne('SELECT * FROM quotes WHERE id=$1', [id]);
    return NextResponse.json({ quote: created }, { status: 201 });
  } catch (e: any) {
    if (e.message?.includes('unique') || e.code === '23505')
      return NextResponse.json({ error: 'Número de cotización duplicado' }, { status: 409 });
    console.error(e);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
