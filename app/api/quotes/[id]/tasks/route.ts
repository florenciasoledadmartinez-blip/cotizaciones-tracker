import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, isLeaderOrAdmin } from '@/lib/auth';
import { qOne, qAll, qRun, generateQuoteTasks, updateQuoteProgress } from '@/lib/db';

/** POST /api/quotes/:id/tasks — genera (o regenera) el checklist de una cotización */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const user = getUserFromRequest(request);
  if (!user || !isLeaderOrAdmin(user.role))
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });

  const id = parseInt(params.id);
  const quote = await qOne('SELECT id FROM quotes WHERE id=$1', [id]);
  if (!quote) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });

  // Check if tasks already exist
  const existingTasks = await qAll('SELECT id FROM quote_tasks WHERE quote_id=$1', [id]);
  if (existingTasks.length > 0) {
    // If subtasks also exist → already complete, nothing to do
    const existingSubs = await qAll(
      'SELECT id FROM quote_subtasks WHERE quote_id=$1 LIMIT 1', [id]
    );
    if (existingSubs.length > 0)
      return NextResponse.json({ error: 'Esta cotización ya tiene checklist completo' }, { status: 409 });

    // Tasks exist but NO subtasks → orphaned rows from a failed bulk import.
    // Delete them so generateQuoteTasks can start fresh.
    await qRun('DELETE FROM quote_tasks WHERE quote_id=$1', [id]);
  }

  await generateQuoteTasks(id);
  await updateQuoteProgress(id);

  return NextResponse.json({ ok: true });
}
