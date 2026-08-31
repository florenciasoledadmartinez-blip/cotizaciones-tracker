'use client';
import { useState } from 'react';
import { useSertecRole } from '@/components/sertec/RoleContext';
import { ROLE_LABELS } from '@/lib/sertec-utils';

export default function SertecAdminPage() {
  const { role } = useSertecRole();
  const [file, setFile] = useState<File | null>(null);
  const [pasted, setPasted] = useState('');
  const [replaceAll, setReplaceAll] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  if (role !== 'administrador') {
    return (
      <div className="max-w-lg mx-auto text-center py-16">
        <p className="text-gray-500">Esta pantalla es exclusiva del rol Administrador.</p>
        <p className="text-sm text-gray-400 mt-1">Estás viendo como {ROLE_LABELS[role]}. Cambiá el rol arriba para acceder.</p>
      </div>
    );
  }

  const canSubmit = (file || pasted.trim()) && (!replaceAll || confirmText === 'BORRAR TODO');

  async function handleImport() {
    setLoading(true); setResult(null);
    try {
      const fd = new FormData();
      if (file) fd.append('file', file);
      if (pasted.trim()) fd.append('text', pasted);
      fd.append('replaceAll', replaceAll ? 'true' : 'false');
      const res = await fetch('/api/sertec/admin/import', { method: 'POST', body: fd });
      const data = await res.json();
      setResult(data);
    } finally { setLoading(false); }
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Importación / reinicio de base</h2>
        <p className="text-gray-500 text-sm mt-1">
          Pensado para la carga inicial única: reemplazar los datos de ejemplo por proveedores y condiciones de servicio
          reales. No es un flujo de uso recurrente — no sincroniza con el ERP.
        </p>
      </div>

      <div className="card p-5 space-y-4">
        <div>
          <label className="label">Columnas reconocidas</label>
          <p className="text-xs text-gray-500">
            Proveedor, CUIT, Email, Servicio, Centro de costos, Gerencia, Responsable, Periodicidad (Mensual/Quincenal/Evento),
            Precio, Base de actualización, Duración períodos, Período presupuestario, Fecha inicio.
          </p>
        </div>

        <div>
          <label className="label">Opción A — subir archivo (.xlsx o .csv)</label>
          <input type="file" accept=".xlsx,.xls,.csv" onChange={e => { setFile(e.target.files?.[0] ?? null); setPasted(''); }}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer" />
        </div>

        <div>
          <label className="label">Opción B — pegar los datos (con encabezados en la primera fila)</label>
          <textarea className="input font-mono text-xs" rows={6} value={pasted}
            onChange={e => { setPasted(e.target.value); setFile(null); }}
            placeholder="Proveedor	CUIT	Servicio	Centro de costos	Gerencia	Responsable	Periodicidad	Precio..." />
        </div>

        <label className={`flex items-start gap-3 cursor-pointer rounded-lg px-4 py-3 border-2 transition-colors
          ${replaceAll ? 'bg-red-50 border-red-400' : 'bg-gray-50 border-gray-200 hover:border-red-200'}`}>
          <input type="checkbox" checked={replaceAll} onChange={e => { setReplaceAll(e.target.checked); setConfirmText(''); }}
            className="mt-0.5 w-4 h-4 rounded border-red-400 text-red-600 flex-shrink-0" />
          <div>
            <p className={`text-sm font-semibold ${replaceAll ? 'text-red-700' : 'text-gray-700'}`}>
              🗑 Reemplazar todo — borra todos los proveedores, servicios, períodos y facturas cargados hasta ahora
            </p>
            <p className={`text-xs mt-0.5 ${replaceAll ? 'text-red-600' : 'text-gray-400'}`}>
              Acción irreversible. Esto borra todo lo que hay cargado ahora, incluidos datos reales si ya se cargó alguno.
            </p>
          </div>
        </label>

        {replaceAll && (
          <div>
            <label className="label">Escribí <code className="bg-gray-100 px-1 rounded">BORRAR TODO</code> para confirmar</label>
            <input className="input" value={confirmText} onChange={e => setConfirmText(e.target.value)} />
          </div>
        )}

        {result && (
          <div className={`rounded-lg p-3 text-sm ${result.error ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
            {result.error ? `❌ ${result.error}` : (
              <>
                {result.deletedProviders > 0 && <p className="text-red-600">🗑 {result.deletedProviders} proveedores anteriores eliminados</p>}
                <p>✓ {result.providersCreated} proveedores nuevos · {result.servicesCreated} servicios cargados</p>
                {result.skipped > 0 && <p className="text-yellow-700">⚠ {result.skipped} filas omitidas (sin proveedor o servicio)</p>}
              </>
            )}
          </div>
        )}

        <div className="flex justify-end">
          <button onClick={handleImport} disabled={!canSubmit || loading} className="btn-primary">
            {loading ? 'Importando...' : 'Importar'}
          </button>
        </div>
      </div>
    </div>
  );
}
