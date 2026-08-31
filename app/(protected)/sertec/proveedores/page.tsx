'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Modal from '@/components/ui/Modal';
import { useSertecRole } from '@/components/sertec/RoleContext';
import { ROLE_LABELS } from '@/lib/sertec-utils';

export default function ProveedoresPage() {
  const { role } = useSertecRole();
  const [providers, setProviders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState('');
  const [cuit, setCuit] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    const res = await fetch('/api/sertec/providers');
    const data = await res.json();
    setProviders(data.providers ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const canManage = role === 'compras' || role === 'administrador';

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const res = await fetch('/api/sertec/providers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, cuit, email }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setShowNew(false); setName(''); setCuit(''); setEmail('');
      load();
    } finally { setSaving(false); }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Proveedores y servicios</h2>
          <p className="text-gray-500 text-sm">
            Alta y edición de la condición de cada servicio: precio de referencia, periodicidad y presupuesto del contrato.
          </p>
        </div>
        {canManage ? (
          <button className="btn-primary" onClick={() => setShowNew(true)}>+ Nuevo proveedor</button>
        ) : (
          <span className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
            Alta y edición reservada al rol Compras. Estás viendo como {ROLE_LABELS[role]}.
          </span>
        )}
      </div>

      {loading ? (
        <div className="p-12 text-center">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {providers.map(p => (
            <Link key={p.id} href={`/sertec/proveedores/${p.id}`}
              className="card p-4 hover:border-blue-300 hover:shadow-md transition-all">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-gray-900">{p.name}</p>
                {!p.active && <span className="text-xs bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">Inactivo</span>}
              </div>
              {p.cuit && <p className="text-xs text-gray-400 mt-0.5">CUIT {p.cuit}</p>}
              <p className="text-xs text-gray-500 mt-2">
                {p.active_services_count} servicio{p.active_services_count === 1 ? '' : 's'} activo{p.active_services_count === 1 ? '' : 's'}
              </p>
            </Link>
          ))}
          {providers.length === 0 && (
            <p className="text-sm text-gray-400 col-span-full text-center py-8">Todavía no hay proveedores cargados.</p>
          )}
        </div>
      )}

      <Modal isOpen={showNew} onClose={() => setShowNew(false)} title="Nuevo proveedor" size="sm">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="label">Nombre / razón social</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div>
            <label className="label">CUIT</label>
            <input className="input" value={cuit} onChange={e => setCuit(e.target.value)} />
          </div>
          <div>
            <label className="label">Email</label>
            <input type="email" className="input" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setShowNew(false)} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Guardando...' : 'Crear'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
