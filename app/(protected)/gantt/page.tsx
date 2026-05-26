import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getAllQuotes } from '@/lib/db';
import GanttChart from '@/components/gantt/GanttChart';

export const dynamic = 'force-dynamic';

export default async function GanttPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.role === 'operator') redirect('/quotes');

  const all = await getAllQuotes();
  const activeQuotes = (all as any[]).filter(q => q.status !== 'cancelled');

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Línea de tiempo</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Visualización tipo Gantt — {activeQuotes.length} cotizaciones activas
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-400 inline-block" /> Recepción → Deadline</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-green-500 border-2 border-white shadow inline-block" /> Fecha real de envío</span>
        </div>
      </div>

      <GanttChart quotes={activeQuotes} />

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-800">Resumen por cotización</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Número','Cliente','Responsable','Recepción','Deadline','F. Estimada','F. Envío','Estado','Avance'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {activeQuotes.map((q: any) => (
                <tr key={q.id} className={`hover:bg-gray-50 ${q.status==='expired' ? 'bg-red-50' : ''}`}>
                  <td className="px-4 py-3"><a href={`/quotes/${q.id}`} className="font-medium text-blue-600 hover:underline">{q.quote_number}</a></td>
                  <td className="px-4 py-3 text-gray-700">{q.client_name}</td>
                  <td className="px-4 py-3 text-gray-500">{q.assigned_user_name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{q.received_date}</td>
                  <td className={`px-4 py-3 font-medium ${q.status==='expired' ? 'text-red-600' : 'text-gray-700'}`}>{q.deadline_date}</td>
                  <td className="px-4 py-3 text-gray-500">{q.estimated_send_date ?? '—'}</td>
                  <td className="px-4 py-3 text-green-600 font-medium">{q.actual_send_date ?? '—'}</td>
                  <td className="px-4 py-3 text-xs">{q.status.replace('_',' ')}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width:`${q.progress_percentage}%` }} />
                      </div>
                      <span className="text-xs text-gray-500">{Math.round(q.progress_percentage)}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
