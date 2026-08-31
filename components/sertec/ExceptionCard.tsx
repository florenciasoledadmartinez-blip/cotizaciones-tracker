'use client';
import { useEffect, useState } from 'react';
import { formatCurrency } from '@/lib/sertec-utils';
import { formatDate } from '@/lib/utils';

interface Props {
  invoice: any;
  actor: string;
  actorRole: string;
  onResolved: () => void;
}

async function postAction(invoiceId: number, body: any) {
  const res = await fetch(`/api/sertec/invoices/${invoiceId}/actions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error');
  return data;
}

function Header({ invoice }: { invoice: any }) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
      <div>
        <p className="font-medium text-gray-900">{invoice.provider_name} — {invoice.service_name}</p>
        <p className="text-xs text-gray-500">
          {invoice.period_labels || 'Período a confirmar'} · {formatCurrency(invoice.amount)} · recibida {formatDate(invoice.received_date)}
          {invoice.invoice_number ? ` · N° ${invoice.invoice_number}` : ''}
        </p>
      </div>
    </div>
  );
}

function ErrorBar({ error }: { error: string }) {
  if (!error) return null;
  return <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg mb-2">{error}</p>;
}

export function PrecioCard({ invoice, actor, actorRole, onResolved }: Props) {
  const periodsCount = invoice.period_labels ? invoice.period_labels.split(',').length : 1;
  const [newPrice, setNewPrice] = useState(String(Number(invoice.amount) / periodsCount));
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function accept() {
    setBusy(true); setError('');
    try {
      await postAction(invoice.id, { action: 'resolve_precio', newPrice: Number(newPrice), reason, actor, actorRole });
      onResolved();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }
  async function reject() {
    if (!reason.trim()) { setError('Indicá el motivo del rechazo'); return; }
    setBusy(true); setError('');
    try { await postAction(invoice.id, { action: 'reject', reason, actor, actorRole }); onResolved(); }
    catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="card p-4">
      <Header invoice={invoice} />
      <p className="text-sm text-orange-700 bg-orange-50 rounded-lg px-3 py-2 mb-3">
        Importe facturado {formatCurrency(invoice.amount)} vs. referencia {formatCurrency(invoice.reference_amount)}.
        Si la diferencia corresponde a la base de actualización pactada, actualizá el precio vigente. Si no, rechazá la factura.
      </p>
      <ErrorBar error={error} />
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="label">Nuevo precio vigente (por período)</label>
          <input type="number" step="0.01" className="input" value={newPrice} onChange={e => setNewPrice(e.target.value)} />
        </div>
        <div>
          <label className="label">Motivo</label>
          <input className="input" value={reason} onChange={e => setReason(e.target.value)} placeholder="Ej: aumento acordado por combustible" />
        </div>
      </div>
      <div className="flex gap-2">
        <button disabled={busy || !newPrice} onClick={accept} className="btn-primary btn-sm">Actualizar precio vigente</button>
        <button disabled={busy} onClick={reject} className="btn-danger btn-sm">Rechazar factura</button>
      </div>
    </div>
  );
}

export function ParcialCard({ invoice, actor, actorRole, onResolved }: Props) {
  const [note, setNote] = useState('');
  const [adjustedAmount, setAdjustedAmount] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function resolve(resolution: string) {
    if (resolution !== 'rechazada' && !note.trim()) { setError('Agregá una nota de la resolución'); return; }
    setBusy(true); setError('');
    try {
      await postAction(invoice.id, {
        action: 'resolve_parcial', resolution, note, actor, actorRole,
        adjustedAmount: resolution === 'pago_parcial' && adjustedAmount ? Number(adjustedAmount) : undefined,
      });
      onResolved();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="card p-4">
      <Header invoice={invoice} />
      <ErrorBar error={error} />
      <div className="mb-3">
        <label className="label">Nota de la resolución</label>
        <input className="input" value={note} onChange={e => setNote(e.target.value)} placeholder="Explicá cómo se resuelve el cumplimiento parcial" />
      </div>
      <div className="mb-3">
        <label className="label">Si es pago parcial, importe autorizado (opcional)</label>
        <input type="number" step="0.01" className="input w-48" value={adjustedAmount} onChange={e => setAdjustedAmount(e.target.value)} />
      </div>
      <div className="flex gap-2 flex-wrap">
        <button disabled={busy} onClick={() => resolve('nota_credito')} className="btn-secondary btn-sm">Nota de crédito solicitada</button>
        <button disabled={busy} onClick={() => resolve('pago_parcial')} className="btn-primary btn-sm">Pago parcial autorizado</button>
        <button disabled={busy} onClick={() => resolve('rechazada')} className="btn-danger btn-sm">Rechazar</button>
      </div>
    </div>
  );
}

export function NoCumplidoCard({ invoice, actor, actorRole, onResolved }: Props) {
  const [justification, setJustification] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function reopen() {
    if (!justification.trim()) { setError('La justificación es obligatoria para reabrir'); return; }
    setBusy(true); setError('');
    try { await postAction(invoice.id, { action: 'reopen_no_cumplido', justification, actor, actorRole }); onResolved(); }
    catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }
  async function reject() {
    setBusy(true); setError('');
    try { await postAction(invoice.id, { action: 'reject', reason: 'Servicio no prestado, se mantiene el bloqueo', actor, actorRole }); onResolved(); }
    catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="card p-4">
      <Header invoice={invoice} />
      <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2 mb-3">
        Bloqueada automáticamente: el período fue certificado como "no cumplido". No se paga sin una acción explícita y auditada.
      </p>
      <ErrorBar error={error} />
      <div className="mb-3">
        <label className="label">Justificación para reabrir el caso (obligatoria, queda auditada)</label>
        <textarea className="input" rows={2} value={justification} onChange={e => setJustification(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <button disabled={busy} onClick={reopen} className="btn-primary btn-sm">Reabrir caso</button>
        <button disabled={busy} onClick={reject} className="btn-danger btn-sm">Mantener rechazada</button>
      </div>
    </div>
  );
}

export function PresupuestoCard({ invoice, actor, actorRole, onResolved }: Props) {
  const [duracion, setDuracion] = useState('');
  const [periodo, setPeriodo] = useState('anual');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function resolve() {
    setBusy(true); setError('');
    try {
      await postAction(invoice.id, {
        action: 'resolve_presupuesto', actor, actorRole, note,
        duracion_periodos: duracion ? Number(duracion) : undefined,
        periodo_presupuestario: duracion ? undefined : periodo,
      });
      onResolved();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="card p-4">
      <Header invoice={invoice} />
      <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2 mb-3">
        Este pago dejaría el saldo del contrato en negativo (saldo al momento del control: {formatCurrency(invoice.budget_balance_at_check)}).
        Renová o ampliá el presupuesto del contrato para destrabarla.
      </p>
      <ErrorBar error={error} />
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="label">Nueva duración del contrato (períodos)</label>
          <input type="number" className="input" value={duracion} onChange={e => setDuracion(e.target.value)} placeholder="Dejar vacío si no cambia" />
        </div>
        <div>
          <label className="label">O renovar período presupuestario</label>
          <select className="input" value={periodo} onChange={e => setPeriodo(e.target.value)} disabled={!!duracion}>
            <option value="mensual">Mensual</option>
            <option value="trimestral">Trimestral</option>
            <option value="anual">Anual</option>
          </select>
        </div>
      </div>
      <div className="mb-3">
        <label className="label">Nota (opcional)</label>
        <input className="input" value={note} onChange={e => setNote(e.target.value)} />
      </div>
      <button disabled={busy} onClick={resolve} className="btn-primary btn-sm">Ampliar / renovar presupuesto</button>
    </div>
  );
}

export function PeriodoAConfirmarCard({ invoice, actor, actorRole, onResolved }: Props) {
  const [periods, setPeriods] = useState<any[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/sertec/services/${invoice.service_id}/periods`).then(r => r.json()).then(d => setPeriods(d.periods ?? []));
  }, [invoice.service_id]);

  function toggle(id: number) { setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]); }

  async function confirm() {
    if (!selected.length) { setError('Elegí al menos un período'); return; }
    setBusy(true); setError('');
    try { await postAction(invoice.id, { action: 'confirm_period', periodIds: selected, actor, actorRole }); onResolved(); }
    catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="card p-4">
      <Header invoice={invoice} />
      <ErrorBar error={error} />
      <p className="text-xs text-gray-500 mb-2">Elegí a qué período(s) corresponde este importe:</p>
      <div className="flex flex-wrap gap-2 mb-3">
        {periods.map(p => (
          <label key={p.id} className={`text-xs px-2.5 py-1.5 rounded-lg border cursor-pointer ${selected.includes(p.id) ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'}`}>
            <input type="checkbox" className="hidden" checked={selected.includes(p.id)} onChange={() => toggle(p.id)} />
            {p.label}
          </label>
        ))}
        {periods.length === 0 && <span className="text-xs text-gray-400">No hay períodos abiertos para este servicio.</span>}
      </div>
      <button disabled={busy || !selected.length} onClick={confirm} className="btn-primary btn-sm">Confirmar período</button>
    </div>
  );
}
