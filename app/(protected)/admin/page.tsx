'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Modal from '@/components/ui/Modal';

export default function AdminPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [tab, setTab] = useState<'users' | 'templates' | 'maintenance'>('users');
  const [fixLoading, setFixLoading] = useState(false);
  const [fixResult, setFixResult] = useState<any>(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // User form
  const [uName, setUName] = useState('');
  const [uEmail, setUEmail] = useState('');
  const [uPassword, setUPassword] = useState('');
  const [uRole, setURole] = useState('operator');
  const [uError, setUError] = useState('');
  const [uLoading, setULoading] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => {
      setCurrentUser(d.user);
      if (d.user?.role !== 'admin' && d.user?.role !== 'leader') router.push('/dashboard');
    });
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const [ur, tr] = await Promise.all([
      fetch('/api/users').then(r => r.json()),
      fetch('/api/task-templates').then(r => r.json()),
    ]);
    setUsers(ur.users ?? []);
    setTemplates(tr.templates ?? []);
    setLoading(false);
  }

  function openUserModal(user?: any) {
    setEditingUser(user ?? null);
    setUName(user?.name ?? '');
    setUEmail(user?.email ?? '');
    setUPassword('');
    setURole(user?.role ?? 'operator');
    setUError('');
    setShowUserModal(true);
  }

  async function handleSaveUser(e: React.FormEvent) {
    e.preventDefault();
    setUError('');
    setULoading(true);
    try {
      const body: any = { name: uName, email: uEmail, role: uRole };
      if (uPassword) body.password = uPassword;
      let res;
      if (editingUser) {
        res = await fetch('/api/users', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, id: editingUser.id }) });
      } else {
        if (!uPassword) { setUError('La contraseña es requerida'); setULoading(false); return; }
        res = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      }
      const data = await res.json();
      if (!res.ok) { setUError(data.error || 'Error'); return; }
      setShowUserModal(false);
      loadData();
    } finally { setULoading(false); }
  }

  async function toggleUserActive(user: any) {
    await fetch('/api/users', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: user.id, active: !user.active }) });
    loadData();
  }

  async function handleFixSubtasks() {
    setFixLoading(true);
    setFixResult(null);
    try {
      const res = await fetch('/api/admin/fix-subtasks', { method: 'POST' });
      const data = await res.json();
      setFixResult(data);
    } catch (e: any) {
      setFixResult({ error: e.message });
    } finally {
      setFixLoading(false);
    }
  }

  async function toggleTemplate(t: any) {
    await fetch('/api/task-templates', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: t.id, active: !t.active }) });
    loadData();
  }

  const ROLE_LABELS: Record<string,string> = { admin:'Administrador', leader:'Administrador', operator:'Operativo' };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Administración</h1>
        <p className="text-gray-500 text-sm">Gestión de usuarios, tareas y configuración del sistema</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {[['users','Usuarios'],['templates','Tareas y Subtareas'],['maintenance','Mantenimiento']].map(([k,l]) => (
          <button key={k} onClick={() => setTab(k as any)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors
              ${tab === k ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {l}
          </button>
        ))}
      </div>

      {tab === 'users' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => openUserModal()} className="btn-primary">+ Nuevo usuario</button>
          </div>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Nombre','Email','Rol','Estado','Acciones'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{u.name}</td>
                    <td className="px-4 py-3 text-gray-500">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium
                        ${u.role === 'admin' || u.role === 'leader' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                        {ROLE_LABELS[u.role]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium
                        ${u.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {u.active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <button onClick={() => openUserModal(u)} className="text-xs text-blue-600 hover:underline">Editar</button>
                        <button onClick={() => toggleUserActive(u)} className="text-xs text-gray-500 hover:text-gray-700">
                          {u.active ? 'Desactivar' : 'Activar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'templates' && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
            Las tareas y subtareas aquí configuradas se aplican automáticamente a las nuevas cotizaciones. Los cambios NO afectan cotizaciones ya creadas.
          </div>
          {templates.map((t: any) => (
            <div key={t.id} className="card overflow-hidden">
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full ${t.active ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <h3 className="font-semibold text-gray-800">{t.name}</h3>
                  {t.description && <p className="text-xs text-gray-400">— {t.description}</p>}
                </div>
                <button onClick={() => toggleTemplate(t)}
                  className={`text-xs font-medium ${t.active ? 'text-red-500 hover:text-red-700' : 'text-green-600 hover:text-green-800'}`}>
                  {t.active ? 'Desactivar' : 'Activar'}
                </button>
              </div>
              <div className="divide-y divide-gray-100">
                {t.subtasks?.map((s: any) => (
                  <div key={s.id} className={`px-5 py-2.5 flex items-center gap-3 ${!s.active ? 'opacity-40' : ''}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-300 flex-shrink-0" />
                    <span className="text-sm text-gray-600">{s.name}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'maintenance' && (
        <div className="space-y-4 max-w-xl">
          <div className="card p-6">
            <h3 className="font-semibold text-gray-800 mb-1">Reparar subtareas faltantes</h3>
            <p className="text-sm text-gray-500 mb-4">
              En la importación inicial las subtareas no se crearon por un límite de PostgreSQL.
              Este botón detecta todas las cotizaciones con tareas pero sin subtareas, y las regenera
              de una vez. Es seguro ejecutarlo múltiples veces — solo toca las que realmente
              están incompletas.
            </p>
            <button
              onClick={handleFixSubtasks}
              disabled={fixLoading}
              className="btn-primary"
            >
              {fixLoading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Reparando... (puede tardar ~30 seg)
                </span>
              ) : '🔧 Reparar subtareas de todas las cotizaciones'}
            </button>

            {fixResult && (
              <div className={`mt-4 rounded-lg p-4 text-sm ${fixResult.error ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                {fixResult.error ? (
                  <p>❌ {fixResult.error}</p>
                ) : (
                  <>
                    <p className="font-semibold mb-1">✅ {fixResult.message}</p>
                    <p>{fixResult.fixed} cotizaciones reparadas</p>
                    {fixResult.fixed === 0 && (
                      <p className="text-green-600 mt-1">Todas las cotizaciones ya tienen sus subtareas completas.</p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* User Modal */}
      <Modal isOpen={showUserModal} onClose={() => setShowUserModal(false)}
        title={editingUser ? 'Editar usuario' : 'Nuevo usuario'} size="md">
        <form onSubmit={handleSaveUser} className="space-y-4">
          <div>
            <label className="label">Nombre completo</label>
            <input className="input" value={uName} onChange={e => setUName(e.target.value)} required />
          </div>
          <div>
            <label className="label">Email</label>
            <input type="email" className="input" value={uEmail} onChange={e => setUEmail(e.target.value)} required />
          </div>
          <div>
            <label className="label">{editingUser ? 'Nueva contraseña (dejar en blanco para no cambiar)' : 'Contraseña'}</label>
            <input type="password" className="input" value={uPassword} onChange={e => setUPassword(e.target.value)}
              required={!editingUser} placeholder={editingUser ? 'Sin cambios' : ''} />
          </div>
          <div>
            <label className="label">Rol</label>
            <select className="input" value={uRole} onChange={e => setURole(e.target.value)}>
              <option value="operator">Operativo</option>
              <option value="admin">Administrador</option>
            </select>
          </div>
          {uError && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{uError}</p>}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setShowUserModal(false)} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={uLoading} className="btn-primary">
              {uLoading ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
