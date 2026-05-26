import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { qInsert, qRun, getTaskTemplates } from '@/lib/db';

export async function GET(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  return NextResponse.json({ templates: await getTaskTemplates() });
}

export async function POST(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Solo admin' }, { status: 403 });

  const { name, description, order_index, subtasks } = await request.json();
  if (!name) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 });

  const taskId = await qInsert(
    'INSERT INTO task_templates (name, description, order_index) VALUES ($1,$2,$3)',
    [name, description ?? null, order_index ?? 0]
  );

  if (Array.isArray(subtasks)) {
    for (let i = 0; i < subtasks.length; i++) {
      await qInsert(
        'INSERT INTO subtask_templates (task_template_id, name, description, order_index) VALUES ($1,$2,$3,$4)',
        [taskId, subtasks[i].name, subtasks[i].description ?? null, i + 1]
      );
    }
  }

  const templates = await getTaskTemplates();
  return NextResponse.json({ template: templates.find((t: any) => t.id === taskId) }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Solo admin' }, { status: 403 });

  const { id, name, description, order_index, active } = await request.json();
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 });

  const sets: string[] = [];
  const vals: any[] = [];
  let p = 1;
  if (name        !== undefined) { sets.push(`name=$${p++}`);        vals.push(name); }
  if (description !== undefined) { sets.push(`description=$${p++}`); vals.push(description); }
  if (order_index !== undefined) { sets.push(`order_index=$${p++}`); vals.push(order_index); }
  if (active      !== undefined) { sets.push(`active=$${p++}`);      vals.push(active ? 1 : 0); }

  if (sets.length) {
    vals.push(id);
    await qRun(`UPDATE task_templates SET ${sets.join(',')} WHERE id=$${p}`, vals);
  }
  return NextResponse.json({ ok: true });
}
