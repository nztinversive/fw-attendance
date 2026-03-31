'use client';

import { useEffect, useState, useCallback } from 'react';
import WebcamCapture from '@/components/WebcamCapture';
import { useToast } from '@/components/Toast';
import { Worker } from '@/lib/types';

export default function WorkersPage() {
  const { toast } = useToast();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [department, setDepartment] = useState('');
  const [photo, setPhoto] = useState('');

  const fetchWorkers = useCallback(async () => {
    try {
      const res = await fetch('/api/workers');
      if (!res.ok) throw new Error('Failed to fetch workers');
      setWorkers(await res.json());
    } catch (err) {
      console.error('Failed to fetch workers', err);
    }
  }, []);

  useEffect(() => { fetchWorkers(); }, [fetchWorkers]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast('Name is required', 'error');
      return;
    }

    try {
      if (editId) {
        await fetch('/api/workers', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editId, name, department, ...(photo ? { photo } : {}) }),
        });
        toast(`${name} updated successfully`);
      } else {
        await fetch('/api/workers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, department, ...(photo ? { photo } : {}) }),
        });
        toast(`${name} enrolled successfully`);
      }

      setName(''); setDepartment(''); setPhoto(''); setShowForm(false); setEditId(null);
      fetchWorkers();
    } catch {
      toast('Failed to save worker', 'error');
    }
  };

  const deactivate = async (id: string) => {
    if (!confirm('Deactivate this worker?')) return;
    try {
      await fetch(`/api/workers?id=${id}`, { method: 'DELETE' });
      toast('Worker deactivated');
      fetchWorkers();
    } catch {
      toast('Failed to deactivate worker', 'error');
    }
  };

  const startEdit = (w: Worker) => {
    setEditId(w.id); setName(w.name); setDepartment(w.department); setPhoto(''); setShowForm(true);
  };

  return (
    <div className="animate-fade-in">
      <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="page-title text-slate-100">
            Worker <span className="text-gold">Management</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1 font-mono">{workers.length} registered workers</p>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); setEditId(null); setName(''); setDepartment(''); setPhoto(''); }}
          className={showForm ? 'btn-secondary' : 'btn-primary flex items-center gap-2'}
        >
          {showForm ? 'Cancel' : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Add Worker
            </>
          )}
        </button>
      </div>

      {showForm && (
        <div className="glass-card p-6 mb-8 animate-slide-up">
          <h2 className="font-display font-semibold text-gold mb-4 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
            </svg>
            {editId ? 'Edit Worker' : 'New Worker'}
          </h2>
          <div className="space-y-4">
            <div>
              <label className="section-label mb-1.5 block">Full Name</label>
              <input
                placeholder="e.g. John Smith"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input-field"
              />
            </div>
            <div>
              <label className="section-label mb-1.5 block">Department</label>
              <input
                placeholder="e.g. Production, QC, Electrical"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="input-field"
              />
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="section-label mb-2 block">Upload Photo</label>
                <label className="flex items-center justify-center gap-2 px-4 py-8 border-2 border-dashed border-navy-600/50 rounded-xl cursor-pointer hover:border-gold/30 hover:bg-gold/[0.02] transition-all">
                  <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                  <span className="text-sm text-slate-400">Choose file or drag here</span>
                  <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                </label>
              </div>
              <div>
                <label className="section-label mb-2 block">Or Webcam</label>
                <WebcamCapture onCapture={setPhoto} />
              </div>
            </div>
            {photo && (
              <div className="flex items-center gap-3">
                <img src={photo} alt="Preview" className="w-16 h-16 rounded-xl object-cover border border-navy-600/50" />
                <span className="text-xs text-slate-500 font-mono">Photo captured</span>
              </div>
            )}
            <button onClick={handleSubmit} className="btn-primary">
              {editId ? 'Save Changes' : 'Enroll Worker'}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {workers.map((w, i) => (
          <div
            key={w.id}
            className={`glass-card-hover p-4 flex items-center gap-4 animate-fade-in stagger-${Math.min(i + 1, 6)}`}
          >
            <div className="w-11 h-11 rounded-xl bg-gold/10 border border-gold/15 flex items-center justify-center text-sm font-display font-bold text-gold shrink-0">
              {w.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-display font-medium text-sm text-slate-200">{w.name}</div>
              <div className="text-xs font-mono text-slate-500">{w.department || 'No department'}</div>
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={() => startEdit(w)} className="btn-ghost text-xs">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                </svg>
              </button>
              <button onClick={() => deactivate(w.id)} className="px-3 py-1.5 text-xs rounded-xl bg-red-400/5 border border-red-400/10 text-red-400 hover:bg-red-400/10 transition-all">
                Deactivate
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
