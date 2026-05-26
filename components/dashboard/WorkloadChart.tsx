'use client';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import ProgressBar from '@/components/ui/ProgressBar';
import { STATUS_LABELS } from '@/lib/utils';

const STATUS_CHART_COLORS: Record<string, string> = {
  pending_assignment: '#9ca3af',
  assigned: '#60a5fa',
  in_progress: '#818cf8',
  in_review: '#fbbf24',
  sent: '#34d399',
  expired: '#f87171',
  cancelled: '#d1d5db',
  closed: '#10b981',
};

interface UserWorkload {
  id: number;
  name: string;
  total: number;
  active: number;
  expired: number;
  avg_progress: number;
}

interface Props {
  byUser: UserWorkload[];
  byStatus: { status: string; count: number }[];
  byPriority: { priority: string; count: number }[];
}

const PRIORITY_COLORS = ['#9ca3af', '#60a5fa', '#f97316', '#ef4444'];
const PRIORITY_LABELS_MAP: Record<string, string> = { low: 'Baja', medium: 'Media', high: 'Alta', urgent: 'Urgente' };

export default function WorkloadChart({ byUser, byStatus, byPriority }: Props) {
  const statusData = byStatus.map(s => ({ name: STATUS_LABELS[s.status] ?? s.status, value: s.count, color: STATUS_CHART_COLORS[s.status] ?? '#9ca3af' }));
  const priorityData = byPriority.map((p, i) => ({ name: PRIORITY_LABELS_MAP[p.priority] ?? p.priority, value: p.count }));

  return (
    <div className="space-y-6">
      {/* Workload by person */}
      <div className="card p-5">
        <h3 className="font-semibold text-gray-800 mb-4">Carga de trabajo por responsable</h3>
        <div className="space-y-3">
          {byUser.map(u => (
            <div key={u.id} className="flex items-center gap-4">
              <div className="w-28 flex-shrink-0">
                <p className="text-sm font-medium text-gray-700 truncate" title={u.name}>{u.name}</p>
                <p className="text-xs text-gray-400">{u.active} activas · {u.expired > 0 && <span className="text-red-500">{u.expired} venc.</span>}</p>
              </div>
              <ProgressBar value={u.avg_progress ?? 0} size="md" className="flex-1" />
              <div className="text-right flex-shrink-0 w-14">
                <p className="text-sm font-bold text-gray-700">{u.avg_progress ?? 0}%</p>
                <p className="text-xs text-gray-400">{u.total} total</p>
              </div>
            </div>
          ))}
          {byUser.length === 0 && <p className="text-sm text-gray-400 text-center py-4">Sin datos de responsables</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* By status */}
        <div className="card p-5">
          <h3 className="font-semibold text-gray-800 mb-4">Por estado</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}`}>
                {statusData.map((entry, index) => <Cell key={index} fill={entry.color} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* By priority */}
        <div className="card p-5">
          <h3 className="font-semibold text-gray-800 mb-4">Por prioridad</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={priorityData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" name="Cotizaciones" radius={[4, 4, 0, 0]}>
                {priorityData.map((_, i) => <Cell key={i} fill={PRIORITY_COLORS[i]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
