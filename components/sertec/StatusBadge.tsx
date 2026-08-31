import { INVOICE_STATUS_LABELS, INVOICE_STATUS_COLORS } from '@/lib/sertec-utils';

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${INVOICE_STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {INVOICE_STATUS_LABELS[status] ?? status}
    </span>
  );
}
