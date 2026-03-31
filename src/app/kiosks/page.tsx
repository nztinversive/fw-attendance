'use client';

import { useEffect, useState, useCallback } from 'react';
import { Kiosk } from '@/lib/types';
import { useToast } from '@/components/Toast';

export default function KiosksPage() {
  const { toast } = useToast();
  const [kiosks, setKiosks] = useState<Kiosk[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<'entry' | 'exit'>('entry');
  const [location, setLocation] = useState('');

  const fetchKiosks = useCallback(async () => {
    try {
      const res = await fetch('/api/kiosks');
      if (!res.ok) throw new Error('Failed to fetch kiosks');
      setKiosks(await res.json());
    } catch (err) {
      console.error('Failed to fetch kiosks', err);
    }
  }, []);

  useEffect(() => { fetchKiosks(); }, [fetchKiosks]);

  const handleSubmit = async () => {
    if (!name.trim()) { toast('Kiosk name required', 'error'); return; }
    try {
      await fetch('/api/kiosks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type, location }),
      });
      toast(`Kiosk "${name}" registered`);
      setName(''); setLocation(''); setShowForm(false);
      fetchKiosks();
    } catch {
      toast('Failed to register kiosk', 'error');
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="page-title text-slate-100">
            Kiosk <span className="text-gold">Management</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1 font-mono">{kiosks.length} registered kiosks</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className={showForm ? 'btn-secondary' : 'btn-primary flex items-center gap-2'}
        >
          {showForm ? 'Cancel' : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Add Kiosk
            </>
          )}
        </button>
      </div>

      {showForm && (
        <div className="glass-card p-6 mb-8 space-y-4 animate-slide-up">
          <h2 className="font-display font-semibold text-gold flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
            </svg>
            Register New Kiosk
          </h2>
          <div>
            <label className="section-label mb-1.5 block">Kiosk Name</label>
            <input
              placeholder="e.g. Main Entrance Kiosk"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field"
            />
          </div>
          <div>
            <label className="section-label mb-1.5 block">Type</label>
            <div className="flex gap-3">
              <button
                onClick={() => setType('entry')}
                className={`flex-1 py-3 rounded-xl text-sm font-medium border transition-all ${
                  type === 'entry'
                    ? 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20'
                    : 'bg-navy-900/50 text-slate-400 border-navy-600/50 hover:border-slate-600'
                }`}
              >
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
                  </svg>
                  Entry
                </span>
              </button>
              <button
                onClick={() => setType('exit')}
                className={`flex-1 py-3 rounded-xl text-sm font-medium border transition-all ${
                  type === 'exit'
                    ? 'bg-amber-400/10 text-amber-400 border-amber-400/20'
                    : 'bg-navy-900/50 text-slate-400 border-navy-600/50 hover:border-slate-600'
                }`}
              >
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
                  </svg>
                  Exit
                </span>
              </button>
            </div>
          </div>
          <div>
            <label className="section-label mb-1.5 block">Location</label>
            <input
              placeholder="e.g. Building A, Front Gate"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="input-field"
            />
          </div>
          <button onClick={handleSubmit} className="btn-primary">Register Kiosk</button>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {kiosks.map((k, i) => (
          <div key={k.id} className={`glass-card-hover p-5 animate-fade-in stagger-${Math.min(i + 1, 6)}`}>
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
                  k.type === 'entry'
                    ? 'bg-emerald-400/10 border-emerald-400/20 text-emerald-400'
                    : 'bg-amber-400/10 border-amber-400/20 text-amber-400'
                }`}>
                  {k.type === 'entry' ? (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
                    </svg>
                  )}
                </div>
                <div>
                  <h3 className="font-display font-medium text-slate-200">{k.name}</h3>
                  <span className={`badge text-[10px] mt-1 border ${
                    k.type === 'entry'
                      ? 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20'
                      : 'bg-amber-400/10 text-amber-400 border-amber-400/20'
                  }`}>
                    {k.type === 'entry' ? 'Entry Point' : 'Exit Point'}
                  </span>
                </div>
              </div>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2 text-slate-400">
                <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                </svg>
                <span className="font-mono">{k.location || 'No location set'}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-500">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
                <span className="font-mono">
                  {k.last_sync ? `Synced ${new Date(k.last_sync).toLocaleString()}` : 'Never synced'}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
