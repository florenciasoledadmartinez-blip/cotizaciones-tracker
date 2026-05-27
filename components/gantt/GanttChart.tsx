'use client';
import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { PRIORITY_COLORS, PRIORITY_LABELS, STATUS_COLORS, STATUS_LABELS } from '@/lib/utils';

interface TaskProgress {
  name: string;
  order_index: number;
  progress_percentage: number;
}

interface PipelineQuote {
  id: number;
  quote_number: string;
  client_name: string;
  assigned_user_name: string | null;
  status: string;
  priority: string;
  deadline_date: string;
  days_remaining: number;
  progress_percentage: number;
  tasks: TaskProgress[];
}

interface TaskHeader {
  id: number;
  name: string;
  order_index: number;
}

interface User {
  id: number;
  name: string;
}

// Short label for the column header (first word of the task name)
function shortName(name: string): string {
  return name.split(' ')[0];
}

// Cell colour + text based on progress
function taskCellStyle(pct: number, isCurrent: boolean) {
  const base = isCurrent ? 'ring-2 ring-offset-1 ring-blue-400 ' : '';
  if (pct === 100) return base + 'bg-green-100 text-green-700';
  if (pct >= 50)   return base + 'bg-blue-100 text-blue-700';
  if (pct > 0)     return base + 'bg-amber-100 text-amber-700';
  return base + 'bg-gray-100 text-gray-400';
}

function taskCellLabel(pct: number) {
  if (pct === 100) return '✓';
  if (pct > 0)     return `${pct}%`;
  return '—';
}

export default function GanttChart() {
  const [quotes, setQuotes]           = useState<PipelineQuote[]>([]);
  const [taskHeaders, setTaskHeaders] = useState<TaskHeader[]>([]);
  const [users, setUsers]             = useState<User[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);

  // Filters
  const [search, setSearch]           = useState('');
  const [userId, setUserId]           = useState('');
  const [priority, setPriority]       = useState('');
  const [includeExpired, setIncludeExpired] = useState(false);

  // Sort
  const [sortKey, setSortKey]   = useState<string>('deadline');
  const [sortDir, setSortDir]   = useState<'asc' | 'desc'>('asc');

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      const p = new URLSearchParams();
      if (userId)        p.set('user_id', userId);
      if (priority)      p.set('priority', priority);
      if (search)        p.set('search', search);
      if (includeExpired) p.set('expired', 'true');

      const res = await fetch(`/api/quotes/pipeline?${p}`);
      if (!res.ok) throw new Error('Error al cargar datos');
      const data = await res.json();
      setQuotes(data.quotes ?? []);
      setTaskHeaders(data.taskHeaders ?? []);
      setUsers(data.users ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchData(); }, [userId, priority, includeExpired]);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => fetchData(), 350);
    return () => clearTimeout(t);
  }, [search]);

  function handleSort(key: string) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }

  const sorted = useMemo(() => {
    return [...quotes].sort((a: any, b: any) => {
      let av: any, bv: any;
      if (sortKey === 'deadline')  { av = a.deadline_date; bv = b.deadline_date; }
      else if (sortKey === 'progress') { av = a.progress_percentage; bv = b.progress_percentage; }
      else if (sortKey === 'quote_number') {
        return sortDir === 'asc'
          ? parseInt(a.quote_number) - parseInt(b.quote_number)
          : parseInt(b.quote_number) - parseInt(a.quote_number);
      } else if (sortKey.startsWith('task_')) {
        const idx = parseInt(sortKey.replace('task_', ''));
        av = a.tasks[idx]?.progress_percentage ?? -1;
        bv = b.tasks[idx]?.progress_percentage ?? -1;
      } else { av = a[sortKey] ?? ''; bv = b[sortKey] ?? ''; }
      if (av === bv) return 0;
      return sortDir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });
  }, [quotes, sortKey, sortDir]);

  // Summary: how many quotes are stuck at each task
  const stageSummary = useMemo(() => {
    if (!taskHeaders.length) return [];
    return taskHeaders.map((t, i) => ({
      name: t.name,
      short: shortName(t.name),
      count: quotes.filter(q => {
        if (!q.tasks.length) return false;
        const currentIdx = q.tasks.findIndex(t => t.progress_percentage < 100);
        return currentIdx === i;
      }).length,
    }));
  }, [quotes, taskHeaders]);

  const SortTh = ({ label, k, className = '' }: { label: string; k: string; className?: string }) => (
    <th
      onClick={() => handleSort(k)}
      className={`px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-800 select-none whitespace-nowrap ${className}`}
    >
      <span className="flex items-center gap-1">
        {label}
        {sortKey === k && <span className="text-blue-500 text-[10px]">{sortDir === 'asc' ? '↑' : '↓'}</span>}
      </span>
    </th>
  );

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-400">
      <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-sm">Cargando pipeline...</p>
    </div>
  );

  if (error) return (
    <div className="card p-8 text-center text-red-600">
      <p>❌ {error}</p>
      <button onClick={fetchData} className="mt-3 btn-secondary btn-sm">Reintentar</button>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* ── Filters ── */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-3">
          <input
            className="input flex-1 min-w-[200px]"
            placeholder="Buscar número o cliente..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select className="input w-48" value={userId} onChange={e => setUserId(e.target.value)}>
            <option value="">Todos los responsables</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <select className="input w-40" value={priority} onChange={e => setPriority(e.target.value)}>
            <option value="">Toda prioridad</option>
            {['low','medium','high','urgent'].map(p => (
              <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer whitespace-nowrap">
            <input
              type="checkbox"
              checked={includeExpired}
              onChange={e => setIncludeExpired(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300"
            />
            Incluir vencidas
          </label>
          {(search || userId || priority) && (
            <button
              onClick={() => { setSearch(''); setUserId(''); setPriority(''); }}
              className="btn-ghost btn-sm text-gray-400"
            >✕ Limpiar</button>
          )}
        </div>
      </div>

      {/* ── Stage summary chips ── */}
      {stageSummary.length > 0 && quotes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {stageSummary.map((s, i) => (
            <button
              key={i}
              onClick={() => { setSortKey(`task_${i}`); setSortDir('asc'); }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors
                ${s.count > 0 ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100' : 'border-gray-200 bg-gray-50 text-gray-400'}`}
              title={`Cotizaciones actualmente en: ${s.name}`}
            >
              <span>{s.short}</span>
              <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${s.count > 0 ? 'bg-amber-200 text-amber-800' : 'bg-gray-200 text-gray-500'}`}>
                {s.count}
              </span>
            </button>
          ))}
          <span className="px-3 py-1.5 text-xs text-gray-400 self-center">
            {quotes.length} cotizaciones · hacé clic en una etapa para ordenar
          </span>
        </div>
      )}

      {/* ── Matrix table ── */}
      {sorted.length === 0 ? (
        <div className="card p-12 text-center text-gray-400">
          <p className="text-sm">No hay cotizaciones para mostrar con los filtros actuales.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <SortTh label="Nro"        k="quote_number"   className="sticky left-0 bg-gray-50 z-10 border-r border-gray-200 w-20" />
                  <SortTh label="Cliente"    k="client_name"    className="min-w-[130px]" />
                  <SortTh label="Responsable" k="assigned_user_name" className="min-w-[110px]" />

                  {/* One column per task template */}
                  {taskHeaders.map((t, i) => (
                    <th
                      key={t.id}
                      onClick={() => handleSort(`task_${i}`)}
                      title={t.name}
                      className="px-2 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-800 select-none text-center w-20"
                    >
                      <span className="flex flex-col items-center gap-0.5">
                        <span className="w-5 h-5 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                          {i + 1}
                        </span>
                        <span className="text-[10px] leading-tight">{shortName(t.name)}</span>
                        {sortKey === `task_${i}` && <span className="text-blue-500 text-[10px]">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                      </span>
                    </th>
                  ))}

                  <SortTh label="Avance"   k="progress"  className="text-center w-28" />
                  <SortTh label="Deadline" k="deadline"  className="text-right w-28" />
                </tr>
                {/* Task full names sub-header */}
                {taskHeaders.length > 0 && (
                  <tr className="bg-blue-50 border-b border-blue-100">
                    <td colSpan={3} className="sticky left-0 bg-blue-50 border-r border-blue-100 px-3 py-1.5">
                      <span className="text-[10px] text-blue-400 font-medium uppercase tracking-wide">Etapa checklist →</span>
                    </td>
                    {taskHeaders.map(t => (
                      <td key={t.id} className="px-1 py-1 text-center">
                        <span className="text-[10px] text-blue-600 leading-tight block max-w-[72px] mx-auto" title={t.name}>
                          {t.name}
                        </span>
                      </td>
                    ))}
                    <td colSpan={2} />
                  </tr>
                )}
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sorted.map((q, idx) => {
                  const isExpired  = q.status === 'expired';
                  const isDueSoon  = q.days_remaining <= 3 && q.days_remaining >= 0 && !isExpired;
                  // Index of the first task that isn't 100% done = "current stage"
                  const currentIdx = q.tasks.findIndex(t => t.progress_percentage < 100);

                  return (
                    <tr
                      key={q.id}
                      className={`hover:bg-blue-50 transition-colors
                        ${isExpired ? 'bg-red-50' : isDueSoon ? 'bg-yellow-50' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}
                    >
                      {/* Quote number – sticky */}
                      <td className="sticky left-0 px-3 py-2.5 border-r border-gray-100 bg-inherit">
                        <Link href={`/quotes/${q.id}`}
                          className="font-semibold text-blue-600 hover:text-blue-800 hover:underline text-sm">
                          {q.quote_number}
                        </Link>
                        <div className="mt-0.5">
                          <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-medium ${PRIORITY_COLORS[q.priority]}`}>
                            {PRIORITY_LABELS[q.priority]}
                          </span>
                        </div>
                      </td>

                      {/* Cliente */}
                      <td className="px-3 py-2.5">
                        <p className="text-gray-800 text-xs font-medium truncate max-w-[130px]" title={q.client_name}>
                          {q.client_name}
                        </p>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          <span className={`inline-flex px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[q.status]}`}>
                            {STATUS_LABELS[q.status]}
                          </span>
                        </p>
                      </td>

                      {/* Responsable */}
                      <td className="px-3 py-2.5 text-xs text-gray-600 whitespace-nowrap">
                        {q.assigned_user_name ?? <span className="text-gray-400 italic">Sin asignar</span>}
                      </td>

                      {/* Task cells */}
                      {taskHeaders.map((t, i) => {
                        const task = q.tasks.find(tk => tk.order_index === t.order_index);
                        const pct  = task?.progress_percentage ?? -1;
                        const isCurrent = pct >= 0 && pct < 100 && i === currentIdx;

                        if (pct < 0) {
                          return (
                            <td key={t.id} className="px-1.5 py-2.5 text-center">
                              <div className="mx-auto w-12 h-7 rounded-lg bg-gray-50 flex items-center justify-center">
                                <span className="text-[11px] text-gray-300">N/A</span>
                              </div>
                            </td>
                          );
                        }
                        return (
                          <td key={t.id} className="px-1.5 py-2.5 text-center">
                            <div
                              title={`${t.name}: ${pct === 100 ? 'Completada' : pct > 0 ? `${pct}% completado` : 'Sin iniciar'}`}
                              className={`mx-auto w-12 h-7 rounded-lg flex items-center justify-center text-xs font-bold transition-all
                                ${taskCellStyle(pct, isCurrent)}`}
                            >
                              {taskCellLabel(pct)}
                            </div>
                          </td>
                        );
                      })}

                      {/* Overall progress bar */}
                      <td className="px-3 py-2.5 w-28">
                        {q.tasks.length === 0 ? (
                          <span className="text-xs text-gray-400 italic">Sin checklist</span>
                        ) : (
                          <div className="flex flex-col gap-1">
                            <div className="flex justify-between">
                              <span className="text-[10px] text-gray-500">{q.progress_percentage}%</span>
                            </div>
                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  q.progress_percentage === 100 ? 'bg-green-500' :
                                  q.progress_percentage >= 50   ? 'bg-blue-500' :
                                  q.progress_percentage > 0     ? 'bg-amber-400' :
                                  'bg-gray-300'
                                }`}
                                style={{ width: `${q.progress_percentage}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Deadline */}
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <p className={`text-xs font-semibold ${isExpired ? 'text-red-600' : isDueSoon ? 'text-orange-600' : 'text-gray-600'}`}>
                          {q.deadline_date}
                        </p>
                        <p className={`text-[10px] mt-0.5 ${isExpired ? 'text-red-500' : isDueSoon ? 'text-orange-500' : 'text-gray-400'}`}>
                          {isExpired
                            ? `${Math.abs(q.days_remaining)}d vencida`
                            : `${q.days_remaining}d restantes`}
                        </p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer count */}
          <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50 text-xs text-gray-400">
            Mostrando {sorted.length} cotizaciones
          </div>
        </div>
      )}
    </div>
  );
}
