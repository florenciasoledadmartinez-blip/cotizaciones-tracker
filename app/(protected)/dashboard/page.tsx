import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getDashboardStats, getAllQuotes } from '@/lib/db';
import StatsCards from '@/components/dashboard/StatsCards';
import WorkloadChart from '@/components/dashboard/WorkloadChart';
import QuoteTable from '@/components/quotes/QuoteTable';
import { formatDateTime } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.role === 'operator') redirect('/quotes');

  const { stats, byUser, byStatus, byPriority, recentActivity } = await getDashboardStats();
  const expiredQuotes  = await getAllQuotes({ expiredOnly: true });
  const dueSoonQuotes  = await getAllQuotes({ dueSoonDays: 3 });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-0.5">Bienvenido/a, {user.name}</p>
      </div>

      <StatsCards stats={stats as any} />
      <WorkloadChart byUser={byUser as any[]} byStatus={byStatus as any[]} byPriority={byPriority as any[]} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {(expiredQuotes as any[]).length > 0 && (
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 bg-red-50 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <h2 className="font-semibold text-red-800">Vencidas ({(expiredQuotes as any[]).length})</h2>
            </div>
            <QuoteTable quotes={expiredQuotes as any[]} />
          </div>
        )}
        {(dueSoonQuotes as any[]).length > 0 && (
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 bg-yellow-50 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-yellow-500" />
              <h2 className="font-semibold text-yellow-800">Vencen en 3 días ({(dueSoonQuotes as any[]).length})</h2>
            </div>
            <QuoteTable quotes={dueSoonQuotes as any[]} />
          </div>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-800">Actividad reciente</h2>
        </div>
        <div className="divide-y divide-gray-100">
          {(recentActivity as any[]).length === 0 && (
            <p className="px-5 py-6 text-sm text-gray-400 text-center">Sin actividad reciente</p>
          )}
          {(recentActivity as any[]).map((log: any) => (
            <div key={log.id} className="px-5 py-3 flex items-center gap-3">
              <div className="w-7 h-7 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-blue-600">{(log.user_name ?? 'S')[0]}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-700">
                  <span className="font-medium">{log.user_name ?? 'Sistema'}</span>
                  {' · '}<span className="text-blue-600">{log.quote_number}</span>
                  {' — '}{log.action}
                </p>
                <p className="text-xs text-gray-400">{formatDateTime(log.created_at)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
