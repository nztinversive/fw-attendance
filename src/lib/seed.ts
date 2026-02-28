import type Database from 'better-sqlite3';
import crypto from 'crypto';

export function seedDatabase(db: Database.Database) {
  const now = new Date();
  const today = now.toISOString().split('T')[0];

  const workers = [
    { id: crypto.randomUUID(), name: 'Marcus Johnson', department: 'Assembly' },
    { id: crypto.randomUUID(), name: 'Sarah Chen', department: 'Quality Control' },
    { id: crypto.randomUUID(), name: 'Diego Rivera', department: 'Welding' },
    { id: crypto.randomUUID(), name: 'Aisha Patel', department: 'Packaging' },
    { id: crypto.randomUUID(), name: 'Tommy Krueger', department: 'Assembly' },
  ];

  const kiosks = [
    { id: crypto.randomUUID(), name: 'Main Entry', type: 'entry', location: 'Building A Front' },
    { id: crypto.randomUUID(), name: 'Main Exit', type: 'exit', location: 'Building A Rear' },
  ];

  const insertWorker = db.prepare(
    'INSERT INTO workers (id, name, department, enrolled_at, active) VALUES (?, ?, ?, ?, 1)'
  );
  const insertKiosk = db.prepare(
    'INSERT INTO kiosks (id, name, type, location, active) VALUES (?, ?, ?, ?, 1)'
  );
  const insertAttendance = db.prepare(
    'INSERT INTO attendance (id, worker_id, event_type, kiosk_id, timestamp, synced) VALUES (?, ?, ?, ?, ?, 1)'
  );

  const tx = db.transaction(() => {
    for (const w of workers) {
      insertWorker.run(w.id, w.name, w.department, now.toISOString());
    }
    for (const k of kiosks) {
      insertKiosk.run(k.id, k.name, k.type, k.location);
    }

    // Sample attendance — first 3 workers clocked in, worker 3 also clocked out
    const entryKiosk = kiosks[0].id;
    const exitKiosk = kiosks[1].id;

    const clockInTimes = ['05:52', '06:01', '05:48'];
    for (let i = 0; i < 3; i++) {
      insertAttendance.run(
        crypto.randomUUID(),
        workers[i].id,
        'clock_in',
        entryKiosk,
        `${today}T${clockInTimes[i]}:00.000Z`,
      );
    }
    // Worker 3 (Diego) clocked out
    insertAttendance.run(
      crypto.randomUUID(),
      workers[2].id,
      'clock_out',
      exitKiosk,
      `${today}T12:30:00.000Z`,
    );
  });

  tx();
}
