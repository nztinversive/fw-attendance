'use client';

import { useEffect, useState, useCallback } from 'react';
import { Kiosk } from '@/lib/types';

export default function KiosksPage() {
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
    if (!name.trim()) return alert('Name required');
    await fetch('/api/kiosks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, type, location }),
    });
    setName(''); setLocation(''); setShowForm(false);
    fetchKiosks();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold"><span className="text-gold">Kiosk</span> Management</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-gold hover:bg-gold-light text-black rounded-lg text-sm font-medium"
        >
          {showForm ? 'Cancel' : '+ Add Kiosk'}
        </button>
      </div>

      {showForm && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6 space-y-3">
          <input
            placeholder="Kiosk Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm focus:outline-none focus:border-gold/50"
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value as 'entry' | 'exit')}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm focus:outline-none focus:border-gold/50"
          >
            <option value="entry">Entry</option>
            <option value="exit">Exit</option>
          </select>
          <input
            placeholder="Location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm focus:outline-none focus:border-gold/50"
          />
          <button onClick={handleSubmit} className="px-4 py-2 bg-gold hover:bg-gold-light text-black rounded-lg text-sm font-medium">
            Register Kiosk
          </button>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {kiosks.map((k) => (
          <div key={k.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium">{k.name}</h3>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                k.type === 'entry' ? 'bg-green-400/10 text-green-400' : 'bg-orange-400/10 text-orange-400'
              }`}>
                {k.type === 'entry' ? '↓ Entry' : '↑ Exit'}
              </span>
            </div>
            <div className="text-xs text-gray-500">📍 {k.location || 'No location'}</div>
            <div className="text-xs text-gray-600 mt-1">
              Last sync: {k.last_sync ? new Date(k.last_sync).toLocaleString() : 'Never'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
