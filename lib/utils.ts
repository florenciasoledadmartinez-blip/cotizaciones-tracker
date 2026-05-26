import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, parseISO, differenceInDays, isValid } from 'date-fns';
import { es } from 'date-fns/locale';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateStr: string | null | undefined, fmt = 'dd/MM/yyyy'): string {
  if (!dateStr) return '-';
  try {
    const d = parseISO(dateStr);
    return isValid(d) ? format(d, fmt, { locale: es }) : '-';
  } catch {
    return '-';
  }
}

export function formatDateTime(dateStr: string | null | undefined): string {
  return formatDate(dateStr, 'dd/MM/yyyy HH:mm');
}

export function daysRemaining(deadline: string): number {
  try {
    return differenceInDays(parseISO(deadline), new Date());
  } catch {
    return 0;
  }
}

export function isOverdue(deadline: string, actualSend?: string | null): boolean {
  if (actualSend) return false;
  return daysRemaining(deadline) < 0;
}

export const STATUS_LABELS: Record<string, string> = {
  pending_assignment: 'Pendiente de asignación',
  assigned: 'Asignada',
  in_progress: 'En proceso',
  in_review: 'En revisión',
  sent: 'Enviada al cliente',
  expired: 'Vencida',
  cancelled: 'Cancelada',
  closed: 'Cerrada',
};

export const STATUS_COLORS: Record<string, string> = {
  pending_assignment: 'bg-gray-100 text-gray-700',
  assigned: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-indigo-100 text-indigo-700',
  in_review: 'bg-yellow-100 text-yellow-700',
  sent: 'bg-green-100 text-green-700',
  expired: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-500',
  closed: 'bg-emerald-100 text-emerald-700',
};

export const PRIORITY_LABELS: Record<string, string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
  urgent: 'Urgente',
};

export const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-gray-100 text-gray-600',
  medium: 'bg-blue-100 text-blue-600',
  high: 'bg-orange-100 text-orange-600',
  urgent: 'bg-red-100 text-red-600',
};

export const GANTT_STATUS_COLORS: Record<string, string> = {
  pending_assignment: '#9ca3af',
  assigned: '#60a5fa',
  in_progress: '#818cf8',
  in_review: '#fbbf24',
  sent: '#34d399',
  expired: '#f87171',
  cancelled: '#d1d5db',
  closed: '#10b981',
};
