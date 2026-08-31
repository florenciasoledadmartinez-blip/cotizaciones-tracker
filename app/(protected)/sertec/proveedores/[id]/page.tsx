'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Modal from '@/components/ui/Modal';
import { useSertecRole } from '@/components/sertec/RoleContext';
import { PERIODICITY_LABELS, formatCurrency, ROLE_LABELS } from '@/lib/sertec-utils';

const emptyForm = {
  name: '', cost_center: '', department: '', responsible_name: '',
  periodicity: 'mensual', unit_price: '', price_update_basis: '',
  duracion_periodos: '', periodo_presupuestario: 'anual', contract_start_date: '',
};

export default function ProviderDetailPage() {
  const params = useParams();
  const providerId = params.id as string;
  const { role } = useSertecRole();
  const canManage = role === 'compras' || role === 'administrador';

  const [provider, setProvider] = useState<any>(null);
  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [detail, setDetail] = useState<Record<number, any>>({});

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>(emptyForm);
  const [priceReason, setPriceReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/sertec/providers/${providerId}`);
    const data = await res.json();
    setProvider(data.provider);
    setServices(data.services ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, [providerId]);

  async function loadDetail(serviceId: number) {
    const res = await fetch(`/api/sertec/services/${serviceId}`);
    const data = await res.json();
    setDetail(d => ({ ...d, [serviceId]: data }));
  }

  function toggleExpand(serviceId: number) {
    if (expanded === serviceId) { setExpanded(null); return; }
    setExpanded(serviceId);
    if (!detail[serviceId]) loadDetail(serviceId);
  }

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setPriceReason('');
    setError('');
    setShowForm(true);
  }

  function openEdit(s: any) {
    setEditing(s);
    setForm({
      name: s.name, cost_center: s.cost_center ?? '', department: s.department ?? '',
      responsible_name: s.responsible_name ?? '', periodicity: s.periodicity,
      unit_price: String(s.unit_price), price_update_basis: s.price_update_basis ?? '',
      duracion_periodos: s.duracion_periodos ?? '', periodo_presupuestario: s.periodo_presupuestario,
      contract_start_date: s.contract_start_date ?? '',
    });
    setPriceReason('');
    setError('');
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const priceChanged = editing && Number(form.unit_price) !== Number(editing.unit_price);
      if (priceChanged && !priceReason.trim()) {
        setError('Indicá el motivo del cambio de precio (queda en el historial).');
        return;
      }
      const payload: any = {
        name: form.name, cost_center: form.cost_center || null, department: form.department || null,
        responsible_name: form.responsible_name || null, periodicity: form.periodicity,
        unit_price: Number(form.unit_price) || 0, price_update_basis: form.price_update_basis || null,
        duracion_periodos: form.duracion_periodos ? Number(form.duracion_periodos) : null,
        periodo_presupuestario: form.periodo_presupuestario,
        contract_start_date: form.contract_start_date || null,
      };
      if (priceChanged) payload.price_change_reason = priceReason;

      const res = editing
        ? await fetch(`/api/sertec/services/${editing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        : await fetch('/api/sertec/services', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, provider_id: Number(providerId) }) });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Error'); return; }
      setShowForm(false);
      load();
      if (editing) loadDetail(editing.id);
    } finally { setSaving(false); }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!provider) return <p className="text-gray-400">Proveedor no encontrado.</p>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{provider.name}</h2>
          <p className="text-gray-500 text-sm">{provider.cuit ? `CUIT ${provider.cuit}` : 'Sin CUIT cargado'} {provider.email ? `· ${provider.email}` : ''}</p>
        </div>
        {canManage ? (
          <button className="btn-primary" onClick={openNew}>+ Nuevo servicio</button>
        ) : (
          <span className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
            Alta y edición reservada al rol Compras. Estás viendo como {ROLE_LABELS[role]}.
          </span>
        )}
      </div>

      <div className="space-y-3">
        {services.map(s => (
          <div key={s.id} className="card overflow-hidden">
            <button onClick={() => toggleExpand(s.id)} className="w-full text-left px-5 py-4 flex items-center justify-between gap-3 hover:bg-gray-50">
              <div>
                <p className="font-medium text-gray-900">{s.name} {!s.active && <span className="text-xs text-gray-400">(baja)</span>}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {PERIODICITY_LABELS[s.periodicity]} · {formatCurrency(s.unit_price)} por período
                  {s.department ? ` · ${s.department}` : ''} {s.responsible_name ? `· Certifica: ${s.responsible_name}` : ''}
                </p>
              </div>
              <span className="text-gray-400 text-xs">{expanded === s.id ? '▲ ocultar' : '▼ ver detalle'}</span>
            </button>
            {expanded === s.id && (
              <div className="px-5 pb-5 border-t border-gray-100 pt-4 space-y-4">
                {canManage && (
                  <button onClick={() => openEdit(s)} className="btn-secondary btn-sm">Editar condición del servicio</button>
                )}

                {detail[s.id]?.budget && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
                    <p className="font-medium text-blue-800">Presupuesto del contrato</p>
                    <p className="text-blue-700 mt-1">
                      Total: {formatCurrency(detail[s.id].budget.presupuesto_total)} · Saldo disponible:{' '}
                      <strong className={detail[s.id].budget.saldo_disponible < 0 ? 'text-red-600' : ''}>
                        {formatCurrency(detail[s.id].budget.saldo_disponible)}
                      </strong>
                    </p>
                    <p className="text-xs text-blue-500 mt-1">
                      Ventana vigente: {detail[s.id].budget.window_start} a {detail[s.id].budget.window_end}
                      {s.duracion_periodos ? ` (contrato de ${s.duracion_periodos} períodos)` : ' (renovación automática)'}
                    </p>
                  </div>
                )}
                {!detail[s.id]?.budget && s.periodicity !== 'evento' && (
                  <p className="text-xs text-gray-400">Este servicio no tiene control de presupuesto total configurado.</p>
                )}

                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-1.5">Historial de precio</p>
                  <div className="space-y-1">
                    {detail[s.id]?.priceHistory?.map((h: any) => (
                      <div key={h.id} className="text-xs text-gray-600 flex justify-between border-b border-gray-50 py-1">
                        <span>{formatCurrency(h.price)} — {h.reason}</span>
                        <span className="text-gray-400">{new Date(h.changed_at).toLocaleDateString('es-AR')} · {h.changed_by}</span>
                      </div>
                    ))}
                    {!detail[s.id]?.priceHistory?.length && <p className="text-xs text-gray-400">Sin cambios registrados.</p>}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
        {services.length === 0 && <p className="text-sm text-gray-400 text-center py-8">Este proveedor todavía no tiene servicios cargados.</p>}
      </div>

      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title={editing ? 'Editar condición del servicio' : 'Nuevo servicio'} size="lg">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="label">Servicio / concepto</label>
              <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div>
              <label className="label">Centro de costos</label>
              <input className="input" value={form.cost_center} onChange={e => setForm({ ...form, cost_center: e.target.value })} />
            </div>
            <div>
              <label className="label">Gerencia / área responsable</label>
              <input className="input" value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} />
            </div>
            <div>
              <label className="label">Responsable que certifica la prestación</label>
              <input className="input" value={form.responsible_name} onChange={e => setForm({ ...form, responsible_name: e.target.value })} />
            </div>
            <div>
              <label className="label">Periodicidad</label>
              <select className="input" value={form.periodicity} onChange={e => setForm({ ...form, periodicity: e.target.value })}>
                <option value="mensual">Mensual</option>
                <option value="quincenal">Quincenal</option>
                <option value="evento">Por evento</option>
              </select>
            </div>
            <div>
              <label className="label">Precio de referencia (por período)</label>
              <input type="number" step="0.01" className="input" value={form.unit_price} onChange={e => setForm({ ...form, unit_price: e.target.value })} required />
            </div>
            <div className="col-span-2">
              <label className="label">Base de actualización pactada</label>
              <input className="input" placeholder="Ej: fijo, según IPC, según acuerdo de combustible..."
                value={form.price_update_basis} onChange={e => setForm({ ...form, price_update_basis: e.target.value })} />
            </div>
            {editing && Number(form.unit_price) !== Number(editing.unit_price) && (
              <div className="col-span-2">
                <label className="label">Motivo del cambio de precio (obligatorio, queda en el historial)</label>
                <input className="input" value={priceReason} onChange={e => setPriceReason(e.target.value)} />
              </div>
            )}
            <div className="col-span-2 border-t border-gray-100 pt-3">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Presupuesto total del contrato (opcional)</p>
            </div>
            <div>
              <label className="label">Duración del contrato (cant. de períodos)</label>
              <input type="number" className="input" placeholder="Vacío = sin plazo fijo"
                value={form.duracion_periodos} onChange={e => setForm({ ...form, duracion_periodos: e.target.value })} />
            </div>
            <div>
              <label className="label">Período presupuestario (si no hay plazo fijo)</label>
              <select className="input" value={form.periodo_presupuestario} onChange={e => setForm({ ...form, periodo_presupuestario: e.target.value })}>
                <option value="mensual">Mensual</option>
                <option value="trimestral">Trimestral</option>
                <option value="anual">Anual</option>
              </select>
            </div>
            <div>
              <label className="label">Fecha de inicio del contrato</label>
              <input type="date" className="input" value={form.contract_start_date} onChange={e => setForm({ ...form, contract_start_date: e.target.value })} />
            </div>
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Guardando...' : 'Guardar'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
