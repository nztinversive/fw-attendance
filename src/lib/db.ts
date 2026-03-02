import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { seedDatabase } from './seed';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'attendance.db');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  // Create tables
  _db.exec(`
    CREATE TABLE IF NOT EXISTS workers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      department TEXT DEFAULT '',
      photo_url TEXT,
      face_encoding TEXT,
      enrolled_at TEXT NOT NULL,
      active INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS attendance (
      id TEXT PRIMARY KEY,
      worker_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      kiosk_id TEXT,
      timestamp TEXT NOT NULL,
      synced INTEGER DEFAULT 0,
      worker_name TEXT DEFAULT '',
      confidence REAL DEFAULT 0.0,
      liveness_confirmed INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS kiosks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      location TEXT DEFAULT '',
      last_sync TEXT,
      active INTEGER DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_attendance_worker ON attendance(worker_id);
    CREATE INDEX IF NOT EXISTS idx_attendance_timestamp ON attendance(timestamp);
  `);

  // Seed if empty
  const count = (_db.prepare('SELECT COUNT(*) as c FROM workers').get() as { c: number }).c;
  if (count === 0) seedDatabase(_db);

  return _db;
}
