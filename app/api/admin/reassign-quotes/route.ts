import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { qOne, qRun } from '@/lib/db';

/**
 * POST /api/admin/reassign-quotes
 * Body: { fromUserId: number, toUserId: number, deactivateSource?: boolean }
 *
 * Moves all quotes assigned to `fromUserId` to `toUserId`.
 * Optionally deactivates the source user.
 */
export async function POST(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user || user.role !== 'admin')
    return NextResponse.json({ error: 'Solo administradores' }, { status: 403 });

  const { fromUserId, toUserId, deactivateSource } = await request.json();

  if (!fromUserId || !toUserId)
    return NextResponse.json({ error: 'fromUserId y toUserId son requeridos' }, { status: 400 });

  if (fromUserId === toUserId)
    return NextResponse.json({ error: 'Los usuarios deben ser distintos' }, { status: 400 });

  const from = await qOne('SELECT id, name FROM users WHERE id=$1', [fromUserId]);
  const to   = await qOne('SELECT id, name FROM users WHERE id=$1', [toUserId]);
  if (!from || !to)
    return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });

  // Reassign all quotes
  const moved = await qRun(
    'UPDATE quotes SET assigned_user_id=$1, updated_at=NOW() WHERE assigned_user_id=$2',
    [toUserId, fromUserId]
  );

  // Optionally deactivate the source user
  if (deactivateSource) {
    await qRun('UPDATE users SET active=0 WHERE id=$1', [fromUserId]);
  }

  return NextResponse.json({
    moved,
    from: from.name,
    to: to.name,
    deactivated: !!deactivateSource,
  });
}
