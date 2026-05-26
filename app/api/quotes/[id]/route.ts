import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, isLeaderOrAdmin } from '@/lib/auth';
import { qOne, qRun, logActivity, getQuoteById } from '@/lib/db';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const id = parseInt(params.id);
  const quote = await getQuoteById(id);
  if (!quote) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });

  if (user.role === 'operator' && quote.assigned_user_id !== user.userId)
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });

  return NextResponse.json({ quote });
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const id = parseInt(params.id);
  const existing = await qOne('SELECT * FROM quotes WHERE id=$1', [id]);
  if (!existing) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });

  if (user.role === 'operator' && existing.assigned_user_id !== user.userId)
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });

  const body = await request.json();
  const fields = ['client_name','description','quote_type','received_date','deadline_date',
                  'estimated_send_date','actual_send_date','priority','observations'];
  if (isLeaderOrAdmin(user.role)) fields.push('assigned_user_id','status','quote_number');

  const setClauses: string[] = [];
  const values: any[] = [];
  let p = 1;

  for (const f of fields) {
    if (body[f] !== undefined) {
      setClauses.push(`${f}=$${p++}`);
      values.push(body[f]);
      if (String(body[f]) !== String(existing[f] ?? ''))
        await logActivity(id, user.userId, `Campo actualizado: ${f}`, f, String(existing[f] ?? ''), String(body[f] ?? ''));
    }
  }

  // Auto-set 'sent' when actual_send_date is provided
  if (body.actual_send_date && !body.status) {
    setClauses.push(`status=$${p++}`);
    values.push('sent');
    await logActivity(id, user.userId, 'Estado cambiado a Enviada al cliente', 'status', existing.status, 'sent');
  }
  // Auto-assign when assigning a user to a pending quote
  if (body.assigned_user_id && existing.status === 'pending_assignment' && !body.status) {
    setClauses.push(`status=$${p++}`);
    values.push('assigned');
  }

  if (setClauses.length === 0) return NextResponse.json({ error: 'Sin cambios' }, { status: 400 });

  setClauses.push('updated_at=NOW()');
  values.push(id);
  await qRun(`UPDATE quotes SET ${setClauses.join(',')} WHERE id=$${p}`, values);

  const updated = await qOne('SELECT * FROM quotes WHERE id=$1', [id]);
  return NextResponse.json({ quote: updated });
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const user = getUserFromRequest(request);
  if (!user || !isLeaderOrAdmin(user.role))
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });

  const id = parseInt(params.id);
  const existing = await qOne('SELECT id FROM quotes WHERE id=$1', [id]);
  if (!existing) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });

  await qRun('DELETE FROM quotes WHERE id=$1', [id]);
  return NextResponse.json({ ok: true });
}
