'use client';
import Link from 'next/link';
import { useState } from 'react';
import ProgressBar from '@/components/ui/ProgressBar';
import Badge from '@/components/ui/Badge';
import { formatDate, STATUS_LABELS, STATUS_COLORS, PRIORITY_LABELS, PRIORITY_COLORS } from '@/lib/utils';

interface Quote {
  id: number;
  quote_number: string;
  client_name: string;
  description?: string;
  deadline_date: string;
  received_date: string;
  assigned_user_name?: string;
  status: string;
  priority: string;
  progress_percentage: number;
  days_remaining: number;
  updated_at: string;
}

interface QuoteTableProps {
  quotes: Quote[];
  onEdit?: (quote: Quote) => void;
  onDelete?: (id: number) => void;
  canEdit?: boolean;
}

export default function QuoteTable({ quotes, onEdit, onDelete, canEdit }: QuoteTableProps) {
  // Default: número más alto primero (= cotización más reciente)
  const [sortKey, setSortKey] = useState<string>('quote_number');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  function handleSort(key: string) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    // Fechas y número: la primera vez que se clickea, baja (desc = más nuevo primero)
    else { setSortKey(key); setSortDir(['received_date','deadline_date','quote_number'].includes(key) ? 'desc' : 'asc'); }
  }

  const sorted = [...quotes].sort((a: any, b: any) => {
    let av = a[sortKey] ?? '';
    let bv = b[sortKey] ?? '';
    // Comparar quote_number como número entero
    if (sortKey === 'quote_number') {
      const an = parseInt(av, 10);
      const bn = parseInt(bv, 10);
      if (!isNaN(an) && !isNaN(bn)) {
        return sortDir === 'asc' ? an - bn : bn - an;
      }
    }
    return sortDir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
  });

  const Th = ({ label, k }: { label: string; k: string }) => (
    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-700 select-none"
      onClick={() => handleSort(k)}>
      <span className="flex items-center gap-1">
        {label}
        {sortKey === k && <span className="text-blue-500">{sortDir === 'asc' ? '↑' : '↓'}</span>}
      </span>
    </th>
  );

  if (quotes.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        <p>No hay cotizaciones para mostrar</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <Th label="Número" k="quote_number" />
            <Th label="Cliente" k="client_name" />
            <Th label="Responsable" k="assigned_user_name" />
            <Th label="Estado" k="status" />
            <Th label="Prioridad" k="priority" />
            <Th label="Recepción" k="received_date" />
            <Th label="Deadline" k="deadline_date" />
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Días</th>
            <Th label="Avance" k="progress_percentage" />
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sorted.map(q => {
            const isExpired = q.status === 'expired';
            const isDueSoon = q.days_remaining !== null && q.days_remaining <= 3 && q.days_remaining >= 0 && !['sent','cancelled','closed','expired'].includes(q.status);

            return (
              <tr key={q.id}
                className={`hover:bg-gray-50 transition-colors ${isExpired ? 'bg-red-50' : isDueSoon ? 'bg-yellow-50' : ''}`}>
                <td className="px-4 py-3">
                  <Link href={`/quotes/${q.id}`}
                    className="font-medium text-blue-600 hover:text-blue-800 hover:underline">
                    {q.quote_number}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900 truncate max-w-[140px]" title={q.client_name}>{q.client_name}</p>
                  {q.description && <p className="text-xs text-gray-400 truncate max-w-[140px]" title={q.description}>{q.description}</p>}
                </td>
                <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                  {q.assigned_user_name ?? <span className="text-gray-400 italic">Sin asignar</span>}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[q.status]}`}>
                    {STATUS_LABELS[q.status] ?? q.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_COLORS[q.priority]}`}>
                    {PRIORITY_LABELS[q.priority] ?? q.priority}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(q.received_date)}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className={isExpired ? 'font-semibold text-red-600' : 'text-gray-700'}>
                    {formatDate(q.deadline_date)}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {isExpired ? (
                    <span className="text-red-600 font-medium text-xs">
                      {Math.abs(q.days_remaining)}d vencida
                    </span>
                  ) : ['sent','cancelled','closed'].includes(q.status) ? (
                    <span className="text-gray-400 text-xs">—</span>
                  ) : (
                    <span className={`text-xs font-medium ${isDueSoon ? 'text-orange-600' : 'text-gray-600'}`}>
                      {q.days_remaining}d
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 min-w-[100px]">
                    <ProgressBar value={q.progress_percentage} size="sm" className="flex-1" />
                    <span className="text-xs text-gray-500 w-8 text-right">{Math.round(q.progress_percentage)}%</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Link href={`/quotes/${q.id}`}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                      Ver
                    </Link>
                    {canEdit && onDelete && (
                      <button onClick={() => { if (confirm('¿Eliminar esta cotización?')) onDelete(q.id); }}
                        className="text-xs text-red-500 hover:text-red-700 font-medium">
                        Eliminar
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
