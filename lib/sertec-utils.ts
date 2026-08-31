export type SertecRole = 'solicitante' | 'compras' | 'pago_a_proveedores' | 'gerencia' | 'tesoreria' | 'administrador';

export const ROLE_LABELS: Record<SertecRole, string> = {
  solicitante: 'Solicitante',
  compras: 'Compras',
  pago_a_proveedores: 'Pago a Proveedores',
  gerencia: 'Gerencia',
  tesoreria: 'Tesorería',
  administrador: 'Administrador',
};

export const ROLES: SertecRole[] = ['solicitante', 'compras', 'pago_a_proveedores', 'gerencia', 'tesoreria', 'administrador'];

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  pendiente_prestacion: 'Pendiente de prestación',
  periodo_a_confirmar: 'Período a confirmar',
  conflicto_parcial: 'Conflicto — parcial',
  conflicto_no_cumplido: 'Conflicto — no prestado',
  conflicto_precio: 'Conflicto de precio',
  conflicto_presupuesto: 'Conflicto de presupuesto',
  lista_para_autorizar: 'Lista para autorizar',
  para_pagar: 'Para pagar',
  pagada: 'Pagada',
  rechazada: 'Rechazada',
};

export const INVOICE_STATUS_COLORS: Record<string, string> = {
  pendiente_prestacion: 'bg-gray-100 text-gray-700',
  periodo_a_confirmar: 'bg-amber-100 text-amber-700',
  conflicto_parcial: 'bg-orange-100 text-orange-700',
  conflicto_no_cumplido: 'bg-red-100 text-red-700',
  conflicto_precio: 'bg-orange-100 text-orange-700',
  conflicto_presupuesto: 'bg-red-100 text-red-700',
  lista_para_autorizar: 'bg-blue-100 text-blue-700',
  para_pagar: 'bg-indigo-100 text-indigo-700',
  pagada: 'bg-green-100 text-green-700',
  rechazada: 'bg-gray-200 text-gray-500',
};

export const CERTIFICATION_LABELS: Record<string, string> = {
  pendiente: 'Pendiente',
  cumplido: 'Cumplido',
  parcial: 'Parcial',
  no_cumplido: 'No cumplido',
};

export const CERTIFICATION_COLORS: Record<string, string> = {
  pendiente: 'bg-gray-100 text-gray-600',
  cumplido: 'bg-green-100 text-green-700',
  parcial: 'bg-orange-100 text-orange-700',
  no_cumplido: 'bg-red-100 text-red-700',
};

export const PERIODICITY_LABELS: Record<string, string> = {
  mensual: 'Mensual',
  quincenal: 'Quincenal',
  evento: 'Por evento',
};

export function formatCurrency(n: number | string | null | undefined): string {
  const v = Number(n ?? 0);
  return v.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
}

/** Colas que corresponden a cada rol simulado, usado para resaltar la navegación. */
export const ROLE_QUEUES: Record<SertecRole, string[]> = {
  solicitante: [],
  compras: ['conflicto_parcial'],
  pago_a_proveedores: ['pendiente_prestacion', 'periodo_a_confirmar', 'conflicto_precio', 'conflicto_presupuesto', 'conflicto_no_cumplido'],
  gerencia: ['lista_para_autorizar'],
  tesoreria: ['para_pagar'],
  administrador: [],
};
