import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { qOne, qRun, updateQuoteProgress, logActivity } from '@/lib/db';

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const quoteId = parseInt(params.id);
  const quote = await qOne('SELECT * FROM quotes WHERE id=$1', [quoteId]);
  if (!quote) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });

  if (user.role === 'operator' && quote.assigned_user_id !== user.userId)
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });

  const { subtask_id, status, observations } = await request.json();
  if (!subtask_id || !['pending','done','not_applicable'].includes(status))
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });

  const prev = await qOne('SELECT * FROM quote_subtasks WHERE id=$1 AND quote_id=$2', [subtask_id, quoteId]);
  if (!prev) return NextResponse.json({ error: 'Subtarea no encontrada' }, { status: 404 });

  await qRun(`
    UPDATE quote_subtasks
    SET status=$1,
        completed_by=$2,
        completed_at=CASE WHEN $1='done' THEN NOW() ELSE NULL END,
        observations=$3
    WHERE id=$4 AND quote_id=$5
  `, [status, user.userId, observations ?? prev.observations, subtask_id, quoteId]);

  const progress = await updateQuoteProgress(quoteId);

  // Log with subtask name
  const subtask = await qOne(`
    SELECT st.name FROM subtask_templates st
    JOIN quote_subtasks qs ON qs.subtask_template_id=st.id
    WHERE qs.id=$1
  `, [subtask_id]);

  await logActivity(quoteId, user.userId,
    `Subtarea "${subtask?.name ?? subtask_id}" → ${status}`,
    'subtask_status', prev.status, status
  );

  // Auto-promote to in_progress if was assigned and first task done
  if (quote.status === 'assigned' && status === 'done') {
    await qRun(`UPDATE quotes SET status='in_progress', updated_at=NOW() WHERE id=$1`, [quoteId]);
    await logActivity(quoteId, user.userId, 'Estado cambiado a En proceso', 'status', 'assigned', 'in_progress');
  }

  return NextResponse.json({ progress });
}
