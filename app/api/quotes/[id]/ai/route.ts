import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { qOne, qAll, qInsert, logActivity } from '@/lib/db';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const quoteId = parseInt(params.id);
  const quote = await qOne(`
    SELECT q.*, u.name as assigned_user_name FROM quotes q
    LEFT JOIN users u ON q.assigned_user_id=u.id WHERE q.id=$1
  `, [quoteId]);
  if (!quote) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });

  const tasks   = await qAll(`SELECT qt.*, tt.name as task_name FROM quote_tasks qt JOIN task_templates tt ON qt.task_template_id=tt.id WHERE qt.quote_id=$1 ORDER BY qt.order_index`, [quoteId]);
  const subtasks = await qAll(`SELECT qs.*, st.name as subtask_name FROM quote_subtasks qs JOIN subtask_templates st ON qs.subtask_template_id=st.id WHERE qs.quote_id=$1`, [quoteId]);

  const daysLeft   = Math.ceil((new Date(quote.deadline_date).getTime() - Date.now()) / 86400000);
  const doneSubs   = subtasks.filter((s: any) => s.status === 'done').length;
  const totalSubs  = subtasks.filter((s: any) => s.status !== 'not_applicable').length;
  const taskSummary = tasks.map((t: any) => `- ${t.task_name}: ${t.progress_percentage}%`).join('\n');
  const apiKey = process.env.ANTHROPIC_API_KEY;

  let insight: any;

  if (!apiKey) {
    // Rule-based fallback
    const riskLevel = daysLeft < 0 ? 'alto' : daysLeft <= 3 ? 'medio-alto' : daysLeft <= 7 ? 'medio' : 'bajo';
    const nextPending = subtasks.find((s: any) => s.status === 'pending');
    const nextTask    = nextPending ? tasks.find((t: any) => t.id === nextPending.quote_task_id) : null;

    insight = {
      summary: `Cotización ${quote.quote_number} para ${quote.client_name}. Avance: ${quote.progress_percentage}% (${doneSubs}/${totalSubs} subtareas). ${daysLeft < 0 ? `Vencida hace ${Math.abs(daysLeft)} día(s).` : `Vence en ${daysLeft} día(s).`} Estado: ${quote.status}. Responsable: ${quote.assigned_user_name ?? 'Sin asignar'}.`,
      risk_level: riskLevel,
      suggested_next_action: nextPending
        ? `Completar: "${nextPending.subtask_name}" en la tarea "${nextTask?.task_name ?? ''}".`
        : 'Todas las subtareas están completas o marcadas como no aplica.',
    };
  } else {
    try {
      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      const client = new Anthropic({ apiKey });
      const prompt = `Analiza esta cotización comercial y genera un resumen breve en español.

DATOS:
- Número: ${quote.quote_number}
- Cliente: ${quote.client_name}
- Descripción: ${quote.description ?? 'N/A'}
- Deadline: ${quote.deadline_date} (${daysLeft < 0 ? `VENCIDA hace ${Math.abs(daysLeft)} días` : `faltan ${daysLeft} días`})
- Estado: ${quote.status}
- Responsable: ${quote.assigned_user_name ?? 'Sin asignar'}
- Prioridad: ${quote.priority}
- Avance: ${quote.progress_percentage}% (${doneSubs}/${totalSubs} subtareas realizadas)
- Observaciones: ${quote.observations ?? 'Ninguna'}

AVANCE POR TAREA:
${taskSummary}

Responde SOLO con JSON sin markdown:
{"summary":"resumen 2-3 oraciones","risk_level":"bajo|medio|medio-alto|alto","suggested_next_action":"acción concreta"}`;

      const message = await client.messages.create({
        model: 'claude-opus-4-5', max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      });
      insight = JSON.parse((message.content[0] as any).text);
    } catch (e: any) {
      return NextResponse.json({ error: 'Error IA: ' + e.message }, { status: 500 });
    }
  }

  await qInsert(
    `INSERT INTO ai_insights (quote_id, summary, risk_level, suggested_next_action) VALUES ($1,$2,$3,$4)`,
    [quoteId, insight.summary, insight.risk_level, insight.suggested_next_action]
  );
  await logActivity(quoteId, user.userId, 'Análisis IA generado');
  return NextResponse.json({ insight });
}
