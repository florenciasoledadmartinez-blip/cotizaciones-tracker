'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import ProgressBar from '@/components/ui/ProgressBar';

interface Subtask {
  id: number;
  template_name: string;
  status: 'pending' | 'done' | 'not_applicable';
  completed_by_name?: string;
  completed_at?: string;
  observations?: string;
}
interface Task {
  id: number;
  template_name: string;
  template_description: string;
  progress_percentage: number;
  subtasks: Subtask[];
}

interface ChecklistPanelProps {
  quoteId: number;
  tasks: Task[];
  quoteStatus: string;
  canEdit: boolean;
}

export default function ChecklistPanel({ quoteId, tasks, quoteStatus, canEdit }: ChecklistPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [expandedTasks, setExpandedTasks] = useState<Set<number>>(new Set(tasks.map(t => t.id)));
  const [obsOpen, setObsOpen] = useState<number | null>(null);
  const [obsText, setObsText] = useState('');
  const [updating, setUpdating] = useState<number | null>(null);

  async function updateSubtask(subtaskId: number, status: string, observations?: string) {
    setUpdating(subtaskId);
    try {
      await fetch(`/api/quotes/${quoteId}/subtasks`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subtask_id: subtaskId, status, observations }),
      });
      startTransition(() => router.refresh());
    } finally {
      setUpdating(null);
    }
  }

  const toggleTask = (id: number) =>
    setExpandedTasks(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const totalApplicable = tasks.flatMap(t => t.subtasks).filter(s => s.status !== 'not_applicable').length;
  const totalDone = tasks.flatMap(t => t.subtasks).filter(s => s.status === 'done').length;
  const overallProgress = totalApplicable > 0 ? Math.round((totalDone / totalApplicable) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Overall progress */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-blue-800">Avance general</span>
          <span className="text-lg font-bold text-blue-700">{overallProgress}%</span>
        </div>
        <ProgressBar value={overallProgress} size="lg" />
        <p className="text-xs text-blue-600 mt-1.5">{totalDone} de {totalApplicable} subtareas completadas</p>
      </div>

      {/* Task list */}
      {tasks.map(task => {
        const applicableSubs = task.subtasks.filter(s => s.status !== 'not_applicable');
        const doneSubs = task.subtasks.filter(s => s.status === 'done');
        const isExpanded = expandedTasks.has(task.id);

        return (
          <div key={task.id} className="card overflow-hidden">
            {/* Task header */}
            <button
              onClick={() => toggleTask(task.id)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold
                ${task.progress_percentage === 100 ? 'bg-green-100 text-green-700' :
                  task.progress_percentage > 0 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                {task.progress_percentage === 100 ? '✓' : `${Math.round(task.progress_percentage)}%`}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 text-sm">{task.template_name}</p>
                <div className="flex items-center gap-2 mt-1">
                  <ProgressBar value={task.progress_percentage} size="sm" className="w-32" />
                  <span className="text-xs text-gray-500">{doneSubs.length}/{applicableSubs.length}</span>
                </div>
              </div>
              <svg className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Subtasks */}
            {isExpanded && (
              <div className="border-t border-gray-100">
                {task.subtasks.map(sub => (
                  <div key={sub.id}
                    className={`px-4 py-3 flex items-start gap-3 border-b border-gray-50 last:border-0
                      ${sub.status === 'not_applicable' ? 'opacity-50' : ''}`}>
                    {/* Checkbox */}
                    {canEdit ? (
                      <button
                        onClick={() => updateSubtask(sub.id, sub.status === 'done' ? 'pending' : 'done')}
                        disabled={sub.status === 'not_applicable' || updating === sub.id}
                        className={`w-5 h-5 rounded border-2 flex-shrink-0 mt-0.5 transition-colors
                          ${sub.status === 'done'
                            ? 'bg-green-500 border-green-500'
                            : sub.status === 'not_applicable'
                            ? 'bg-gray-200 border-gray-300'
                            : 'border-gray-300 hover:border-blue-500'
                          }`}
                      >
                        {sub.status === 'done' && (
                          <svg className="w-3 h-3 text-white mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                    ) : (
                      <div className={`w-5 h-5 rounded border-2 flex-shrink-0 mt-0.5 flex items-center justify-center
                        ${sub.status === 'done' ? 'bg-green-500 border-green-500' : 'border-gray-300'}`}>
                        {sub.status === 'done' && (
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${sub.status === 'done' ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                        {sub.template_name}
                      </p>
                      {sub.status === 'done' && sub.completed_by_name && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          ✓ {sub.completed_by_name} · {sub.completed_at?.substring(0, 10)}
                        </p>
                      )}
                      {sub.observations && (
                        <p className="text-xs text-blue-600 mt-0.5 italic">"{sub.observations}"</p>
                      )}

                      {/* Observation input */}
                      {canEdit && obsOpen === sub.id && (
                        <div className="mt-2 flex gap-2">
                          <input
                            className="input text-xs py-1.5 flex-1"
                            placeholder="Observación opcional..."
                            value={obsText}
                            onChange={e => setObsText(e.target.value)}
                          />
                          <button
                            className="btn-primary btn-sm"
                            onClick={() => {
                              updateSubtask(sub.id, sub.status, obsText);
                              setObsOpen(null);
                              setObsText('');
                            }}>
                            OK
                          </button>
                          <button className="btn-ghost btn-sm" onClick={() => setObsOpen(null)}>✕</button>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    {canEdit && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => { setObsOpen(obsOpen === sub.id ? null : sub.id); setObsText(sub.observations ?? ''); }}
                          className="p-1 text-gray-400 hover:text-blue-500 transition-colors"
                          title="Agregar observación">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => updateSubtask(sub.id, sub.status === 'not_applicable' ? 'pending' : 'not_applicable')}
                          className={`px-1.5 py-0.5 text-xs rounded font-medium transition-colors
                            ${sub.status === 'not_applicable'
                              ? 'bg-gray-200 text-gray-600'
                              : 'text-gray-400 hover:bg-gray-100'}`}
                          title="Marcar como No Aplica">
                          N/A
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
