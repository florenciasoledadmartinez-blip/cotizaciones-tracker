'use client';
import { useState } from 'react';

interface User { id: number; name: string; }
interface QuoteFormProps {
  users: User[];
  initialData?: any;
  onSuccess: (quote: any) => void;
  onCancel: () => void;
}

const TYPES = ['Equipamiento', 'Servicio', 'Instalación', 'Repuestos', 'Consultoría', 'Otro'];
const PRIORITIES = [
  { value: 'low', label: 'Baja' },
  { value: 'medium', label: 'Media' },
  { value: 'high', label: 'Alta' },
  { value: 'urgent', label: 'Urgente' },
];

export default function QuoteForm({ users, initialData, onSuccess, onCancel }: QuoteFormProps) {
  const [form, setForm] = useState({
    quote_number: initialData?.quote_number ?? '',
    client_name: initialData?.client_name ?? '',
    description: initialData?.description ?? '',
    quote_type: initialData?.quote_type ?? '',
    received_date: initialData?.received_date ?? new Date().toISOString().split('T')[0],
    deadline_date: initialData?.deadline_date ?? '',
    estimated_send_date: initialData?.estimated_send_date ?? '',
    actual_send_date: initialData?.actual_send_date ?? '',
    assigned_user_id: initialData?.assigned_user_id ?? '',
    priority: initialData?.priority ?? 'medium',
    observations: initialData?.observations ?? '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const url = initialData ? `/api/quotes/${initialData.id}` : '/api/quotes';
      const method = initialData ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, assigned_user_id: form.assigned_user_id || null }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Error al guardar'); return; }
      onSuccess(data.quote);
    } catch {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Número de cotización *</label>
          <input className="input" value={form.quote_number} onChange={e => set('quote_number', e.target.value)}
            placeholder="COT-2024-XXX" required />
        </div>
        <div>
          <label className="label">Tipo de cotización</label>
          <select className="input" value={form.quote_type} onChange={e => set('quote_type', e.target.value)}>
            <option value="">Seleccionar...</option>
            {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="label">Cliente *</label>
        <input className="input" value={form.client_name} onChange={e => set('client_name', e.target.value)}
          placeholder="Nombre del cliente" required />
      </div>

      <div>
        <label className="label">Descripción</label>
        <textarea className="input resize-none" rows={2} value={form.description}
          onChange={e => set('description', e.target.value)} placeholder="Descripción breve de lo que se cotiza" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Fecha de recepción *</label>
          <input type="date" className="input" value={form.received_date}
            onChange={e => set('received_date', e.target.value)} required />
        </div>
        <div>
          <label className="label">Deadline *</label>
          <input type="date" className="input" value={form.deadline_date}
            onChange={e => set('deadline_date', e.target.value)} required />
        </div>
        <div>
          <label className="label">Fecha estimada de envío</label>
          <input type="date" className="input" value={form.estimated_send_date}
            onChange={e => set('estimated_send_date', e.target.value)} />
        </div>
        <div>
          <label className="label">Fecha real de envío</label>
          <input type="date" className="input" value={form.actual_send_date}
            onChange={e => set('actual_send_date', e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Responsable asignado</label>
          <select className="input" value={form.assigned_user_id}
            onChange={e => set('assigned_user_id', e.target.value)}>
            <option value="">Sin asignar</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Prioridad</label>
          <select className="input" value={form.priority} onChange={e => set('priority', e.target.value)}>
            {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="label">Observaciones</label>
        <textarea className="input resize-none" rows={2} value={form.observations}
          onChange={e => set('observations', e.target.value)} placeholder="Notas adicionales..." />
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="btn-secondary">Cancelar</button>
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? 'Guardando...' : (initialData ? 'Guardar cambios' : 'Crear cotización')}
        </button>
      </div>
    </form>
  );
}
