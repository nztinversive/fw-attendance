'use client';

import { useEffect, useState, useCallback } from 'react';
import WebcamCapture from '@/components/WebcamCapture';
import { Worker } from '@/lib/types';

export default function WorkersPage() {
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
    if (!name.trim()) return alert('Name is required');

    if (editId) {
      await fetch('/api/workers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editId, name, department, ...(photo ? { photo } : {}) }),
      });
    } else {
      await fetch('/api/workers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, department, ...(photo ? { photo } : {}) }),
      });
    }

    setName(''); setDepartment(''); setPhoto(''); setShowForm(false); setEditId(null);
    fetchWorkers();
  };

  const deactivate = async (id: string) => {
    if (!confirm('Deactivate this worker?')) return;
    await fetch(`/api/workers?id=${id}`, { method: 'DELETE' });
    fetchWorkers();
  };

  const startEdit = (w: Worker) => {
    setEditId(w.id); setName(w.name); setDepartment(w.department); setPhoto(''); setShowForm(true);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold"><span className="text-gold">Worker</span> Management</h1>
        <button
          onClick={() => { setShowForm(!showForm); setEditId(null); setName(''); setDepartment(''); setPhoto(''); }}
          className="px-4 py-2 bg-gold hover:bg-gold-light text-black rounded-lg text-sm font-medium"
        >
          {showForm ? 'Cancel' : '+ Add Worker'}
        </button>
      </div>

      {showForm && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6 space-y-3">
          <h2 className="font-semibold text-gold">{editId ? 'Edit Worker' : 'New Worker'}</h2>
          <input
            placeholder="Full Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm focus:outline-none focus:border-gold/50"
          />
          <input
            placeholder="Department"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm focus:outline-none focus:border-gold/50"
          />
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Upload Photo</label>
              <input type="file" accept="image/*" onChange={handleFileUpload} className="text-sm text-gray-400" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Or Webcam</label>
              <WebcamCapture onCapture={setPhoto} />
            </div>
          </div>
          {photo && (
            <img src={photo} alt="Preview" className="w-20 h-20 rounded-lg object-cover" />
          )}
          <button onClick={handleSubmit} className="px-4 py-2 bg-gold hover:bg-gold-light text-black rounded-lg text-sm font-medium">
            {editId ? 'Save Changes' : 'Enroll Worker'}
          </button>
        </div>
      )}

      <div className="space-y-2">
        {workers.map((w) => (
          <div key={w.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-sm font-bold text-gold shrink-0">
              {w.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm">{w.name}</div>
              <div className="text-xs text-gray-500">{w.department || 'No department'}</div>
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={() => startEdit(w)} className="px-2 py-1 text-xs bg-gray-800 hover:bg-gray-700 rounded">Edit</button>
              <button onClick={() => deactivate(w.id)} className="px-2 py-1 text-xs bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded">Deactivate</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
