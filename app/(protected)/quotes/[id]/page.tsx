'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import ChecklistPanel from '@/components/quotes/ChecklistPanel';
import QuoteForm from '@/components/quotes/QuoteForm';
import Modal from '@/components/ui/Modal';
import ProgressBar from '@/components/ui/ProgressBar';
import { formatDate, formatDateTime, STATUS_LABELS, STATUS_COLORS, PRIORITY_LABELS, PRIORITY_COLORS } from '@/lib/utils';

const STATUSES = ['pending_assignment','assigned','in_progress','in_review','sent','expired','cancelled','closed'];

export default function QuoteDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [quote, setQuote] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);
  const [activeTab, setActiveTab] = useState<'checklist' | 'history' | 'ai'>('checklist');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<any>(null);
  const [statusChanging, setStatusChanging] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => setCurrentUser(d.user));
    fetch('/api/users').then(r => r.json()).then(d => setUsers((d.users ?? []).filter((u:any) => u.role === 'operator')));
  }, []);

  const fetchQuote = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/quotes/${id}`);
      if (!res.ok) { router.push('/quotes'); return; }
      const data = await res.json();
      setQuote(data.quote);
      setAiResult(data.quote.aiInsight);
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { fetchQuote(); }, [fetchQuote]);

  const canEdit = currentUser && (
    currentUser.role === 'admin' ||
    currentUser.role === 'leader' ||
    (currentUser.role === 'operator' && quote?.assigned_user_id === currentUser.userId)
  );
  const isLeader = currentUser?.role === 'admin' || currentUser?.role === 'leader';

  async function handleStatusChange(newStatus: string) {
    setStatusChanging(true);
    await fetch(`/api/quotes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    fetchQuote();
    setStatusChanging(false);
  }

  async function generateAI() {
    setAiLoading(true);
    const res = await fetch(`/api/quotes/${id}/ai`, { method: 'POST' });
    const data = await res.json();
    if (data.insight) setAiResult(data.insight);
    setAiLoading(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!quote) return null;

  const riskColors: Record<string,string> = { bajo:'text-green-600 bg-green-50', medio:'text-yellow-600 bg-yellow-50', 'medio-alto':'text-orange-600 bg-orange-50', alto:'text-red-600 bg-red-50' };

  return (
    <div className="p-6 space-y-5 max-w-6xl">
      {/* Back + Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <button onClick={() => router.back()} className="text-sm text-gray-400 hover:text-gray-600 mb-2 flex items-center gap-1">
            ← Volver
          </button>
          <h1 className="text-2xl font-bold text-gray-900">{quote.quote_number}</h1>
          <p className="text-gray-600">{quote.client_name}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isLeader && (
            <select value={quote.status} onChange={e => handleStatusChange(e.target.value)}
              disabled={statusChanging}
              className={`input w-48 text-sm font-medium ${STATUS_COLORS[quote.status]}`}>
              {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
          )}
          {canEdit && (
            <button onClick={() => setShowEdit(true)} className="btn-secondary">
              Editar
            </button>
          )}
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card p-4">
          <p className="text-xs text-gray-500 uppercase font-medium mb-1">Estado</p>
          <span className={`inline-flex px-2 py-1 rounded-full text-sm font-medium ${STATUS_COLORS[quote.status]}`}>
            {STATUS_LABELS[quote.status]}
          </span>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500 uppercase font-medium mb-1">Prioridad</p>
          <span className={`inline-flex px-2 py-1 rounded-full text-sm font-medium ${PRIORITY_COLORS[quote.priority]}`}>
            {PRIORITY_LABELS[quote.priority]}
          </span>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500 uppercase font-medium mb-1">Deadline</p>
          <p className={`text-sm font-semibold ${quote.status === 'expired' ? 'text-red-600' : 'text-gray-800'}`}>
            {formatDate(quote.deadline_date)}
          </p>
          {quote.estimated_send_date && <p className="text-xs text-gray-400">Est: {formatDate(quote.estimated_send_date)}</p>}
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500 uppercase font-medium mb-1">Responsable</p>
          <p className="text-sm font-semibold text-gray-800">{quote.assigned_user_name ?? 'Sin asignar'}</p>
        </div>
      </div>

      {/* Progress + Details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Avance */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-800">Avance general</h3>
            <span className="text-2xl font-bold text-blue-600">{Math.round(quote.progress_percentage)}%</span>
          </div>
          <ProgressBar value={quote.progress_percentage} size="lg" />
          <div className="mt-3 space-y-2">
            {quote.tasks?.map((t: any) => (
              <div key={t.id} className="flex items-center gap-2">
                <span className="text-xs text-gray-500 truncate flex-1" title={t.template_name}>{t.template_name}</span>
                <ProgressBar value={t.progress_percentage} size="sm" className="w-20" />
                <span className="text-xs text-gray-400 w-8 text-right">{Math.round(t.progress_percentage)}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Info */}
        <div className="card p-5 lg:col-span-2">
          <h3 className="font-semibold text-gray-800 mb-3">Datos de la cotización</h3>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            {[
              ['Tipo', quote.quote_type || '—'],
              ['Fecha recepción', formatDate(quote.received_date)],
              ['Fecha estimada envío', formatDate(quote.estimated_send_date)],
              ['Fecha real de envío', quote.actual_send_date ? formatDate(quote.actual_send_date) : '—'],
              ['Creada por', quote.created_by_name || '—'],
              ['Última actualización', formatDateTime(quote.updated_at)],
            ].map(([label, value]) => (
              <div key={label}>
                <span className="text-gray-400">{label}: </span>
                <span className="font-medium text-gray-700">{value}</span>
              </div>
            ))}
          </div>
          {quote.description && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-xs text-gray-400 mb-1">Descripción</p>
              <p className="text-sm text-gray-700">{quote.description}</p>
            </div>
          )}
          {quote.observations && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-xs text-gray-400 mb-1">Observaciones</p>
              <p className="text-sm text-gray-700 italic">{quote.observations}</p>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div>
        <div className="flex gap-1 border-b border-gray-200 mb-5">
          {[['checklist','Checklist de tareas'],['history','Historial de cambios'],['ai','Análisis IA']].map(([k,l]) => (
            <button key={k} onClick={() => setActiveTab(k as any)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors
                ${activeTab === k ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {l}
            </button>
          ))}
        </div>

        {activeTab === 'checklist' && (
          <ChecklistPanel
            quoteId={quote.id}
            tasks={quote.tasks ?? []}
            quoteStatus={quote.status}
            canEdit={!!canEdit}
            onRefresh={fetchQuote}
            currentUserName={currentUser?.name}
          />
        )}

        {activeTab === 'history' && (
          <div className="card overflow-hidden">
            <div className="divide-y divide-gray-100">
              {quote.activityLog?.length === 0 && (
                <p className="px-5 py-8 text-center text-sm text-gray-400">Sin historial de cambios</p>
              )}
              {quote.activityLog?.map((log: any) => (
                <div key={log.id} className="px-5 py-3 flex items-start gap-3">
                  <div className="w-7 h-7 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-xs font-bold text-gray-500">{(log.user_name ?? 'S')[0]}</span>
                  </div>
                  <div>
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">{log.user_name ?? 'Sistema'}</span> — {log.action}
                    </p>
                    {log.previous_value && log.new_value && (
                      <p className="text-xs text-gray-400">
                        <span className="line-through">{log.previous_value}</span> → <span className="text-gray-600">{log.new_value}</span>
                      </p>
                    )}
                    <p className="text-xs text-gray-400">{formatDateTime(log.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'ai' && (
          <div className="space-y-4">
            <div className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-gray-800">Análisis inteligente</h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {process.env.ANTHROPIC_API_KEY ? 'Powered by Claude' : 'Análisis basado en reglas (sin API key configurada)'}
                  </p>
                </div>
                <button onClick={generateAI} disabled={aiLoading} className="btn-primary btn-sm">
                  {aiLoading ? 'Analizando...' : aiResult ? '↻ Actualizar análisis' : '✦ Generar análisis'}
                </button>
              </div>

              {aiResult ? (
                <div className="space-y-4">
                  <div className={`rounded-lg p-4 ${riskColors[aiResult.risk_level] ?? 'bg-gray-50 text-gray-700'}`}>
                    <p className="text-xs font-semibold uppercase mb-1">Nivel de riesgo: {aiResult.risk_level}</p>
                    <p className="text-sm">{aiResult.summary}</p>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-4">
                    <p className="text-xs font-semibold text-blue-700 uppercase mb-1">Próxima acción sugerida</p>
                    <p className="text-sm text-blue-800">{aiResult.suggested_next_action}</p>
                  </div>
                  {aiResult.created_at && (
                    <p className="text-xs text-gray-400 text-right">Generado: {formatDateTime(aiResult.created_at)}</p>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-400">
                  <p className="text-sm">Hacé clic en "Generar análisis" para obtener un resumen inteligente del estado de esta cotización.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      <Modal isOpen={showEdit} onClose={() => setShowEdit(false)} title="Editar cotización" size="lg">
        <QuoteForm
          users={users}
          initialData={quote}
          onSuccess={() => { setShowEdit(false); fetchQuote(); }}
          onCancel={() => setShowEdit(false)}
        />
      </Modal>
    </div>
  );
}
