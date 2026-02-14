PRAGMA foreign_keys = ON;

-- =========================
-- ADMINS + PLANS
-- =========================
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  name TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  address TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at DATETIME,
  plan TEXT DEFAULT 'standard',
  requested_plan TEXT DEFAULT 'standard'
);

CREATE TABLE IF NOT EXISTS super_admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS upgrade_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER NOT NULL,
  from_plan TEXT NOT NULL,
  to_plan TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME,
  resolved_by_superadmin_id INTEGER,
  note TEXT,
  FOREIGN KEY(admin_id) REFERENCES admins(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_upgrade_requests_status ON upgrade_requests(status);
CREATE INDEX IF NOT EXISTS idx_upgrade_requests_admin_id ON upgrade_requests(admin_id);

-- =========================
-- STORES
-- =========================
CREATE TABLE IF NOT EXISTS stores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  public_id TEXT NOT NULL UNIQUE, -- used in QR URL
  lat REAL,
  lng REAL,
  radius_m INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  -- Branding + punctuality rules
  open_time TEXT,
  close_time TEXT,
  grace_enabled INTEGER NOT NULL DEFAULT 0,
  grace_minutes INTEGER NOT NULL DEFAULT 10,
  logo_path TEXT,

  FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
);

-- =========================
-- MANAGERS
-- =========================
CREATE TABLE IF NOT EXISTS managers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS manager_stores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  manager_id INTEGER NOT NULL,
  store_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(manager_id, store_id),
  FOREIGN KEY (manager_id) REFERENCES managers(id) ON DELETE CASCADE,
  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
);

-- =========================
-- EMPLOYEES
-- =========================
CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL,
  email TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(store_id, email),
  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
);

-- =========================
-- EMPLOYEE DEVICES
-- =========================
CREATE TABLE IF NOT EXISTS employee_devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  device_token_hash TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  -- NEW: fingerprint + telemetry for recovery
  fp_hash TEXT,              -- sha256 of fingerprint fields
  fp_updated_at DATETIME,    -- when fp_hash was last updated
  last_seen_at DATETIME,     -- last successful scan
  last_ip TEXT,
  last_user_agent TEXT,

  -- IMPORTANT: enforce 1 device per employee
  UNIQUE(employee_id),

  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

-- =========================
-- QR TOKENS
-- =========================
CREATE TABLE IF NOT EXISTS qr_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
);

-- =========================
-- ATTENDANCE LOGS
-- =========================
CREATE TABLE IF NOT EXISTS attendance_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL,
  employee_id INTEGER,
  event_type TEXT NOT NULL,
  qr_token TEXT,
  device_ok INTEGER NOT NULL DEFAULT 0,
  gps_ok INTEGER NOT NULL DEFAULT 0,
  lat REAL,
  lng REAL,
  user_agent TEXT,
  ip TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  time_status TEXT,
  minutes_late INTEGER,

  -- NEW: approval audit trail
  approved_at DATETIME,
  approved_by_admin_id INTEGER,
  approved_by_manager_id INTEGER,
  approval_note TEXT,
  original_log_id INTEGER, -- if this log was created by approving another attempt

  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL,
  FOREIGN KEY (approved_by_admin_id) REFERENCES admins(id) ON DELETE SET NULL,
  FOREIGN KEY (approved_by_manager_id) REFERENCES managers(id) ON DELETE SET NULL,
  FOREIGN KEY (original_log_id) REFERENCES attendance_logs(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_attendance_store_time ON attendance_logs(store_id, created_at);
CREATE INDEX IF NOT EXISTS idx_attendance_employee_time ON attendance_logs(employee_id, created_at);

-- =========================
-- NEW: DEVICE APPROVAL REQUESTS
-- =========================
-- When an employee tries from a new device and fails fingerprint check,
-- we create a pending request. Approval will rebind the device and
-- optionally credit the attempt.
CREATE TABLE IF NOT EXISTS device_approval_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL,
  employee_id INTEGER NOT NULL,

  -- What the employee's browser sent
  requested_device_token_hash TEXT NOT NULL,
  requested_fp_hash TEXT,

  -- Attempt context (so you can credit the exact attempt)
  attempted_event_type TEXT NOT NULL DEFAULT 'checkin', -- checkin | break_start | break_end | checkout
  attempted_lat REAL,
  attempted_lng REAL,
  attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  denied_log_id INTEGER, -- attendance_logs row id for denied_device (optional)

  -- Status
  status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  approved_at DATETIME,
  approved_by_admin_id INTEGER,
  approved_by_manager_id INTEGER,
  note TEXT,

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (approved_by_admin_id) REFERENCES admins(id) ON DELETE SET NULL,
  FOREIGN KEY (approved_by_manager_id) REFERENCES managers(id) ON DELETE SET NULL,
  FOREIGN KEY (denied_log_id) REFERENCES attendance_logs(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_device_approval_status ON device_approval_requests(status);
CREATE INDEX IF NOT EXISTS idx_device_approval_store ON device_approval_requests(store_id);
CREATE INDEX IF NOT EXISTS idx_device_approval_employee ON device_approval_requests(employee_id);

-- =========================
-- USERS + ROLES (Discord-like)
-- =========================
CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  role_id INTEGER NOT NULL,
  store_id INTEGER,
  plan TEXT DEFAULT 'free',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, role_id, store_id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(role_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY(store_id) REFERENCES stores(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_store_id ON user_roles(store_id);
