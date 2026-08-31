'use client';
import { useEffect, useState } from 'react';
import Modal from '@/components/ui/Modal';
import { useSertecRole } from '@/components/sertec/RoleContext';
import { ROLE_LABELS } from '@/lib/sertec-utils';

export default function PrestacionesPage() {
  const { role } = useSertecRole();
  const canCertify = role === 'solicitante' || role === 'administrador';
  const [periods, setPeriods] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  const [target, setTarget] = useState<any>(null);
  const [status, setStatus] = useState('cumplido');
  const [observation, setObservation] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/sertec/prestaciones?status=${showAll ? 'all' : 'pendiente'}`);
    const data = await res.json();
    setPeriods(data.periods ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, [showAll]);

  function openCertify(p: any) {
    setTarget(p); setStatus('cumplido'); setObservation(''); setError('');
  }

  async function handleCertify(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const res = await fetch(`/api/sertec/periods/${target.id}/certify`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, observation, actor: ROLE_LABELS[role], actorRole: role }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setTarget(null);
      load();
    } finally { setSaving(false); }
  }

  function urgency(days: number) {
    if (days >= 10) return 'text-red-600 font-semibold';
    if (days >= 4) return 'text-amber-600 font-medium';
    return 'text-gray-400';
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Certificación de prestación por período</h2>
          <p className="text-gray-500 text-sm">
            Antes de que llegue la factura: el responsable operativo confirma si el servicio se prestó, se prestó
            parcialmente, o no se prestó. La antigüedad muestra hace cuántos días terminó el período sin certificar.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} className="w-4 h-4 rounded border-gray-300" />
          Ver también los ya certificados
        </label>
      </div>

      {!canCertify && (
        <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
          Certificar es responsabilidad del área que contrató el servicio (rol Solicitante). Estás viendo como {ROLE_LABELS[role]} — podés mirar la bandeja, pero certificar requiere cambiar de rol.
        </p>
      )}

      {loading ? (
        <div className="p-12 text-center"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" /></div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Servicio', 'Proveedor', 'Período', 'Gerencia', 'Responsable', 'Antigüedad', 'Estado', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {periods.map(p => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{p.service_name}</td>
                  <td className="px-4 py-3 text-gray-600">{p.provider_name}</td>
                  <td className="px-4 py-3 text-gray-600">{p.label}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{p.department || '—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{p.responsible_name || '—'}</td>
                  <td className={`px-4 py-3 ${urgency(p.days_since_period_end)}`}>
                    {p.certification_status === 'pendiente'
                      ? (p.days_since_period_end > 0 ? `lleva ${p.days_since_period_end} día${p.days_since_period_end === 1 ? '' : 's'} sin certificar` : 'período en curso')
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium
                      ${p.certification_status === 'cumplido' ? 'bg-green-100 text-green-700'
                        : p.certification_status === 'parcial' ? 'bg-orange-100 text-orange-700'
                        : p.certification_status === 'no_cumplido' ? 'bg-red-100 text-red-700'
                        : 'bg-gray-100 text-gray-600'}`}>
                      {p.certification_status === 'cumplido' ? 'Cumplido' : p.certification_status === 'parcial' ? 'Parcial'
                        : p.certification_status === 'no_cumplido' ? 'No cumplido' : 'Pendiente'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {p.certification_status === 'pendiente' && canCertify && (
                      <button onClick={() => openCertify(p)} className="text-xs text-blue-600 hover:underline font-medium">Certificar</button>
                    )}
                  </td>
                </tr>
              ))}
              {periods.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400">
                  {showAll ? 'No hay períodos cargados todavía.' : 'No hay períodos pendientes de certificar. 🎉'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Modal isOpen={!!target} onClose={() => setTarget(null)} title={`Certificar prestación — ${target?.service_name ?? ''} (${target?.label ?? ''})`} size="md">
        <form onSubmit={handleCertify} className="space-y-4">
          <div>
            <label className="label">¿Se prestó el servicio en este período?</label>
            <div className="flex gap-2">
              {[['cumplido', 'Cumplido'], ['parcial', 'Parcial'], ['no_cumplido', 'No cumplido']].map(([v, l]) => (
                <button key={v} type="button" onClick={() => setStatus(v)}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border-2 transition-colors
                    ${status === v ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Observación {status !== 'cumplido' && <span className="text-red-500">(obligatoria)</span>}</label>
            <textarea className="input" rows={3} value={observation} onChange={e => setObservation(e.target.value)}
              placeholder={status === 'cumplido' ? 'Opcional' : 'Explicá qué faltó o por qué no se prestó'} />
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setTarget(null)} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Guardando...' : 'Confirmar certificación'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
