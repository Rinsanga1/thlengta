PRAGMA foreign_keys = ON;

-- =========================
-- PLAN LIMITS (Reference Table)
-- =========================
CREATE TABLE IF NOT EXISTS plan_limits (
  plan TEXT PRIMARY KEY,
  max_workplaces INTEGER NOT NULL,
  max_employees_per_workplace INTEGER NOT NULL,
  can_add_managers INTEGER NOT NULL DEFAULT 0,
  can_download_reports INTEGER NOT NULL DEFAULT 0,
  has_priority_support INTEGER NOT NULL DEFAULT 0,
  price_monthly INTEGER NOT NULL
);

INSERT INTO plan_limits VALUES
  ('free', 1, 2, 0, 0, 0, 0),
  ('plus', 1, 10, 0, 1, 0, 59900),
  ('pro', 20, 200, 1, 1, 1, 99900),
  ('enterprise', -1, -1, 1, 1, 1, 2999900);

-- =========================
-- USERS (Owners)
-- =========================
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  phone TEXT DEFAULT '',
  plan TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_plan ON users(plan);

-- =========================
-- WORKPLACES (Previously STORES)
-- =========================
CREATE TABLE IF NOT EXISTS workplaces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  public_id TEXT NOT NULL UNIQUE,

  lat REAL,
  lng REAL,
  radius_m INTEGER DEFAULT 100,
  address TEXT,

  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  open_time TEXT,
  close_time TEXT,
  grace_enabled INTEGER NOT NULL DEFAULT 0,
  grace_minutes INTEGER NOT NULL DEFAULT 10,

  logo_path TEXT,

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_workplaces_user_id ON workplaces(user_id);
CREATE INDEX IF NOT EXISTS idx_workplaces_public_id ON workplaces(public_id);

-- =========================
-- MANAGERS (Paid Plans Only)
-- =========================
CREATE TABLE IF NOT EXISTS managers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS manager_workplaces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  manager_id INTEGER NOT NULL,
  workplace_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(manager_id, workplace_id),
  FOREIGN KEY (manager_id) REFERENCES managers(id) ON DELETE CASCADE,
  FOREIGN KEY (workplace_id) REFERENCES workplaces(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_managers_user_id ON managers(user_id);
CREATE INDEX IF NOT EXISTS idx_managers_email ON managers(email);
CREATE INDEX IF NOT EXISTS idx_manager_workplaces_manager_id ON manager_workplaces(manager_id);
CREATE INDEX IF NOT EXISTS idx_manager_workplaces_workplace_id ON manager_workplaces(workplace_id);

-- =========================
-- EMPLOYEES
-- =========================
CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workplace_id INTEGER NOT NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  pin_hash TEXT NOT NULL,

  scheduled_start_time TEXT,
  scheduled_end_time TEXT,

  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(workplace_id, email),
  FOREIGN KEY (workplace_id) REFERENCES workplaces(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_employees_workplace_id ON employees(workplace_id);
CREATE INDEX IF NOT EXISTS idx_employees_email ON employees(email);
CREATE INDEX IF NOT EXISTS idx_employees_active ON employees(workplace_id, is_active);

-- =========================
-- EMPLOYEE DEVICES
-- =========================
CREATE TABLE IF NOT EXISTS employee_devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  device_token_hash TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,

  last_seen_at DATETIME,
  last_ip TEXT,
  last_user_agent TEXT,

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_employee_devices_employee_id ON employee_devices(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_devices_token ON employee_devices(device_token_hash);
CREATE INDEX IF NOT EXISTS idx_employee_devices_active ON employee_devices(employee_id, is_active);

-- =========================
-- QR TOKENS
-- =========================
CREATE TABLE IF NOT EXISTS qr_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workplace_id INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (workplace_id) REFERENCES workplaces(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_qr_tokens_workplace_id ON qr_tokens(workplace_id);
CREATE INDEX IF NOT EXISTS idx_qr_tokens_expires_at ON qr_tokens(expires_at);

-- =========================
-- ATTENDANCE LOGS
-- =========================
CREATE TABLE IF NOT EXISTS attendance_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workplace_id INTEGER NOT NULL,
  employee_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,

  device_verified INTEGER NOT NULL DEFAULT 0,
  location_verified INTEGER NOT NULL DEFAULT 0,

  lat REAL,
  lng REAL,

  ip TEXT,
  user_agent TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (workplace_id) REFERENCES workplaces(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_attendance_workplace_date ON attendance_logs(workplace_id, DATE(created_at));
CREATE INDEX IF NOT EXISTS idx_attendance_employee_date ON attendance_logs(employee_id, DATE(created_at));
CREATE INDEX IF NOT EXISTS idx_attendance_employee_event ON attendance_logs(employee_id, event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_attendance_workplace_time ON attendance_logs(workplace_id, created_at);

-- =========================
-- ATTENDANCE EDITS (Manual Corrections)
-- =========================
CREATE TABLE IF NOT EXISTS attendance_edits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  log_id INTEGER NOT NULL,

  edited_by_user_id INTEGER,
  edited_by_manager_id INTEGER,

  old_created_at DATETIME,
  new_created_at DATETIME,
  reason TEXT,

  edited_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (log_id) REFERENCES attendance_logs(id) ON DELETE CASCADE,
  FOREIGN KEY (edited_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (edited_by_manager_id) REFERENCES managers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_attendance_edits_log_id ON attendance_edits(log_id);

-- =========================
-- DEVICE APPROVAL REQUESTS
-- =========================
CREATE TABLE IF NOT EXISTS device_approval_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workplace_id INTEGER NOT NULL,
  employee_id INTEGER NOT NULL,

  requested_device_token_hash TEXT NOT NULL,

  attempted_event_type TEXT NOT NULL DEFAULT 'checkin',
  attempted_lat REAL,
  attempted_lng REAL,
  attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  status TEXT NOT NULL DEFAULT 'pending',
  approved_at DATETIME,
  approved_by_user_id INTEGER,
  approved_by_manager_id INTEGER,
  note TEXT,

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (workplace_id) REFERENCES workplaces(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (approved_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (approved_by_manager_id) REFERENCES managers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_device_approval_status ON device_approval_requests(status);
CREATE INDEX IF NOT EXISTS idx_device_approval_workplace ON device_approval_requests(workplace_id, status);
CREATE INDEX IF NOT EXISTS idx_device_approval_employee ON device_approval_requests(employee_id);

-- =========================
-- INVITATIONS (Future - Invite Flow)
-- =========================
CREATE TABLE IF NOT EXISTS invitations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workplace_id INTEGER NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL,

  invited_by_user_id INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,

  status TEXT NOT NULL DEFAULT 'pending',
  expires_at DATETIME NOT NULL,

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  accepted_at DATETIME,

  FOREIGN KEY (workplace_id) REFERENCES workplaces(id) ON DELETE CASCADE,
  FOREIGN KEY (invited_by_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_workplace_status ON invitations(workplace_id, status);
CREATE INDEX IF NOT EXISTS idx_invitations_expires ON invitations(expires_at);

-- =========================
-- UPGRADE REQUESTS
-- =========================
CREATE TABLE IF NOT EXISTS upgrade_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  from_plan TEXT NOT NULL,
  to_plan TEXT NOT NULL,

  status TEXT NOT NULL DEFAULT 'pending',

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME,
  resolved_by_superadmin_id INTEGER,
  note TEXT,

  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_upgrade_requests_status ON upgrade_requests(status);
CREATE INDEX IF NOT EXISTS idx_upgrade_requests_user_id ON upgrade_requests(user_id);

-- =========================
-- VIEWS
-- =========================
CREATE VIEW IF NOT EXISTS user_plan_usage AS
SELECT
  u.id as user_id,
  u.email,
  u.plan,
  COUNT(DISTINCT w.id) as workplaces_count,
  pl.max_workplaces,
  pl.max_employees_per_workplace,
  pl.can_add_managers,
  pl.can_download_reports
FROM users u
LEFT JOIN workplaces w ON w.user_id = u.id
JOIN plan_limits pl ON pl.plan = u.plan
GROUP BY u.id;

CREATE VIEW IF NOT EXISTS workplace_employee_counts AS
SELECT
  w.id as workplace_id,
  w.name as workplace_name,
  COUNT(CASE WHEN e.is_active = 1 THEN 1 END) as active_employees,
  COUNT(e.id) as total_employees,
  pl.max_employees_per_workplace
FROM workplaces w
JOIN users u ON w.user_id = u.id
JOIN plan_limits pl ON pl.plan = u.plan
LEFT JOIN employees e ON e.workplace_id = w.id
GROUP BY w.id;


-- =========================
-- SESSIONS (for express-session)
-- =========================
CREATE TABLE IF NOT EXISTS sessions (
  sid TEXT PRIMARY KEY,
  sess TEXT NOT NULL,
  expired INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_sessions_expired ON sessions(expired);
