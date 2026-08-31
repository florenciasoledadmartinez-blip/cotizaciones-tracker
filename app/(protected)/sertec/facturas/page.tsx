'use client';
import { useCallback, useEffect, useState } from 'react';
import { useSertecRole } from '@/components/sertec/RoleContext';
import StatusBadge from '@/components/sertec/StatusBadge';
import NewInvoiceModal from '@/components/sertec/NewInvoiceModal';
import { formatCurrency, INVOICE_STATUS_LABELS, ROLE_LABELS } from '@/lib/sertec-utils';
import { formatDate } from '@/lib/utils';

const PRICE_MATCH_LABELS: Record<string, string> = { coincide: 'Coincide', no_coincide: 'No coincide', pendiente: 'Pendiente' };

export default function FacturasPage() {
  const { role } = useSertecRole();
  const [view, setView] = useState<'lista' | 'matriz'>('lista');
  const [invoices, setInvoices] = useState<any[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);

  const [providerId, setProviderId] = useState('');
  const [status, setStatus] = useState('');
  const [priceMatch, setPriceMatch] = useState('');
  const [q, setQ] = useState('');

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    const sp = new URLSearchParams();
    if (providerId) sp.set('providerId', providerId);
    if (status) sp.set('status', status);
    if (priceMatch) sp.set('priceMatch', priceMatch);
    if (q) sp.set('q', q);
    try {
      const res = await fetch(`/api/sertec/invoices?${sp}`);
      const data = await res.json();
      setInvoices(data.invoices ?? []);
    } finally { setLoading(false); }
  }, [providerId, status, priceMatch, q]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);
  useEffect(() => { fetch('/api/sertec/providers').then(r => r.json()).then(d => setProviders(d.providers ?? [])); }, []);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Facturas de servicio</h2>
          <p className="text-gray-500 text-sm">
            Elegí proveedor y servicio: el sistema filtra los períodos abiertos y calcula la comparación de precio al instante.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm">
            <button onClick={() => setView('lista')} className={`px-3 py-1.5 ${view === 'lista' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}>Lista</button>
            <button onClick={() => setView('matriz')} className={`px-3 py-1.5 ${view === 'matriz' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}>Matriz por proveedor</button>
          </div>
          {(role === 'pago_a_proveedores' || role === 'administrador') && (
            <button className="btn-primary" onClick={() => setShowNew(true)}>+ Nueva factura</button>
          )}
        </div>
      </div>

      {role !== 'pago_a_proveedores' && role !== 'administrador' && (
        <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
          Cargar facturas es tarea del rol Pago a Proveedores. Estás viendo como {ROLE_LABELS[role]}.
        </p>
      )}

      {view === 'lista' ? (
        <>
          <div className="card p-4 flex flex-wrap gap-3">
            <input className="input flex-1 min-w-[180px]" placeholder="Buscar proveedor, servicio, N° factura..." value={q} onChange={e => setQ(e.target.value)} />
            <select className="input w-52" value={providerId} onChange={e => setProviderId(e.target.value)}>
              <option value="">Todos los proveedores</option>
              {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select className="input w-56" value={status} onChange={e => setStatus(e.target.value)}>
              <option value="">Todos los estados</option>
              {Object.entries(INVOICE_STATUS_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <select className="input w-44" value={priceMatch} onChange={e => setPriceMatch(e.target.value)}>
              <option value="">Estado de precio: todos</option>
              <option value="coincide">Coincide</option>
              <option value="no_coincide">No coincide</option>
              <option value="pendiente">Pendiente</option>
            </select>
            {(providerId || status || priceMatch || q) && (
              <button className="btn-ghost btn-sm text-gray-400" onClick={() => { setProviderId(''); setStatus(''); setPriceMatch(''); setQ(''); }}>✕ Limpiar</button>
            )}
          </div>

          <div className="card overflow-hidden">
            {loading ? (
              <div className="p-12 text-center"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" /></div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['Proveedor', 'Servicio', 'Período(s)', 'Importe', 'Precio', 'Estado', 'Recibida'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {invoices.map(inv => (
                    <tr key={inv.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{inv.provider_name}</td>
                      <td className="px-4 py-3 text-gray-600">{inv.service_name}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{inv.period_labels || (inv.period_unclear ? 'A confirmar' : '—')}</td>
                      <td className="px-4 py-3 text-gray-900">{formatCurrency(inv.amount)}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{PRICE_MATCH_LABELS[inv.price_match]}</td>
                      <td className="px-4 py-3"><StatusBadge status={inv.status} /></td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(inv.received_date)} ({inv.days_since_received}d)</td>
                    </tr>
                  ))}
                  {invoices.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">No hay facturas que coincidan con los filtros.</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : (
        <ProviderMatrix />
      )}

      <NewInvoiceModal
        isOpen={showNew}
        onClose={() => setShowNew(false)}
        onCreated={fetchInvoices}
        actor={ROLE_LABELS[role]}
        actorRole={role}
      />
    </div>
  );
}

function ProviderMatrix() {
  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/sertec/matrix').then(r => r.json()).then(d => { setServices(d.services ?? []); setLoading(false); });
  }, []);

  if (loading) return <div className="p-12 text-center"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" /></div>;

  const grouped: Record<string, any[]> = {};
  for (const s of services) (grouped[s.provider_name] ??= []).push(s);

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([providerName, svcs]) => (
        <div key={providerName} className="card overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 font-semibold text-gray-800">{providerName}</div>
          <div className="divide-y divide-gray-100">
            {svcs.map(s => (
              <div key={s.id} className="px-5 py-3">
                <p className="text-sm font-medium text-gray-700 mb-2">{s.name}</p>
                <div className="flex flex-wrap gap-1.5">
                  {s.periods.map((p: any) => (
                    <div key={p.id} title={p.invoice_status ?? 'sin factura'}
                      className={`text-xs px-2 py-1 rounded-md border
                        ${p.invoice_status === 'pagada' ? 'bg-green-50 border-green-200 text-green-700'
                          : p.invoice_status ? 'bg-amber-50 border-amber-200 text-amber-700'
                          : p.certification_status === 'no_cumplido' ? 'bg-red-50 border-red-200 text-red-700'
                          : p.certification_status === 'parcial' ? 'bg-orange-50 border-orange-200 text-orange-700'
                          : 'bg-gray-50 border-gray-200 text-gray-500'}`}>
                      {p.label}
                    </div>
                  ))}
                  {s.periods.length === 0 && <span className="text-xs text-gray-400">Sin períodos generados todavía.</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {services.length === 0 && <p className="text-sm text-gray-400 text-center py-8">No hay servicios activos todavía.</p>}
    </div>
  );
}
