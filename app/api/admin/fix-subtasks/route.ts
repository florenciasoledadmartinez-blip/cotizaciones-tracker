import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, isLeaderOrAdmin } from '@/lib/auth';
import { qAll, qRun } from '@/lib/db';

/**
 * POST /api/admin/fix-subtasks
 *
 * One-time repair: finds every quote that has quote_tasks rows but zero
 * quote_subtasks rows (result of the original failed bulk import), deletes the
 * orphaned tasks, and re-creates tasks + subtasks using the same batched logic
 * used in the fixed import route.
 *
 * Returns { fixed, skipped, total } where:
 *   fixed   = number of quotes that were repaired
 *   skipped = quotes that already had subtasks (untouched)
 *   total   = quotes that had tasks
 */
export async function POST(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user || !isLeaderOrAdmin(user.role))
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });

  try {
    // 1. Find all quote IDs that have tasks but NO subtasks
    const orphaned: { id: number }[] = await qAll(`
      SELECT DISTINCT qt.quote_id AS id
      FROM quote_tasks qt
      WHERE NOT EXISTS (
        SELECT 1 FROM quote_subtasks qs WHERE qs.quote_task_id = qt.id
      )
    `);

    if (orphaned.length === 0)
      return NextResponse.json({ fixed: 0, skipped: 0, total: 0, message: 'Nada que reparar.' });

    const orphanedIds = orphaned.map(r => r.id);

    // 2. Load templates once
    const taskTemplates: any[] = await qAll(
      'SELECT id, order_index FROM task_templates WHERE active=1 ORDER BY order_index'
    );
    const subtaskTemplates: any[] = await qAll(
      'SELECT id, task_template_id, order_index FROM subtask_templates WHERE active=1 ORDER BY order_index'
    );

    // 3. Delete orphaned quote_tasks (CASCADE removes any stray subtasks too)
    //    Batch DELETE to avoid huge IN clause
    const DEL_BATCH = 500;
    for (let i = 0; i < orphanedIds.length; i += DEL_BATCH) {
      const batch = orphanedIds.slice(i, i + DEL_BATCH);
      const ph = batch.map((_: any, j: number) => `$${j + 1}`).join(',');
      await qRun(`DELETE FROM quote_tasks WHERE quote_id IN (${ph})`, batch);
    }

    // 4. Bulk-insert tasks in batches of 500 rows (1500 params — under 65535)
    type TaskRow = { quoteId: number; tmplId: number; orderIdx: number };
    const allTaskRows: TaskRow[] = [];
    for (const qid of orphanedIds)
      for (const tt of taskTemplates)
        allTaskRows.push({ quoteId: qid, tmplId: tt.id, orderIdx: tt.order_index });

    const TASK_BATCH = 500;
    const insertedTasks: any[] = [];
    for (let i = 0; i < allTaskRows.length; i += TASK_BATCH) {
      const batch = allTaskRows.slice(i, i + TASK_BATCH);
      let p = 1;
      const phs = batch.map(() => `($${p++},$${p++},'pending',0,$${p++})`);
      const vals: any[] = [];
      for (const r of batch) vals.push(r.quoteId, r.tmplId, r.orderIdx);
      const res: any[] = await qAll(`
        INSERT INTO quote_tasks (quote_id,task_template_id,status,progress_percentage,order_index)
        VALUES ${phs.join(',')} RETURNING id, quote_id, task_template_id
      `, vals);
      insertedTasks.push(...res);
    }

    // 5. Bulk-insert subtasks in batches of 400 rows (1200 params — under 65535)
    type SubRow = { quoteId: number; taskId: number; stId: number };
    const allSubRows: SubRow[] = [];
    for (const qt of insertedTasks) {
      const subs = subtaskTemplates.filter((s: any) => s.task_template_id === qt.task_template_id);
      for (const st of subs)
        allSubRows.push({ quoteId: qt.quote_id, taskId: qt.id, stId: st.id });
    }

    const SUB_BATCH = 400;
    for (let i = 0; i < allSubRows.length; i += SUB_BATCH) {
      const batch = allSubRows.slice(i, i + SUB_BATCH);
      let p = 1;
      const phs = batch.map(() => `($${p++},$${p++},$${p++},'pending')`);
      const vals: any[] = [];
      for (const r of batch) vals.push(r.quoteId, r.taskId, r.stId);
      await qRun(`
        INSERT INTO quote_subtasks (quote_id,quote_task_id,subtask_template_id,status)
        VALUES ${phs.join(',')}
      `, vals);
    }

    // 6. Update progress for all fixed quotes (bulk)
    if (orphanedIds.length > 0) {
      const ph = orphanedIds.map((_: any, j: number) => `$${j + 1}`).join(',');
      await qRun(
        `UPDATE quotes SET progress_percentage=0, updated_at=NOW() WHERE id IN (${ph})`,
        orphanedIds
      );
    }

    return NextResponse.json({
      fixed: orphanedIds.length,
      skipped: 0,
      total: orphanedIds.length,
      message: `${orphanedIds.length} cotizaciones reparadas correctamente.`,
    });

  } catch (e: any) {
    console.error('fix-subtasks error:', e);
    return NextResponse.json({ error: 'Error: ' + e.message }, { status: 500 });
  }
}
