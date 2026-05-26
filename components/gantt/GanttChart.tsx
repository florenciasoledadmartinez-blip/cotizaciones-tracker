'use client';
import { useMemo } from 'react';
import { GANTT_STATUS_COLORS, STATUS_LABELS, formatDate } from '@/lib/utils';

interface Quote {
  id: number;
  quote_number: string;
  client_name: string;
  received_date: string;
  deadline_date: string;
  estimated_send_date?: string;
  actual_send_date?: string;
  assigned_user_name?: string;
  status: string;
  progress_percentage: number;
  days_remaining: number;
}

function parseDate(str: string): Date {
  return new Date(str + 'T00:00:00');
}

export default function GanttChart({ quotes }: { quotes: Quote[] }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { minDate, maxDate, totalDays } = useMemo(() => {
    if (!quotes.length) {
      const min = new Date(today);
      const max = new Date(today);
      max.setDate(max.getDate() + 30);
      return { minDate: min, maxDate: max, totalDays: 30 };
    }

    const dates = quotes.flatMap(q => [
      parseDate(q.received_date),
      parseDate(q.deadline_date),
    ]);
    const min = new Date(Math.min(...dates.map(d => d.getTime())));
    const max = new Date(Math.max(...dates.map(d => d.getTime())));
    min.setDate(min.getDate() - 3);
    max.setDate(max.getDate() + 5);
    const totalDays = Math.round((max.getTime() - min.getTime()) / 86400000) + 1;
    return { minDate: min, maxDate: max, totalDays };
  }, [quotes]);

  function toPercent(date: Date): number {
    return Math.max(0, Math.min(100, ((date.getTime() - minDate.getTime()) / (maxDate.getTime() - minDate.getTime())) * 100));
  }

  const todayPct = toPercent(today);

  // Generate month labels
  const monthLabels: { label: string; left: number }[] = [];
  const cursor = new Date(minDate);
  cursor.setDate(1);
  while (cursor <= maxDate) {
    const pct = toPercent(cursor);
    if (pct >= 0 && pct <= 100) {
      monthLabels.push({
        label: cursor.toLocaleString('es', { month: 'short', year: '2-digit' }),
        left: pct,
      });
    }
    cursor.setMonth(cursor.getMonth() + 1);
  }

  const statusLegend = [
    { color: GANTT_STATUS_COLORS.pending_assignment, label: 'Pendiente' },
    { color: GANTT_STATUS_COLORS.in_progress, label: 'En proceso' },
    { color: GANTT_STATUS_COLORS.in_review, label: 'En revisión' },
    { color: GANTT_STATUS_COLORS.sent, label: 'Enviada' },
    { color: GANTT_STATUS_COLORS.expired, label: 'Vencida' },
  ];

  if (quotes.length === 0) {
    return (
      <div className="card p-12 text-center text-gray-400">
        <p>No hay cotizaciones para visualizar en la línea de tiempo</p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      {/* Legend */}
      <div className="px-5 py-3 border-b border-gray-200 flex items-center gap-6 flex-wrap">
        <span className="text-sm font-medium text-gray-600">Referencias:</span>
        {statusLegend.map(s => (
          <div key={s.label} className="flex items-center gap-1.5">
            <div className="w-4 h-3 rounded" style={{ backgroundColor: s.color }} />
            <span className="text-xs text-gray-600">{s.label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <div className="w-0.5 h-4 bg-blue-500" />
          <span className="text-xs text-gray-600">Hoy</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[800px]">
          {/* Timeline header */}
          <div className="flex border-b border-gray-200 bg-gray-50">
            <div className="w-64 flex-shrink-0 px-4 py-2 text-xs font-medium text-gray-500">Cotización</div>
            <div className="flex-1 relative h-8">
              {monthLabels.map((m, i) => (
                <div key={i} className="absolute top-0 text-xs text-gray-400 pt-2 pl-1 border-l border-gray-200"
                  style={{ left: `${m.left}%` }}>
                  {m.label}
                </div>
              ))}
              {/* Today marker in header */}
              <div className="absolute top-0 bottom-0 w-px bg-blue-400 opacity-60" style={{ left: `${todayPct}%` }} />
            </div>
          </div>

          {/* Rows */}
          {quotes.map((q, idx) => {
            const startPct = toPercent(parseDate(q.received_date));
            const endPct = toPercent(parseDate(q.deadline_date));
            const barWidth = Math.max(endPct - startPct, 1);
            const barColor = GANTT_STATUS_COLORS[q.status] ?? '#9ca3af';

            // Progress fill (within the bar)
            const progressWidth = (q.progress_percentage / 100) * barWidth;

            const isExpired = q.status === 'expired';
            const isDueSoon = q.days_remaining <= 3 && q.days_remaining >= 0 && !['sent','cancelled','closed','expired'].includes(q.status);

            return (
              <div key={q.id} className={`flex border-b border-gray-100 hover:bg-blue-50 transition-colors
                ${isExpired ? 'bg-red-50' : isDueSoon ? 'bg-yellow-50' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}
                style={{ minHeight: '52px' }}>

                {/* Info panel */}
                <div className="w-64 flex-shrink-0 px-4 py-2 flex flex-col justify-center">
                  <div className="flex items-center gap-2">
                    <a href={`/quotes/${q.id}`} className="text-xs font-semibold text-blue-600 hover:underline truncate">
                      {q.quote_number}
                    </a>
                    {isExpired && <span className="text-xs text-red-500 font-bold">VENCIDA</span>}
                    {isDueSoon && <span className="text-xs text-orange-500 font-bold">⚠</span>}
                  </div>
                  <p className="text-xs text-gray-500 truncate">{q.client_name}</p>
                  <p className="text-xs text-gray-400">{q.assigned_user_name ?? 'Sin asignar'}</p>
                </div>

                {/* Gantt bar area */}
                <div className="flex-1 relative py-3">
                  {/* Today vertical line */}
                  <div className="absolute top-0 bottom-0 w-px bg-blue-400 z-10" style={{ left: `${todayPct}%` }} />

                  {/* Bar */}
                  <div
                    className="absolute top-1/2 -translate-y-1/2 h-7 rounded-md overflow-hidden"
                    style={{ left: `${startPct}%`, width: `${barWidth}%`, backgroundColor: `${barColor}40`, border: `2px solid ${barColor}` }}
                    title={`${q.quote_number} — ${STATUS_LABELS[q.status]}\n${formatDate(q.received_date)} → ${formatDate(q.deadline_date)}\nAvance: ${Math.round(q.progress_percentage)}%`}
                  >
                    {/* Progress fill */}
                    <div className="h-full rounded transition-all" style={{ width: `${q.progress_percentage}%`, backgroundColor: barColor, opacity: 0.7 }} />

                    {/* Label inside bar if wide enough */}
                    {barWidth > 15 && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-xs font-bold text-white drop-shadow"
                          style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                          {Math.round(q.progress_percentage)}%
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Actual send date marker */}
                  {q.actual_send_date && (
                    <div
                      className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-green-500 rounded-full border-2 border-white shadow z-20"
                      style={{ left: `${toPercent(parseDate(q.actual_send_date))}%`, marginLeft: '-6px' }}
                      title={`Enviada: ${formatDate(q.actual_send_date)}`}
                    />
                  )}
                </div>

                {/* Right info */}
                <div className="w-28 flex-shrink-0 px-3 py-2 flex flex-col justify-center text-right">
                  <p className={`text-xs font-semibold ${isExpired ? 'text-red-600' : isDueSoon ? 'text-orange-600' : 'text-gray-600'}`}>
                    {isExpired ? `${Math.abs(q.days_remaining)}d venc.` : `${q.days_remaining}d`}
                  </p>
                  <p className="text-xs text-gray-400">{formatDate(q.deadline_date)}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
