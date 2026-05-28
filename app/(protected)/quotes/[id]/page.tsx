'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import ChecklistPanel from '@/components/quotes/ChecklistPanel';
import ProgressBar from '@/components/ui/ProgressBar';
import { formatDate, formatDateTime, STATUS_LABELS, STATUS_COLORS, PRIORITY_LABELS, PRIORITY_COLORS } from '@/lib/utils';

export default function QuoteDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [quote, setQuote] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userLoading, setUserLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'checklist' | 'history' | 'ai'>('checklist');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<any>(null);
  const [generatingTasks, setGeneratingTasks] = useState(false);

  // Load current user first — canEdit depends on it
  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(d => { setCurrentUser(d.user ?? null); setUserLoading(false); })
      .catch(() => setUserLoading(false));
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

  // Wait for BOTH quote AND currentUser before computing canEdit
  // This prevents the race condition where canEdit=false on initial render
  const isReady = !loading && !userLoading;
  const canEdit = isReady && !!currentUser && (
    currentUser.role === 'admin' ||
    currentUser.role === 'leader' ||
    (currentUser.role === 'operator' && quote?.assigned_user_id === currentUser.userId)
  );
  const isLeader = !!currentUser && (currentUser.role === 'admin' || currentUser.role === 'leader');

  async function handleGenerateTasks() {
    setGeneratingTasks(true);
    const res = await fetch(`/api/quotes/${id}/tasks`, { method: 'POST' });
    if (res.ok) fetchQuote();
    else {
      const d = await res.json().catch(() => ({}));
      alert(d.error || 'Error al generar checklist');
    }
    setGeneratingTasks(false);
  }

  async function generateAI() {
    setAiLoading(true);
    const res = await fetch(`/api/quotes/${id}/ai`, { method: 'POST' });
    const data = await res.json();
    if (data.insight) setAiResult(data.insight);
    setAiLoading(false);
  }

  if (loading || userLoading) {
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
        {/* Status badge — read only. No status dropdown; data comes from Excel */}
        <span className={`inline-flex px-3 py-1.5 rounded-full text-sm font-medium ${STATUS_COLORS[quote.status]}`}>
          {STATUS_LABELS[quote.status]}
        </span>
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

        {/* Info — read only, synced from Excel */}
        <div className="card p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-800">Datos de la cotización</h3>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">📥 Desde Excel</span>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            {[
              ['Tipo', quote.quote_type || '—'],
              ['Fecha recepción', formatDate(quote.received_date)],
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

        {activeTab === 'checklist' && (() => {
          const tasks = quote.tasks ?? [];
          // Orphaned = tasks exist but NONE have subtasks (failed bulk import)
          const hasOrphanedTasks = tasks.length > 0 &&
            tasks.every((t: any) => (t.subtasks?.length ?? 0) === 0);
          const noTasks = tasks.length === 0;

          if (noTasks || hasOrphanedTasks) {
            return (
              <div className="card p-10 text-center">
                <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <p className="text-gray-600 font-medium mb-1">
                  {hasOrphanedTasks
                    ? 'Esta cotización tiene tareas pero le faltan las subtareas'
                    : 'Esta cotización no tiene checklist de tareas'}
                </p>
                <p className="text-sm text-gray-400 mb-5">
                  {hasOrphanedTasks
                    ? 'Hacé clic en el botón para regenerar el checklist completo.'
                    : 'Las cotizaciones con estado final no generan checklist automáticamente.'}
                </p>
                {isLeader && (
                  <button
                    onClick={handleGenerateTasks}
                    disabled={generatingTasks}
                    className="btn-primary"
                  >
                    {generatingTasks ? (
                      <span className="flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Generando...
                      </span>
                    ) : hasOrphanedTasks ? '↻ Regenerar checklist' : '✦ Generar checklist de tareas'}
                  </button>
                )}
              </div>
            );
          }

          return (
            <ChecklistPanel
              quoteId={quote.id}
              tasks={tasks}
              quoteStatus={quote.status}
              canEdit={canEdit}
              onRefresh={fetchQuote}
              currentUserName={currentUser?.name}
              currentUserRole={currentUser?.role}
            />
          );
        })()}

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
                  <p className="text-xs text-gray-400 mt-0.5">Análisis basado en el estado actual de la cotización</p>
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
                  <p className="text-sm">Hacé clic en "Generar análisis" para obtener un resumen inteligente de esta cotización.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
