export interface Worker {
  id: string;
  name: string;
  department: string;
  photo_url: string | null;
  face_encoding: string | null;
  enrolled_at: string;
  active: number;
}

export interface AttendanceEvent {
  id: string;
  worker_id: string;
  event_type: 'clock_in' | 'clock_out';
  kiosk_id: string | null;
  timestamp: string;
  synced: number;
}

export interface Kiosk {
  id: string;
  name: string;
  type: 'entry' | 'exit';
  location: string;
  last_sync: string | null;
  active: number;
}

export interface AttendanceWithWorker extends AttendanceEvent {
  worker_name: string;
  worker_department: string;
  kiosk_name?: string;
}

export interface DashboardStats {
  totalWorkers: number;
  clockedIn: number;
  clockedOut: number;
  notArrived: number;
}
