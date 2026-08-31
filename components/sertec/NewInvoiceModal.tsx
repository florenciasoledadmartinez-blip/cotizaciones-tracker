'use client';
import { useEffect, useState } from 'react';
import Modal from '@/components/ui/Modal';
import { formatCurrency, PERIODICITY_LABELS, CERTIFICATION_LABELS, CERTIFICATION_COLORS } from '@/lib/sertec-utils';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
  actor: string;
  actorRole: string;
}

export default function NewInvoiceModal({ isOpen, onClose, onCreated, actor, actorRole }: Props) {
  const [providers, setProviders] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [periods, setPeriods] = useState<any[]>([]);
  const [serviceDetail, setServiceDetail] = useState<any>(null);

  const [providerId, setProviderId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [periodIds, setPeriodIds] = useState<number[]>([]);
  const [periodUnclear, setPeriodUnclear] = useState(false);
  const [amount, setAmount] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [receivedDate, setReceivedDate] = useState('');
  const [notes, setNotes] = useState('');

  const [loadingPeriods, setLoadingPeriods] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    if (!isOpen) return;
    reset();
    fetch('/api/sertec/providers?active=true').then(r => r.json()).then(d => setProviders(d.providers ?? []));
  }, [isOpen]);

  function reset() {
    setProviderId(''); setServiceId(''); setServices([]); setPeriods([]); setServiceDetail(null);
    setPeriodIds([]); setPeriodUnclear(false); setAmount(''); setInvoiceNumber('');
    setReceivedDate(''); setNotes(''); setError(''); setResult(null);
  }

  async function pickProvider(id: string) {
    setProviderId(id); setServiceId(''); setServices([]); setPeriods([]); setServiceDetail(null); setPeriodIds([]);
    if (!id) return;
    const res = await fetch(`/api/sertec/services?providerId=${id}&withBudget=true`);
    const data = await res.json();
    setServices(data.services ?? []);
  }

  async function pickService(id: string) {
    setServiceId(id); setPeriods([]); setPeriodIds([]); setPeriodUnclear(false);
    setServiceDetail(services.find(s => String(s.id) === id) ?? null);
    if (!id) return;
    setLoadingPeriods(true);
    try {
      const res = await fetch(`/api/sertec/services/${id}/periods`);
      const data = await res.json();
      setPeriods(data.periods ?? []);
    } finally { setLoadingPeriods(false); }
  }

  function togglePeriod(id: number) {
    setPeriodIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
  }

  const referenceAmount = serviceDetail ? Number(serviceDetail.unit_price) * periodIds.length : 0;
  const amountNum = Number(amount) || 0;
  const priceMatches = referenceAmount > 0
    ? Math.abs(amountNum - referenceAmount) <= referenceAmount * 0.01
    : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const res = await fetch('/api/sertec/invoices', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider_id: Number(providerId), service_id: Number(serviceId), amount: amountNum,
          received_date: receivedDate || undefined, invoice_number: invoiceNumber, notes,
          period_ids: periodUnclear ? [] : periodIds, period_unclear: periodUnclear,
          actor, actorRole,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setResult(data.invoice);
      onCreated();
    } finally { setSaving(false); }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Registrar factura de servicio" size="lg">
      {result ? (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="font-semibold text-green-800">Factura registrada</p>
            <p className="text-sm text-green-700 mt-1">
              El sistema la resolvió automáticamente a: <strong>{result.status.replaceAll('_', ' ')}</strong>
            </p>
          </div>
          <div className="flex justify-end gap-3">
            <button className="btn-secondary" onClick={() => reset()}>Cargar otra</button>
            <button className="btn-primary" onClick={onClose}>Cerrar</button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">1. Proveedor</label>
              <select className="input" value={providerId} onChange={e => pickProvider(e.target.value)} required>
                <option value="">Elegí un proveedor…</option>
                {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">2. Servicio</label>
              <select className="input" value={serviceId} onChange={e => pickService(e.target.value)} required disabled={!providerId}>
                <option value="">{providerId ? 'Elegí un servicio…' : 'Elegí primero el proveedor'}</option>
                {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          {serviceDetail && (
            <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 flex flex-wrap gap-x-5 gap-y-1">
              <span>Precio de referencia: <strong>{formatCurrency(serviceDetail.unit_price)}</strong> / {PERIODICITY_LABELS[serviceDetail.periodicity]}</span>
              {serviceDetail.budget?.has_budget && (
                <span>Saldo de presupuesto: <strong className={serviceDetail.budget.saldo_disponible < 0 ? 'text-red-600' : ''}>{formatCurrency(serviceDetail.budget.saldo_disponible)}</strong></span>
              )}
            </div>
          )}

          {serviceId && (
            <div>
              <label className="label">3. Período(s) que cubre la factura</label>
              {loadingPeriods ? (
                <p className="text-xs text-gray-400">Buscando períodos abiertos…</p>
              ) : (
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-40 overflow-y-auto">
                  {periods.map(p => (
                    <label key={p.id} className={`flex items-center justify-between gap-2 px-3 py-2 text-sm cursor-pointer ${periodUnclear ? 'opacity-40' : ''}`}>
                      <span className="flex items-center gap-2">
                        <input type="checkbox" disabled={periodUnclear} checked={periodIds.includes(p.id)} onChange={() => togglePeriod(p.id)} className="w-4 h-4 rounded border-gray-300" />
                        {p.label}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${CERTIFICATION_COLORS[p.certification_status]}`}>{CERTIFICATION_LABELS[p.certification_status]}</span>
                    </label>
                  ))}
                  {periods.length === 0 && <p className="px-3 py-3 text-xs text-gray-400">No hay períodos abiertos para este servicio.</p>}
                </div>
              )}
              <label className="flex items-center gap-2 mt-2 text-xs text-gray-500 cursor-pointer">
                <input type="checkbox" checked={periodUnclear} onChange={e => { setPeriodUnclear(e.target.checked); if (e.target.checked) setPeriodIds([]); }} className="w-4 h-4 rounded border-gray-300" />
                No estoy seguro a qué período corresponde — mandar a "Período a confirmar"
              </label>
            </div>
          )}

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">Importe facturado</label>
              <input type="number" step="0.01" className="input" value={amount} onChange={e => setAmount(e.target.value)} required />
            </div>
            <div>
              <label className="label">N° de factura</label>
              <input className="input" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} />
            </div>
            <div>
              <label className="label">Fecha de recepción</label>
              <input type="date" className="input" value={receivedDate} onChange={e => setReceivedDate(e.target.value)} />
            </div>
          </div>

          {amount && periodIds.length > 0 && !periodUnclear && (
            <p className={`text-sm px-3 py-2 rounded-lg ${priceMatches ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700'}`}>
              Referencia: {formatCurrency(referenceAmount)} para {periodIds.length} período{periodIds.length === 1 ? '' : 's'} —{' '}
              {priceMatches ? 'coincide con el importe cargado ✓' : 'no coincide con el importe cargado, va a quedar en conflicto de precio'}
            </p>
          )}

          <div>
            <label className="label">Observaciones (opcional)</label>
            <textarea className="input" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Registrando...' : 'Registrar factura'}</button>
          </div>
        </form>
      )}
    </Modal>
  );
}
