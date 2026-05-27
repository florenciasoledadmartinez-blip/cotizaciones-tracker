import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, isLeaderOrAdmin } from '@/lib/auth';
import { qOne, qAll, generateQuoteTasks, updateQuoteProgress } from '@/lib/db';

/** POST /api/quotes/:id/tasks — genera el checklist para una cotización sin tareas */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const user = getUserFromRequest(request);
  if (!user || !isLeaderOrAdmin(user.role))
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });

  const id = parseInt(params.id);
  const quote = await qOne('SELECT id FROM quotes WHERE id=$1', [id]);
  if (!quote) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });

  // Si ya tiene tareas, no generar de nuevo
  const existing = await qAll('SELECT id FROM quote_tasks WHERE quote_id=$1 LIMIT 1', [id]);
  if (existing.length > 0)
    return NextResponse.json({ error: 'Esta cotización ya tiene checklist' }, { status: 409 });

  await generateQuoteTasks(id);
  await updateQuoteProgress(id);

  return NextResponse.json({ ok: true });
}
