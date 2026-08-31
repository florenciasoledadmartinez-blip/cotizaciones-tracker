import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { qOne, qRun } from '@/lib/db';
import {
  ensureSertecInit, recomputeInvoiceStatus, getOpenPeriodsForService,
  logActivity, getInvoiceWithDetail,
} from '@/lib/sertec-db';

/**
 * Todas las acciones de resolución de excepciones y avance del circuito
 * (uno por cola: precio, parcial, no cumplido, presupuesto, período a confirmar,
 * autorización de Gerencia, ejecución de Tesorería, rechazo) viven acá para
 * mantener el motor de estados en un solo lugar (recomputeInvoiceStatus).
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  await ensureSertecInit();

  const invoiceId = Number(params.id);
  const inv = await qOne<any>('SELECT * FROM sertec_invoices WHERE id=$1', [invoiceId]);
  if (!inv) return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 });

  const body = await request.json();
  const { action, actor, actorRole } = body;
  const log = (a: string, detail?: string) => logActivity({ invoiceId, serviceId: inv.service_id, actor, actorRole, action: a, detail });

  switch (action) {

    case 'confirm_period': {
      if (inv.status !== 'periodo_a_confirmar')
        return NextResponse.json({ error: 'La factura no está pendiente de confirmar período' }, { status: 409 });
      const periodIds: number[] = body.periodIds || [];
      if (!periodIds.length) return NextResponse.json({ error: 'Elegí al menos un período' }, { status: 400 });

      const open = await getOpenPeriodsForService(inv.service_id);
      const openIds = new Set(open.map((p: any) => p.id));
      for (const pid of periodIds) {
        if (!openIds.has(Number(pid)))
          return NextResponse.json({ error: 'Uno de los períodos elegidos ya no está abierto' }, { status: 409 });
      }
      await qRun('DELETE FROM sertec_invoice_periods WHERE invoice_id=$1', [invoiceId]);
      for (const pid of periodIds) await qRun('INSERT INTO sertec_invoice_periods (invoice_id,period_id) VALUES ($1,$2)', [invoiceId, pid]);
      await qRun(`UPDATE sertec_invoices SET period_unclear=0, updated_at=NOW() WHERE id=$1`, [invoiceId]);
      await log('Período confirmado por el responsable operativo');
      break;
    }

    case 'resolve_precio': {
      if (inv.status !== 'conflicto_precio')
        return NextResponse.json({ error: 'La factura no está en conflicto de precio' }, { status: 409 });
      const newPrice = Number(body.newPrice);
      if (!newPrice || newPrice <= 0) return NextResponse.json({ error: 'Precio inválido' }, { status: 400 });
      if (!body.reason?.trim()) return NextResponse.json({ error: 'El motivo del ajuste es obligatorio' }, { status: 400 });

      await qRun(`UPDATE sertec_services SET unit_price=$1, updated_at=NOW() WHERE id=$2`, [newPrice, inv.service_id]);
      await qRun(`INSERT INTO sertec_price_history (service_id,price,reason,changed_by) VALUES ($1,$2,$3,$4)`,
        [inv.service_id, newPrice, body.reason.trim(), actor?.trim() || 'Responsable operativo']);
      await log('Precio vigente actualizado', `Nuevo precio: ${newPrice}. Motivo: ${body.reason.trim()}`);
      break;
    }

    case 'resolve_parcial': {
      if (inv.status !== 'conflicto_parcial')
        return NextResponse.json({ error: 'La factura no tiene un conflicto de cumplimiento parcial' }, { status: 409 });
      const resolution = body.resolution;
      if (!['nota_credito', 'pago_parcial', 'rechazada'].includes(resolution))
        return NextResponse.json({ error: 'Resolución inválida' }, { status: 400 });

      if (resolution === 'rechazada') {
        await qRun(`UPDATE sertec_invoices SET status='rechazada', parcial_resolution=$1, updated_at=NOW() WHERE id=$2`, [resolution, invoiceId]);
        await log('Factura rechazada por cumplimiento parcial no aceptado', body.note);
        return NextResponse.json({ invoice: await getInvoiceWithDetail(invoiceId) });
      }

      const updates: string[] = ['parcial_resolution=$1'];
      const values: any[] = [resolution];
      let i = 2;
      if (resolution === 'pago_parcial' && body.adjustedAmount != null) {
        updates.push(`amount=$${i++}`); values.push(Number(body.adjustedAmount));
      }
      values.push(invoiceId);
      await qRun(`UPDATE sertec_invoices SET ${updates.join(',')}, updated_at=NOW() WHERE id=$${i}`, values);
      await log(`Compras resolvió el cumplimiento parcial: ${resolution === 'nota_credito' ? 'nota de crédito solicitada' : 'pago parcial autorizado'}`, body.note);
      break;
    }

    case 'reopen_no_cumplido': {
      if (inv.status !== 'conflicto_no_cumplido')
        return NextResponse.json({ error: 'La factura no está bloqueada por servicio no prestado' }, { status: 409 });
      if (!body.justification?.trim())
        return NextResponse.json({ error: 'La justificación es obligatoria para reabrir el caso' }, { status: 400 });
      await qRun(`UPDATE sertec_invoices SET no_cumplido_override=1, reopen_justification=$1, updated_at=NOW() WHERE id=$2`,
        [body.justification.trim(), invoiceId]);
      await log('Caso reabierto (servicio no prestado)', body.justification.trim());
      break;
    }

    case 'resolve_presupuesto': {
      if (inv.status !== 'conflicto_presupuesto')
        return NextResponse.json({ error: 'La factura no tiene un conflicto de presupuesto' }, { status: 409 });
      const fields: string[] = [];
      const values: any[] = [];
      let i = 1;
      if (body.duracion_periodos != null) { fields.push(`duracion_periodos=$${i++}`); values.push(Number(body.duracion_periodos)); }
      if (body.periodo_presupuestario) { fields.push(`periodo_presupuestario=$${i++}`); values.push(body.periodo_presupuestario); }
      if (!fields.length) return NextResponse.json({ error: 'Indicá cómo se amplía o renueva el presupuesto' }, { status: 400 });
      values.push(inv.service_id);
      await qRun(`UPDATE sertec_services SET ${fields.join(',')}, updated_at=NOW() WHERE id=$${i}`, values);
      await log('Presupuesto del contrato ampliado/renovado', body.note);
      break;
    }

    case 'reject': {
      if (['pagada', 'rechazada'].includes(inv.status))
        return NextResponse.json({ error: 'La factura ya está en un estado final' }, { status: 409 });
      if (!body.reason?.trim()) return NextResponse.json({ error: 'El motivo del rechazo es obligatorio' }, { status: 400 });
      await qRun(`UPDATE sertec_invoices SET status='rechazada', updated_at=NOW() WHERE id=$1`, [invoiceId]);
      await log('Factura rechazada', body.reason.trim());
      return NextResponse.json({ invoice: await getInvoiceWithDetail(invoiceId) });
    }

    case 'authorize': {
      if (inv.status !== 'lista_para_autorizar')
        return NextResponse.json({ error: 'La factura todavía no está lista para autorizar' }, { status: 409 });
      await qRun(`UPDATE sertec_invoices SET status='para_pagar', authorized_by=$1, authorized_at=NOW(), updated_at=NOW() WHERE id=$2`,
        [actor?.trim() || 'Gerencia', invoiceId]);
      await log('Pago autorizado por Gerencia');
      return NextResponse.json({ invoice: await getInvoiceWithDetail(invoiceId) });
    }

    case 'mark_paid': {
      if (inv.status !== 'para_pagar')
        return NextResponse.json({ error: 'La factura todavía no está autorizada para pagar' }, { status: 409 });
      await qRun(`UPDATE sertec_invoices SET status='pagada', paid_at=NOW(), updated_at=NOW() WHERE id=$1`, [invoiceId]);
      await log('Pago ejecutado por Tesorería');
      return NextResponse.json({ invoice: await getInvoiceWithDetail(invoiceId) });
    }

    default:
      return NextResponse.json({ error: 'Acción desconocida' }, { status: 400 });
  }

  await recomputeInvoiceStatus(invoiceId);
  const invoice = await getInvoiceWithDetail(invoiceId);
  return NextResponse.json({ invoice });
}
