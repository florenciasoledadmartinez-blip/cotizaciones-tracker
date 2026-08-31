'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { RoleProvider, useSertecRole } from './RoleContext';
import { ROLES, ROLE_LABELS } from '@/lib/sertec-utils';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/sertec/facturas', label: 'Facturas' },
  { href: '/sertec/prestaciones', label: 'Certificación de prestación' },
  { href: '/sertec/excepciones', label: 'Excepciones' },
  { href: '/sertec/gerencia', label: 'Autorización (Gerencia)' },
  { href: '/sertec/tesoreria', label: 'Tesorería' },
  { href: '/sertec/proveedores', label: 'Proveedores y servicios' },
  { href: '/sertec/instructivo', label: 'Instructivo' },
];

function RoleSwitcher() {
  const { role, setRole } = useSertecRole();
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-400 whitespace-nowrap">Viendo como:</span>
      <select
        className="text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 bg-white font-medium text-gray-700"
        value={role}
        onChange={e => setRole(e.target.value as any)}
      >
        {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
      </select>
    </div>
  );
}

function ShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { role } = useSertecRole();

  return (
    <div className="min-h-screen">
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-6 pt-4 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">SERTEC — Cuentas a Pagar</h1>
            <p className="text-gray-500 text-xs">Circuito de aprobación de facturas de servicio (sin IRL ni OC)</p>
          </div>
          <RoleSwitcher />
        </div>
        <nav className="px-6 mt-3 flex gap-1 overflow-x-auto">
          {NAV.map(item => (
            <Link key={item.href} href={item.href}
              className={cn(
                'px-3.5 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors',
                pathname === item.href
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              )}>
              {item.label}
            </Link>
          ))}
          {role === 'administrador' && (
            <Link href="/sertec/admin"
              className={cn(
                'px-3.5 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors',
                pathname === '/sertec/admin'
                  ? 'border-red-500 text-red-600'
                  : 'border-transparent text-red-500/80 hover:text-red-600 hover:border-red-200'
              )}>
              Importar / reiniciar base
            </Link>
          )}
        </nav>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

export default function SertecShell({ children }: { children: React.ReactNode }) {
  return (
    <RoleProvider>
      <ShellInner>{children}</ShellInner>
    </RoleProvider>
  );
}
