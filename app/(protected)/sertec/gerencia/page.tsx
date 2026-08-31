'use client';
import { useCallback, useEffect, useState } from 'react';
import { useSertecRole } from '@/components/sertec/RoleContext';
import { formatCurrency, ROLE_LABELS } from '@/lib/sertec-utils';
import { formatDate } from '@/lib/utils';

export default function GerenciaPage() {
  const { role } = useSertecRole();
  const canAuthorize = role === 'gerencia' || role === 'administrador';
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/sertec/invoices?status=lista_para_autorizar');
    const data = await res.json();
    setInvoices(data.invoices ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function act(id: number, action: 'authorize' | 'reject') {
    setBusyId(id); setError('');
    try {
      const body: any = { action, actor: ROLE_LABELS[role], actorRole: role };
      if (action === 'reject') body.reason = 'Rechazada por Gerencia al momento de autorizar';
      const res = await fetch(`/api/sertec/invoices/${id}/actions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      load();
    } finally { setBusyId(null); }
  }

  const total = invoices.reduce((a, i) => a + Number(i.amount), 0);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Autorización de pagos</h2>
        <p className="text-gray-500 text-sm">
          Solo llegan acá las facturas de servicio con la prestación certificada, el precio confirmado y presupuesto disponible.
        </p>
      </div>
      {!canAuthorize && (
        <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
          Autorizar es tarea del rol Gerencia. Estás viendo como {ROLE_LABELS[role]}.
        </p>
      )}
      {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-12 text-center"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" /></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Proveedor', 'Servicio', 'Período(s)', 'Importe', 'Recibida', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {invoices.map(inv => (
                <tr key={inv.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{inv.provider_name}</td>
                  <td className="px-4 py-3 text-gray-600">{inv.service_name}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{inv.period_labels}</td>
                  <td className="px-4 py-3 text-gray-900">{formatCurrency(inv.amount)}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(inv.received_date)}</td>
                  <td className="px-4 py-3">
                    {canAuthorize && (
                      <div className="flex gap-2">
                        <button disabled={busyId === inv.id} onClick={() => act(inv.id, 'authorize')} className="btn-primary btn-sm">Autorizar</button>
                        <button disabled={busyId === inv.id} onClick={() => act(inv.id, 'reject')} className="btn-danger btn-sm">Rechazar</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">No hay facturas esperando autorización.</td></tr>
              )}
            </tbody>
            {invoices.length > 0 && (
              <tfoot>
                <tr className="bg-gray-50 border-t border-gray-200">
                  <td colSpan={3} className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Total</td>
                  <td className="px-4 py-3 font-semibold text-gray-900">{formatCurrency(total)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>
    </div>
  );
}
