'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import QuoteTable from '@/components/quotes/QuoteTable';
import QuoteForm from '@/components/quotes/QuoteForm';
import Modal from '@/components/ui/Modal';
import { STATUS_LABELS } from '@/lib/utils';

const STATUSES = [
  'pending_assignment','assigned','in_progress','in_review','sent','expired','cancelled','closed'
];
const PRIORITIES = ['low','medium','high','urgent'];
const PRIORITY_LABELS: Record<string,string> = { low:'Baja', medium:'Media', high:'Alta', urgent:'Urgente' };

export default function QuotesPage() {
  const router = useRouter();
  const [quotes, setQuotes] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingQuote, setEditingQuote] = useState<any>(null);
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<any>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [clearDemo, setClearDemo] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterExpired, setFilterExpired] = useState(false);
  const [filterDueSoon, setFilterDueSoon] = useState(false);
  const [activeTab, setActiveTab] = useState('all');

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => setCurrentUser(d.user));
    fetch('/api/users').then(r => r.json()).then(d => setUsers((d.users ?? []).filter((u:any) => u.role === 'operator')));
  }, []);

  const fetchQuotes = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (filterStatus) params.set('status', filterStatus);
    if (filterPriority) params.set('priority', filterPriority);
    if (filterExpired) params.set('expired', 'true');
    if (filterDueSoon) params.set('dueSoon', '7');
    try {
      const res = await fetch(`/api/quotes?${params}`);
      const data = await res.json();
      setQuotes(data.quotes ?? []);
    } finally { setLoading(false); }
  }, [search, filterStatus, filterPriority, filterExpired, filterDueSoon]);

  useEffect(() => { fetchQuotes(); }, [fetchQuotes]);

  const canEdit = currentUser && (currentUser.role === 'admin' || currentUser.role === 'leader');

  async function handleDelete(id: number) {
    await fetch(`/api/quotes/${id}`, { method: 'DELETE' });
    fetchQuotes();
  }

  async function handleImport() {
    if (!importFile) return;
    setImportLoading(true);
    const fd = new FormData();
    fd.append('file', importFile);
    fd.append('clearDemo', clearDemo ? 'true' : 'false');
    const res = await fetch('/api/quotes/import', { method: 'POST', body: fd });
    const data = await res.json();
    setImportResult(data);
    setImportLoading(false);
    if (data.imported > 0 || data.updated > 0) fetchQuotes();
  }

  async function handleExport(type: string) {
    window.open(`/api/quotes/export?type=${type}`, '_blank');
  }

  // Tab filtering
  const tabQuotes = activeTab === 'all' ? quotes
    : activeTab === 'expired' ? quotes.filter(q => q.status === 'expired')
    : activeTab === 'due_soon' ? quotes.filter(q => q.days_remaining <= 7 && q.days_remaining >= 0 && !['sent','cancelled','closed','expired'].includes(q.status))
    : activeTab === 'in_progress' ? quotes.filter(q => ['in_progress','in_review','assigned'].includes(q.status))
    : activeTab === 'pending' ? quotes.filter(q => q.status === 'pending_assignment')
    : quotes.filter(q => ['sent','closed'].includes(q.status));

  const tabs = [
    { key: 'all', label: 'Todas', count: quotes.length },
    { key: 'pending', label: 'Sin asignar', count: quotes.filter(q => q.status === 'pending_assignment').length },
    { key: 'in_progress', label: 'En proceso', count: quotes.filter(q => ['in_progress','in_review','assigned'].includes(q.status)).length },
    { key: 'expired', label: 'Vencidas', count: quotes.filter(q => q.status === 'expired').length },
    { key: 'due_soon', label: 'Próximas a vencer', count: quotes.filter(q => q.days_remaining <= 7 && q.days_remaining >= 0 && !['sent','cancelled','closed','expired'].includes(q.status)).length },
    { key: 'done', label: 'Finalizadas', count: quotes.filter(q => ['sent','closed'].includes(q.status)).length },
  ];

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cotizaciones</h1>
          <p className="text-gray-500 text-sm">{quotes.length} cotizaciones en total</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canEdit && (
            <>
              <button onClick={() => setShowImport(true)} className="btn-secondary btn-sm">
                ↑ Importar
              </button>
              <div className="relative group">
                <button className="btn-secondary btn-sm">↓ Exportar ▾</button>
                <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 hidden group-hover:block min-w-[160px]">
                  {[['quotes','Cotizaciones'],['workload','Carga por usuario'],['expired','Vencidas'],['history','Historial']].map(([t,l]) => (
                    <button key={t} onClick={() => handleExport(t)} className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-50">
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={() => { setEditingQuote(null); setShowForm(true); }} className="btn-primary btn-sm">
                + Nueva cotización
              </button>
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-3">
          <input className="input flex-1 min-w-[200px]" placeholder="Buscar número, cliente..." value={search}
            onChange={e => setSearch(e.target.value)} />
          <select className="input w-48" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">Todos los estados</option>
            {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
          <select className="input w-40" value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
            <option value="">Toda prioridad</option>
            {PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" checked={filterExpired} onChange={e => setFilterExpired(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-red-500" />
            Solo vencidas
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" checked={filterDueSoon} onChange={e => setFilterDueSoon(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-yellow-500" />
            Próximas a vencer
          </label>
          {(search || filterStatus || filterPriority || filterExpired || filterDueSoon) && (
            <button onClick={() => { setSearch(''); setFilterStatus(''); setFilterPriority(''); setFilterExpired(false); setFilterDueSoon(false); }}
              className="btn-ghost btn-sm text-gray-400">✕ Limpiar</button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap
              ${activeTab === tab.key
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
            {tab.label}
            <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs
              ${activeTab === tab.key ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-gray-400 text-sm mt-3">Cargando cotizaciones...</p>
          </div>
        ) : (
          <QuoteTable
            quotes={tabQuotes}
            canEdit={canEdit}
            onEdit={q => { setEditingQuote(q); setShowForm(true); }}
            onDelete={handleDelete}
          />
        )}
      </div>

      {/* Create / Edit Modal */}
      <Modal isOpen={showForm} onClose={() => { setShowForm(false); setEditingQuote(null); }}
        title={editingQuote ? 'Editar cotización' : 'Nueva cotización'} size="lg">
        <QuoteForm
          users={users}
          initialData={editingQuote}
          onSuccess={() => { setShowForm(false); setEditingQuote(null); fetchQuotes(); }}
          onCancel={() => { setShowForm(false); setEditingQuote(null); }}
        />
      </Modal>

      {/* Import Modal */}
      <Modal isOpen={showImport} onClose={() => { setShowImport(false); setImportResult(null); setImportFile(null); setClearDemo(true); }}
        title="Importar cotizaciones desde Excel" size="md">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Seleccioná el archivo <strong>Seguimiento cotizaciones.xlsx</strong>. El sistema detecta automáticamente
            las columnas N°, Cliente_Full, Nombre, TIPO, ESCALA, Recepción, Dead-line, Estado, Cotizó, Observaciones.
          </p>

          {/* Clear demo checkbox */}
          <label className="flex items-start gap-3 cursor-pointer bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            <input
              type="checkbox"
              checked={clearDemo}
              onChange={e => setClearDemo(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-amber-400 text-amber-600 flex-shrink-0"
            />
            <div>
              <p className="text-sm font-medium text-amber-800">Borrar cotizaciones de ejemplo (COT-XXXX)</p>
              <p className="text-xs text-amber-600 mt-0.5">
                Elimina los datos de prueba antes de importar tus cotizaciones reales.
                No afecta cotizaciones con número puro (1000, 5965, etc.).
              </p>
            </div>
          </label>

          <p className="text-xs text-blue-700 bg-blue-50 rounded-lg px-3 py-2">
            ✦ Las cotizaciones ya existentes se <strong>actualizan</strong>. Las nuevas se crean con su checklist de tareas.
            Los cotizadores se registran automáticamente como usuarios (contraseña: <code>cambiar123</code>).
          </p>

          <div className="border-2 border-dashed border-gray-300 rounded-xl p-5 text-center">
            <input type="file" accept=".xlsx,.xls" onChange={e => { setImportFile(e.target.files?.[0] ?? null); setImportResult(null); }}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer" />
            {importFile && <p className="text-xs text-gray-500 mt-2">📄 {importFile.name} ({(importFile.size/1024).toFixed(0)} KB)</p>}
          </div>

          {importResult && (
            <div className={`rounded-lg p-3 text-sm ${importResult.error ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
              {importResult.error ? (
                <p className="flex items-start gap-2">❌ <span>{importResult.error}</span></p>
              ) : (
                <>
                  <p className="font-semibold mb-1.5">Importación completada:</p>
                  <p>✓ {importResult.imported} cotizaciones nuevas</p>
                  {importResult.updated > 0 && <p>↻ {importResult.updated} actualizadas</p>}
                  {importResult.skipped > 0 && <p className="text-yellow-700 mt-1">⚠ {importResult.skipped} filas omitidas (sin N° o sin fecha)</p>}
                  <p className="text-xs opacity-70 mt-1">Total procesadas: {importResult.total}</p>
                </>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <button onClick={() => { setShowImport(false); setImportResult(null); setImportFile(null); setClearDemo(true); }} className="btn-secondary">
              Cerrar
            </button>
            <button onClick={handleImport} disabled={!importFile || importLoading} className="btn-primary">
              {importLoading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Importando...
                </span>
              ) : 'Importar Excel'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
