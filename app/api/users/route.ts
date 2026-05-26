import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { qAll, qOne, qInsert, qRun, getAllUsers } from '@/lib/db';
import bcrypt from 'bcryptjs';

export async function GET(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  return NextResponse.json({ users: await getAllUsers() });
}

export async function POST(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Solo admin' }, { status: 403 });

  const { name, email, password, role } = await request.json();
  if (!name || !email || !password || !role)
    return NextResponse.json({ error: 'Todos los campos son requeridos' }, { status: 400 });

  try {
    const id = await qInsert(
      `INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,$4)`,
      [name, email, bcrypt.hashSync(password, 10), role]
    );
    const created = await qOne('SELECT id,name,email,role,active,created_at FROM users WHERE id=$1', [id]);
    return NextResponse.json({ user: created }, { status: 201 });
  } catch (e: any) {
    if (e.code === '23505') return NextResponse.json({ error: 'Email ya registrado' }, { status: 409 });
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Solo admin' }, { status: 403 });

  const { id, name, email, role, active, password } = await request.json();
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 });

  const sets: string[] = [];
  const vals: any[] = [];
  let p = 1;
  if (name     !== undefined) { sets.push(`name=$${p++}`);          vals.push(name); }
  if (email    !== undefined) { sets.push(`email=$${p++}`);         vals.push(email); }
  if (role     !== undefined) { sets.push(`role=$${p++}`);          vals.push(role); }
  if (active   !== undefined) { sets.push(`active=$${p++}`);        vals.push(active ? 1 : 0); }
  if (password)               { sets.push(`password_hash=$${p++}`); vals.push(bcrypt.hashSync(password, 10)); }

  if (!sets.length) return NextResponse.json({ error: 'Sin cambios' }, { status: 400 });

  vals.push(id);
  await qRun(`UPDATE users SET ${sets.join(',')} WHERE id=$${p}`, vals);
  const updated = await qOne('SELECT id,name,email,role,active,created_at FROM users WHERE id=$1', [id]);
  return NextResponse.json({ user: updated });
}
