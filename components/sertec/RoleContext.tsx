'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import type { SertecRole } from '@/lib/sertec-utils';

const STORAGE_KEY = 'sertecRole';

interface RoleContextValue {
  role: SertecRole;
  setRole: (r: SertecRole) => void;
}

const RoleContext = createContext<RoleContextValue>({ role: 'pago_a_proveedores', setRole: () => {} });

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRoleState] = useState<SertecRole>('pago_a_proveedores');

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY) as SertecRole | null;
    if (saved) setRoleState(saved);
  }, []);

  function setRole(r: SertecRole) {
    setRoleState(r);
    window.localStorage.setItem(STORAGE_KEY, r);
  }

  return <RoleContext.Provider value={{ role, setRole }}>{children}</RoleContext.Provider>;
}

export function useSertecRole() {
  return useContext(RoleContext);
}
