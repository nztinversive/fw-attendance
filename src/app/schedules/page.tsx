'use client';

import { useEffect, useState, useCallback } from 'react';
import { Schedule } from '@/lib/types';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function SchedulesPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [startTime, setStartTime] = useState('06:00');
  const [endTime, setEndTime] = useState('14:30');
  const [department, setDepartment] = useState('');
  const [departments, setDepartments] = useState<string[]>([]);

  const fetchSchedules = useCallback(async () => {
    const res = await fetch('/api/schedules');
    setSchedules(await res.json());
  }, []);

  const fetchDepartments = useCallback(async () => {
    const res = await fetch('/api/workers');
    const workers = await res.json();
    const depts = [...new Set(workers.map((w: { department: string }) => w.department))] as string[];
    setDepartments(depts.filter(Boolean).sort());
  }, []);

  useEffect(() => { fetchSchedules(); fetchDepartments(); }, [fetchSchedules, fetchDepartments]);

  const toggleDay = (d: number) => {
    setDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort());
  };

  const resetForm = () => {
    setName('');
    setDays([1, 2, 3, 4, 5]);
    setStartTime('06:00');
    setEndTime('14:30');
    setDepartment('');
    setEditId(null);
    setShowForm(false);
  };

  const handleEdit = (s: Schedule) => {
    setEditId(s.id);
    setName(s.name);
    try { setDays(JSON.parse(s.days)); } catch { setDays([1, 2, 3, 4, 5]); }
    setStartTime(s.start_time);
    setEndTime(s.end_time);
    setDepartment(s.department || '');
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!name.trim() || days.length === 0) return;

    const body = { id: editId, name, days, start_time: startTime, end_time: endTime, department: department || null };

    if (editId) {
      await fetch('/api/schedules', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    } else {
      await fetch('/api/schedules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    }

    resetForm();
    fetchSchedules();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this schedule?')) return;
    await fetch(`/api/schedules?id=${id}`, { method: 'DELETE' });
    fetchSchedules();
  };

  const parseDays = (daysJson: string): string => {
    try {
      return (JSON.parse(daysJson) as number[]).map((d) => DAY_LABELS[d]).join(', ');
    } catch {
      return daysJson;
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">
          <span className="text-gold">📅</span> Schedules
        </h1>
        <button
          onClick={() => { resetForm(); setShowForm(!showForm); }}
          className="px-4 py-2 bg-gold/20 text-gold border border-gold/30 rounded-lg text-sm font-medium hover:bg-gold/30 transition-colors"
        >
          {showForm ? 'Cancel' : '+ New Schedule'}
        </button>
      </div>

      {showForm && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6 space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Schedule Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Default Mon-Fri"
              className="w-full px-3 py-2 bg-gray-950 border border-gray-800 rounded-lg text-sm focus:outline-none focus:border-gold/50"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-2">Days</label>
            <div className="flex gap-2">
              {DAY_LABELS.map((label, i) => (
                <button
                  key={i}
                  onClick={() => toggleDay(i)}
                  className={`w-10 h-10 rounded-lg text-xs font-medium transition-colors ${
                    days.includes(i)
                      ? 'bg-gold/20 text-gold border border-gold/40'
                      : 'bg-gray-950 text-gray-500 border border-gray-800 hover:border-gray-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Start Time</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-3 py-2 bg-gray-950 border border-gray-800 rounded-lg text-sm focus:outline-none focus:border-gold/50"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">End Time</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full px-3 py-2 bg-gray-950 border border-gray-800 rounded-lg text-sm focus:outline-none focus:border-gold/50"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Department (optional — blank = all)</label>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="w-full px-3 py-2 bg-gray-950 border border-gray-800 rounded-lg text-sm focus:outline-none focus:border-gold/50"
            >
              <option value="">All Departments</option>
              {departments.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          <button
            onClick={handleSubmit}
            disabled={!name.trim() || days.length === 0}
            className="px-5 py-2 bg-gold text-gray-950 rounded-lg text-sm font-semibold hover:bg-gold/90 transition-colors disabled:opacity-40"
          >
            {editId ? 'Update Schedule' : 'Create Schedule'}
          </button>
        </div>
      )}

      {schedules.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
          <p className="text-gray-500 text-sm">No schedules yet. Create one to enable daily attendance tracking.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {schedules.map((s) => (
            <div key={s.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center justify-between">
              <div>
                <div className="font-medium">{s.name}</div>
                <div className="text-sm text-gray-400 mt-1">
                  {parseDays(s.days)} · {s.start_time} – {s.end_time}
                  {s.department && <span className="ml-2 text-gold/70">({s.department})</span>}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleEdit(s)}
                  className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(s.id)}
                  className="px-3 py-1.5 text-xs bg-red-900/30 text-red-400 hover:bg-red-900/50 rounded-lg transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
