import { cn } from '@/lib/utils';

interface ProgressBarProps {
  value: number; // 0-100
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

export default function ProgressBar({ value, size = 'md', showLabel = false, className }: ProgressBarProps) {
  const clampedValue = Math.min(100, Math.max(0, value));

  const heightClass = { sm: 'h-1.5', md: 'h-2.5', lg: 'h-4' }[size];

  const colorClass =
    clampedValue === 100 ? 'bg-green-500' :
    clampedValue >= 60  ? 'bg-blue-500' :
    clampedValue >= 30  ? 'bg-yellow-500' :
    'bg-red-400';

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className={cn('flex-1 bg-gray-200 rounded-full overflow-hidden', heightClass)}>
        <div
          className={cn('h-full rounded-full transition-all duration-300', colorClass)}
          style={{ width: `${clampedValue}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-xs font-medium text-gray-600 w-10 text-right">{clampedValue}%</span>
      )}
    </div>
  );
}
