interface Stats {
  total: number;
  open: number;
  pending_assignment: number;
  in_progress: number;
  expired: number;
  sent: number;
  avg_progress: number;
  due_soon_3d: number;
  due_soon_7d: number;
}

function StatCard({ label, value, sub, color }: { label: string; value: any; sub?: string; color?: string }) {
  return (
    <div className="stat-card">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-3xl font-bold ${color || 'text-gray-900'}`}>{value ?? '—'}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

export default function StatsCards({ stats }: { stats: Stats }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
      <StatCard label="Total cotizaciones" value={stats.total} sub="Registradas en el sistema" />
      <StatCard label="Abiertas" value={stats.open} sub="Sin finalizar" color="text-blue-600" />
      <StatCard label="Sin asignar" value={stats.pending_assignment} sub="Esperan responsable"
        color={stats.pending_assignment > 0 ? 'text-orange-600' : 'text-gray-900'} />
      <StatCard label="En proceso" value={stats.in_progress} sub="En trabajo activo" color="text-indigo-600" />
      <StatCard label="Vencidas" value={stats.expired} sub="Superaron el deadline"
        color={stats.expired > 0 ? 'text-red-600' : 'text-gray-900'} />
      <StatCard label="Enviadas" value={stats.sent} sub="Completadas" color="text-green-600" />
      <StatCard label="Avance promedio" value={`${stats.avg_progress ?? 0}%`} sub="Cotizaciones abiertas" color="text-blue-600" />
      <StatCard label="Vencen en 3 días" value={stats.due_soon_3d}
        color={stats.due_soon_3d > 0 ? 'text-red-500' : 'text-gray-900'} />
      <StatCard label="Vencen en 7 días" value={stats.due_soon_7d}
        color={stats.due_soon_7d > 0 ? 'text-yellow-600' : 'text-gray-900'} />
    </div>
  );
}
