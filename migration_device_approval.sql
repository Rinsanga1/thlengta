PRAGMA foreign_keys = ON;

-- 1) Add fingerprint + telemetry columns to employee_devices (safe if not exists is not supported in sqlite)
ALTER TABLE employee_devices ADD COLUMN fp_hash TEXT;
ALTER TABLE employee_devices ADD COLUMN fp_updated_at DATETIME;
ALTER TABLE employee_devices ADD COLUMN last_seen_at DATETIME;
ALTER TABLE employee_devices ADD COLUMN last_ip TEXT;
ALTER TABLE employee_devices ADD COLUMN last_user_agent TEXT;

-- 2) Add approval audit trail columns to attendance_logs
ALTER TABLE attendance_logs ADD COLUMN approved_at DATETIME;
ALTER TABLE attendance_logs ADD COLUMN approved_by_admin_id INTEGER;
ALTER TABLE attendance_logs ADD COLUMN approved_by_manager_id INTEGER;
ALTER TABLE attendance_logs ADD COLUMN approval_note TEXT;
ALTER TABLE attendance_logs ADD COLUMN original_log_id INTEGER;

-- 3) Create device approval requests table
CREATE TABLE IF NOT EXISTS device_approval_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL,
  employee_id INTEGER NOT NULL,
  requested_device_token_hash TEXT NOT NULL,
  requested_fp_hash TEXT,
  attempted_event_type TEXT NOT NULL DEFAULT 'checkin',
  attempted_lat REAL,
  attempted_lng REAL,
  attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  denied_log_id INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  approved_at DATETIME,
  approved_by_admin_id INTEGER,
  approved_by_manager_id INTEGER,
  note TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_device_approval_status ON device_approval_requests(status);
CREATE INDEX IF NOT EXISTS idx_device_approval_store ON device_approval_requests(store_id);
CREATE INDEX IF NOT EXISTS idx_device_approval_employee ON device_approval_requests(employee_id);
