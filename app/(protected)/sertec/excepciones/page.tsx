'use client';
import { useCallback, useEffect, useState } from 'react';
import { useSertecRole } from '@/components/sertec/RoleContext';
import { PrecioCard, ParcialCard, NoCumplidoCard, PresupuestoCard, PeriodoAConfirmarCard } from '@/components/sertec/ExceptionCard';
import { ROLE_LABELS } from '@/lib/sertec-utils';

const TABS = [
  { key: 'conflicto_precio', label: 'Precio', roleHint: 'Solicitante', Card: PrecioCard },
  { key: 'conflicto_parcial', label: 'Cumplimiento parcial', roleHint: 'Compras', Card: ParcialCard },
  { key: 'conflicto_no_cumplido', label: 'Servicio no prestado', roleHint: 'Pago a Proveedores', Card: NoCumplidoCard },
  { key: 'conflicto_presupuesto', label: 'Presupuesto', roleHint: 'Solicitante / Compras', Card: PresupuestoCard },
  { key: 'periodo_a_confirmar', label: 'Período a confirmar', roleHint: 'Solicitante', Card: PeriodoAConfirmarCard },
] as const;

export default function ExcepcionesPage() {
  const { role } = useSertecRole();
  const [tab, setTab] = useState<typeof TABS[number]['key']>('conflicto_precio');
  const [invoices, setInvoices] = useState<any[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/sertec/invoices?status=${tab}`);
    const data = await res.json();
    setInvoices(data.invoices ?? []);
    setLoading(false);
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    (async () => {
      const entries = await Promise.all(TABS.map(async t => {
        const res = await fetch(`/api/sertec/invoices?status=${t.key}`);
        const data = await res.json();
        return [t.key, (data.invoices ?? []).length] as const;
      }));
      setCounts(Object.fromEntries(entries));
    })();
  }, [invoices]);

  const activeTab = TABS.find(t => t.key === tab)!;
  const Card = activeTab.Card;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Excepciones</h2>
        <p className="text-gray-500 text-sm">Cada cola la resuelve un responsable distinto — el sistema ya filtró qué factura va a cuál.</p>
      </div>

      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors
              ${tab === t.key ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
            <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${tab === t.key ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
              {counts[t.key] ?? 0}
            </span>
          </button>
        ))}
      </div>

      <p className="text-xs text-gray-400">Suele resolverla: {activeTab.roleHint} — estás viendo como {ROLE_LABELS[role]}.</p>

      {loading ? (
        <div className="p-12 text-center"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" /></div>
      ) : (
        <div className="space-y-3">
          {invoices.map(inv => (
            <Card key={inv.id} invoice={inv} actor={ROLE_LABELS[role]} actorRole={role} onResolved={load} />
          ))}
          {invoices.length === 0 && <p className="text-sm text-gray-400 text-center py-10">No hay facturas en esta cola. 🎉</p>}
        </div>
      )}
    </div>
  );
}
