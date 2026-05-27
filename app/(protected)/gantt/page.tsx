'use client';
import GanttChart from '@/components/gantt/GanttChart';

export default function GanttPage() {
  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Pipeline de avance</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Seguimiento de etapas del checklist por cotización
        </p>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="w-7 h-5 rounded bg-green-100 flex items-center justify-center text-green-700 font-bold text-[11px]">✓</span>
          Etapa completada (100%)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-7 h-5 rounded bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-[11px]">%</span>
          En progreso (≥50%)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-7 h-5 rounded bg-amber-100 flex items-center justify-center text-amber-700 font-bold text-[11px]">%</span>
          Iniciada (&lt;50%)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-7 h-5 rounded bg-gray-100 flex items-center justify-center text-gray-400 font-bold text-[11px]">—</span>
          Sin iniciar
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-7 h-5 rounded bg-blue-100 ring-2 ring-blue-400 ring-offset-1 flex items-center justify-center text-blue-700 font-bold text-[11px]">→</span>
          Etapa actual (resaltada)
        </span>
      </div>

      <GanttChart />
    </div>
  );
}
