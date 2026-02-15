# Thleng Ta! - Database Design Document

## Overview
This document defines the complete database schema for Thleng Ta!, a QR-based staff attendance system. The schema supports multi-tier plans (Free, Plus, Pro, Enterprise) with enforced limits, geofence verification, device management, and comprehensive audit trails.

---

## Tech Stack (Database Layer)
- **Database**: SQLite (bun:sqlite)
- **ORM**: None (raw SQL queries)
- **Migration**: schema.sql + manual migrations
- **Session Store**: Custom BunSqliteSessionStore

---

## Plan Tiers & Limits

| Plan | Price | Stores | Employees/Store | Managers | Reports |
|------|-------|--------|----------------|----------|---------|
| Free | ₹0/mo | 1 | 2 | ❌ | Basic |
| Plus | ₹599/mo | 1 | 10 | ❌ | Download |
| Pro | ₹999/mo | 20 | 200 | ✅ | Download + Priority |
| Enterprise | ₹29,999/mo | Unlimited | Unlimited | ✅ | Custom |

---

## Core Database Principles

### 1. **Plan Enforcement**
- Limits enforced at **application layer** before INSERT operations
- Use `plan_limits` table as single source of truth
- `-1` value = unlimited

### 2. **Data Retention**
- **NEVER** hard-delete attendance logs (compliance/payroll)
- Use `ON DELETE RESTRICT` for employees with logs
- Use `is_active` flags for soft deletes

### 3. **Timezone Handling**
- Store all timestamps in UTC (`DATETIME DEFAULT CURRENT_TIMESTAMP`)
- Store timezone per store for display/calculation
- Convert on query for late-arrival calculations

### 4. **Indexing Strategy**
- Index all foreign keys
- Composite indexes for date-range queries (store_id, date)
- Employee lookup indexes for 500+ employees/store

---

## Complete Schema

### 1. Users (Owners)
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  phone TEXT DEFAULT '',
  plan TEXT NOT NULL DEFAULT 'free', -- 'free', 'plus', 'pro', 'enterprise'
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'suspended'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_plan ON users(plan);
```

**Notes:**
- `plan` drives feature access and limits
- `status` for account suspension
- No roles table needed (overengineering removed)

---

### 2. Plan Limits (Reference Table)
```sql
CREATE TABLE plan_limits (
  plan TEXT PRIMARY KEY,
  max_stores INTEGER NOT NULL, -- -1 = unlimited
  max_employees_per_store INTEGER NOT NULL, -- -1 = unlimited
  can_add_managers INTEGER NOT NULL DEFAULT 0, -- 0 or 1
  can_download_reports INTEGER NOT NULL DEFAULT 0,
  has_priority_support INTEGER NOT NULL DEFAULT 0,
  price_monthly INTEGER NOT NULL -- in paise (₹599 = 59900)
);

INSERT INTO plan_limits VALUES
  ('free', 1, 2, 0, 0, 0, 0),
  ('plus', 1, 10, 0, 1, 0, 59900),
  ('pro', 20, 200, 1, 1, 1, 99900),
  ('enterprise', -1, -1, 1, 1, 1, 2999900);
```

**Usage in Application:**
```javascript
// Before creating store
const limits = await dbGet('SELECT max_stores FROM plan_limits WHERE plan = ?', [user.plan]);
const currentStores = await dbGet('SELECT COUNT(*) as count FROM stores WHERE user_id = ?', [userId]);
if (limits.max_stores !== -1 && currentStores.count >= limits.max_stores) {
  throw new Error('Store limit reached. Please upgrade your plan.');
}
```

---

### 3. Stores (Workplaces)
```sql
CREATE TABLE stores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  public_id TEXT NOT NULL UNIQUE, -- for QR codes, e.g., 'cafe-123abc'

  -- Geofence
  lat REAL,
  lng REAL,
  radius_m INTEGER DEFAULT 100, -- meters

  -- Business hours
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata', -- IANA timezone
  open_time TEXT, -- 'HH:MM' in store's local time, e.g., '09:00'
  close_time TEXT, -- 'HH:MM' in store's local time, e.g., '18:00'
  grace_enabled INTEGER NOT NULL DEFAULT 0,
  grace_minutes INTEGER NOT NULL DEFAULT 10,

  -- Branding
  logo_path TEXT,

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_stores_user_id ON stores(user_id);
CREATE INDEX idx_stores_public_id ON stores(public_id);
```

**Notes:**
- `timezone` critical for multi-location businesses
- `public_id` used in QR scan URLs: `/e/scan/:storePublicId`
- `radius_m` for geofence verification

---

### 4. Employees
```sql
CREATE TABLE employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  pin_hash TEXT NOT NULL, -- bcrypt hash of 4-6 digit PIN

  -- Scheduling (optional, overrides store hours)
  scheduled_start_time TEXT, -- 'HH:MM' e.g., '09:00'
  scheduled_end_time TEXT,   -- 'HH:MM' e.g., '17:00'

  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(store_id, email),
  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
);

CREATE INDEX idx_employees_store_id ON employees(store_id);
CREATE INDEX idx_employees_email ON employees(email);
CREATE INDEX idx_employees_active ON employees(store_id, is_active);
```

**Notes:**
- `name` added (was missing in original schema)
- `scheduled_start_time` for calculating late arrivals (falls back to `stores.open_time`)
- Soft delete with `is_active` to preserve attendance history
- **Deletion rule**: If employee has attendance logs, prevent deletion (enforce in app layer or trigger)

---

### 5. Employee Devices
```sql
CREATE TABLE employee_devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  device_token_hash TEXT NOT NULL UNIQUE, -- hash of browser fingerprint + user agent
  is_active INTEGER NOT NULL DEFAULT 1, -- for device revocation

  -- Telemetry
  last_seen_at DATETIME,
  last_ip TEXT,
  last_user_agent TEXT,

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE INDEX idx_employee_devices_employee_id ON employee_devices(employee_id);
CREATE INDEX idx_employee_devices_token ON employee_devices(device_token_hash);
CREATE INDEX idx_employee_devices_active ON employee_devices(employee_id, is_active);
```

**Notes:**
- Changed from `UNIQUE(employee_id)` to allow multiple devices per employee
- When approving new device, set old device's `is_active = 0`
- `device_token_hash` = hash of (fingerprint + user agent + random salt)

---

### 6. Managers (Paid Plans Only)
```sql
CREATE TABLE managers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL, -- owner who created this manager
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE manager_stores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  manager_id INTEGER NOT NULL,
  store_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(manager_id, store_id),
  FOREIGN KEY (manager_id) REFERENCES managers(id) ON DELETE CASCADE,
  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
);

CREATE INDEX idx_managers_user_id ON managers(user_id);
CREATE INDEX idx_manager_stores_manager_id ON manager_stores(manager_id);
CREATE INDEX idx_manager_stores_store_id ON manager_stores(store_id);
```

**Application Validation:**
```javascript
// Before creating manager, check plan
const user = await dbGet('SELECT plan FROM users WHERE id = ?', [userId]);
const limits = await dbGet('SELECT can_add_managers FROM plan_limits WHERE plan = ?', [user.plan]);
if (!limits.can_add_managers) {
  throw new Error('Managers are only available on Pro and Enterprise plans');
}
```

---

### 7. QR Tokens
```sql
CREATE TABLE qr_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE, -- random UUID or similar
  expires_at DATETIME NOT NULL, -- typically NOW() + 5 minutes
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
);

CREATE INDEX idx_qr_tokens_store_id ON qr_tokens(store_id);
CREATE INDEX idx_qr_tokens_expires_at ON qr_tokens(expires_at);
```

**Notes:**
- Tokens rotate every 5 minutes for security
- Cleanup expired tokens periodically: `DELETE FROM qr_tokens WHERE expires_at < CURRENT_TIMESTAMP`
- Don't store token in `attendance_logs` (not needed after verification)

---

### 8. Attendance Logs (Simplified)
```sql
CREATE TABLE attendance_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL,
  employee_id INTEGER NOT NULL,
  event_type TEXT NOT NULL, -- 'checkin' or 'checkout'

  -- Verification results (computed at check-in time)
  device_verified INTEGER NOT NULL DEFAULT 0, -- 1 if device matches
  location_verified INTEGER NOT NULL DEFAULT 0, -- 1 if within geofence

  -- Location data
  lat REAL,
  lng REAL,

  -- Metadata
  ip TEXT,
  user_agent TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP, -- in UTC

  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT -- prevent if logs exist
);

CREATE INDEX idx_attendance_store_date ON attendance_logs(store_id, DATE(created_at));
CREATE INDEX idx_attendance_employee_date ON attendance_logs(employee_id, DATE(created_at));
CREATE INDEX idx_attendance_employee_event ON attendance_logs(employee_id, event_type, created_at);
CREATE INDEX idx_attendance_store_time ON attendance_logs(store_id, created_at);
```

**Key Changes:**
- Removed `time_status`, `minutes_late` (calculate on query)
- Removed `qr_token` (not needed after verification)
- Removed approval fields (moved to separate table)
- `ON DELETE RESTRICT` prevents deleting employees with attendance history

**Calculate Late Arrivals on Query:**
```sql
SELECT
  e.name,
  a.created_at,
  TIME(a.created_at, s.timezone) as check_in_time_local,
  COALESCE(e.scheduled_start_time, s.open_time) as expected_time,
  CASE
    WHEN TIME(a.created_at, s.timezone) > TIME(COALESCE(e.scheduled_start_time, s.open_time), '+' || s.grace_minutes || ' minutes')
    THEN 'late'
    ELSE 'on_time'
  END as status,
  CAST((julianday(TIME(a.created_at, s.timezone)) - julianday(TIME(COALESCE(e.scheduled_start_time, s.open_time)))) * 1440 AS INTEGER) as minutes_diff
FROM attendance_logs a
JOIN employees e ON a.employee_id = e.id
JOIN stores s ON a.store_id = s.id
WHERE a.event_type = 'checkin'
  AND a.store_id = ?
  AND DATE(a.created_at) = DATE('now');
```

---

### 9. Attendance Edits (Manual Corrections)
```sql
CREATE TABLE attendance_edits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  log_id INTEGER NOT NULL,

  -- Who made the edit
  edited_by_user_id INTEGER, -- owner
  edited_by_manager_id INTEGER, -- or manager

  -- What changed
  old_created_at DATETIME,
  new_created_at DATETIME,
  reason TEXT,

  edited_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (log_id) REFERENCES attendance_logs(id) ON DELETE CASCADE,
  FOREIGN KEY (edited_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (edited_by_manager_id) REFERENCES managers(id) ON DELETE SET NULL
);

CREATE INDEX idx_attendance_edits_log_id ON attendance_edits(log_id);
```

**Notes:**
- Separate table for audit trail
- When editing attendance, UPDATE `attendance_logs.created_at`, INSERT into `attendance_edits`
- Preserves full edit history

---

### 10. Device Approval Requests
```sql
CREATE TABLE device_approval_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL,
  employee_id INTEGER NOT NULL,

  -- New device details
  requested_device_token_hash TEXT NOT NULL,

  -- Context of the request
  attempted_event_type TEXT NOT NULL DEFAULT 'checkin',
  attempted_lat REAL,
  attempted_lng REAL,
  attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  -- Approval workflow
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
  approved_at DATETIME,
  approved_by_user_id INTEGER,
  approved_by_manager_id INTEGER,
  note TEXT,

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (approved_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (approved_by_manager_id) REFERENCES managers(id) ON DELETE SET NULL
);

CREATE INDEX idx_device_approval_status ON device_approval_requests(status);
CREATE INDEX idx_device_approval_store ON device_approval_requests(store_id, status);
CREATE INDEX idx_device_approval_employee ON device_approval_requests(employee_id);
```

**Workflow:**
1. Employee tries to check in from new device
2. Device hash doesn't match → create `device_approval_request` with status='pending'
3. Owner/manager sees pending request in dashboard
4. On approval:
   - Set old device `is_active = 0` in `employee_devices`
   - INSERT new device into `employee_devices`
   - UPDATE request status='approved'

---

### 11. Invitations (Employee/Manager Onboarding)
```sql
CREATE TABLE invitations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL, -- 'employee' or 'manager'

  invited_by_user_id INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE, -- UUID for invitation link

  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'accepted', 'expired'
  expires_at DATETIME NOT NULL, -- typically NOW() + 7 days

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  accepted_at DATETIME,

  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
  FOREIGN KEY (invited_by_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_invitations_token ON invitations(token);
CREATE INDEX idx_invitations_store_status ON invitations(store_id, status);
CREATE INDEX idx_invitations_expires ON invitations(expires_at);
```

**Workflow:**
1. Owner enters email → INSERT into `invitations` with unique token
2. Send email: `https://thlengta.com/invite/:token`
3. Employee clicks link → verify token not expired
4. Employee sets PIN → INSERT into `employees`, UPDATE invitation status='accepted'

---

### 12. Upgrade Requests
```sql
CREATE TABLE upgrade_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  from_plan TEXT NOT NULL,
  to_plan TEXT NOT NULL,

  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected'

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME,
  resolved_by_superadmin_id INTEGER, -- if you have superadmin table
  note TEXT,

  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_upgrade_requests_status ON upgrade_requests(status);
CREATE INDEX idx_upgrade_requests_user_id ON upgrade_requests(user_id);
```

---

## Helper Views for Application

### View 1: User Plan Usage
```sql
CREATE VIEW user_plan_usage AS
SELECT
  u.id as user_id,
  u.email,
  u.plan,
  COUNT(DISTINCT s.id) as stores_count,
  pl.max_stores,
  pl.max_employees_per_store,
  pl.can_add_managers,
  pl.can_download_reports
FROM users u
LEFT JOIN stores s ON s.user_id = u.id
JOIN plan_limits pl ON pl.plan = u.plan
GROUP BY u.id;
```

**Usage:**
```javascript
const usage = await dbGet('SELECT * FROM user_plan_usage WHERE user_id = ?', [userId]);
if (usage.stores_count >= usage.max_stores && usage.max_stores !== -1) {
  // Show upgrade prompt
}
```

### View 2: Store Employee Count
```sql
CREATE VIEW store_employee_counts AS
SELECT
  s.id as store_id,
  s.name as store_name,
  COUNT(CASE WHEN e.is_active = 1 THEN 1 END) as active_employees,
  COUNT(e.id) as total_employees,
  pl.max_employees_per_store
FROM stores s
JOIN users u ON s.user_id = u.id
JOIN plan_limits pl ON pl.plan = u.plan
LEFT JOIN employees e ON e.store_id = s.id
GROUP BY s.id;
```

---

## Critical Queries for 500+ Employees

### Query 1: Daily Attendance Report
```sql
SELECT
  e.id,
  e.name,
  e.email,
  MIN(CASE WHEN a.event_type = 'checkin' THEN a.created_at END) as first_checkin,
  MAX(CASE WHEN a.event_type = 'checkout' THEN a.created_at END) as last_checkout,
  COUNT(CASE WHEN a.event_type = 'checkin' THEN 1 END) as checkin_count,
  COUNT(CASE WHEN a.event_type = 'checkout' THEN 1 END) as checkout_count
FROM employees e
LEFT JOIN attendance_logs a ON e.id = a.employee_id
  AND DATE(a.created_at) = DATE('now')
WHERE e.store_id = ? AND e.is_active = 1
GROUP BY e.id
ORDER BY e.name;
```

### Query 2: Late Arrivals This Week
```sql
SELECT
  e.name,
  DATE(a.created_at) as date,
  TIME(a.created_at, s.timezone) as actual_time,
  COALESCE(e.scheduled_start_time, s.open_time) as expected_time,
  CAST((julianday(TIME(a.created_at, s.timezone)) - julianday(TIME(COALESCE(e.scheduled_start_time, s.open_time)))) * 1440 AS INTEGER) as minutes_late
FROM attendance_logs a
JOIN employees e ON a.employee_id = e.id
JOIN stores s ON a.store_id = s.id
WHERE a.event_type = 'checkin'
  AND a.store_id = ?
  AND DATE(a.created_at) >= DATE('now', '-7 days')
  AND TIME(a.created_at, s.timezone) > TIME(COALESCE(e.scheduled_start_time, s.open_time), '+' || s.grace_minutes || ' minutes')
ORDER BY a.created_at DESC;
```

### Query 3: Employee Attendance History (for CSV export)
```sql
SELECT
  DATE(a.created_at) as date,
  e.name,
  e.email,
  MIN(CASE WHEN a.event_type = 'checkin' THEN TIME(a.created_at, s.timezone) END) as checkin_time,
  MAX(CASE WHEN a.event_type = 'checkout' THEN TIME(a.created_at, s.timezone) END) as checkout_time,
  CASE
    WHEN MIN(CASE WHEN a.event_type = 'checkin' THEN a.location_verified END) = 1 THEN 'Verified'
    ELSE 'Unverified'
  END as location_status
FROM attendance_logs a
JOIN employees e ON a.employee_id = e.id
JOIN stores s ON a.store_id = s.id
WHERE a.store_id = ?
  AND DATE(a.created_at) BETWEEN ? AND ?
GROUP BY DATE(a.created_at), e.id
ORDER BY DATE(a.created_at) DESC, e.name;
```

---

## Application Layer Validations

### Before INSERT/UPDATE Operations

#### Adding a Store
```javascript
async function canAddStore(userId) {
  const user = await dbGet('SELECT plan FROM users WHERE id = ?', [userId]);
  const limits = await dbGet('SELECT max_stores FROM plan_limits WHERE plan = ?', [user.plan]);
  const current = await dbGet('SELECT COUNT(*) as count FROM stores WHERE user_id = ?', [userId]);

  if (limits.max_stores !== -1 && current.count >= limits.max_stores) {
    return { allowed: false, reason: `Plan limit: ${user.plan} allows ${limits.max_stores} store(s)` };
  }
  return { allowed: true };
}
```

#### Adding an Employee
```javascript
async function canAddEmployee(storeId) {
  const store = await dbGet('SELECT user_id FROM stores WHERE id = ?', [storeId]);
  const user = await dbGet('SELECT plan FROM users WHERE id = ?', [store.user_id]);
  const limits = await dbGet('SELECT max_employees_per_store FROM plan_limits WHERE plan = ?', [user.plan]);
  const current = await dbGet('SELECT COUNT(*) as count FROM employees WHERE store_id = ? AND is_active = 1', [storeId]);

  if (limits.max_employees_per_store !== -1 && current.count >= limits.max_employees_per_store) {
    return { allowed: false, reason: `Plan limit: ${user.plan} allows ${limits.max_employees_per_store} employees per store` };
  }
  return { allowed: true };
}
```

#### Adding a Manager
```javascript
async function canAddManager(userId) {
  const user = await dbGet('SELECT plan FROM users WHERE id = ?', [userId]);
  const limits = await dbGet('SELECT can_add_managers FROM plan_limits WHERE plan = ?', [user.plan]);

  if (!limits.can_add_managers) {
    return { allowed: false, reason: 'Managers are only available on Pro and Enterprise plans' };
  }
  return { allowed: true };
}
```

---

## Data Cleanup Jobs (Run Periodically)

### 1. Delete Expired QR Tokens
```sql
DELETE FROM qr_tokens WHERE expires_at < CURRENT_TIMESTAMP;
```
Run every 5 minutes via cron or setInterval.

### 2. Expire Old Invitations
```sql
UPDATE invitations
SET status = 'expired'
WHERE status = 'pending' AND expires_at < CURRENT_TIMESTAMP;
```
Run daily.

### 3. Archive Old Attendance Logs (Optional)
For enterprise customers with years of data, consider archiving logs older than 2 years to a separate table or file.

---

## Migration from Old Schema

If you have existing data, run these migrations:

```sql
-- 1. Add new columns to employees
ALTER TABLE employees ADD COLUMN name TEXT NOT NULL DEFAULT '';
ALTER TABLE employees ADD COLUMN scheduled_start_time TEXT;
ALTER TABLE employees ADD COLUMN scheduled_end_time TEXT;

-- 2. Add timezone to stores
ALTER TABLE stores ADD COLUMN timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata';

-- 3. Create new tables
-- (Run CREATE TABLE statements for plan_limits, invitations, attendance_edits)

-- 4. Drop unnecessary tables
DROP TABLE IF EXISTS roles;
DROP TABLE IF EXISTS user_roles;

-- 5. Modify employee_devices to allow multiple devices
-- (Cannot alter UNIQUE constraint in SQLite, must recreate table)
-- See: https://www.sqlite.org/lang_altertable.html

-- 6. Change attendance_logs foreign key for employee_id
-- (Cannot alter FK constraint in SQLite, must recreate table)
```

---

## Security Considerations

1. **PIN Storage**: Always use bcrypt with salt rounds ≥ 10
2. **Device Tokens**: Hash with crypto.createHash('sha256')
3. **QR Tokens**: Use crypto.randomUUID() or similar
4. **Invitation Tokens**: Use crypto.randomBytes(32).toString('hex')
5. **Session Tokens**: Handled by express-session + BunSqliteSessionStore
6. **SQL Injection**: Always use parameterized queries (`db.run(sql, [param1, param2])`)

---

## Performance Optimization

### For 500+ Employees Per Store

1. **Use composite indexes** for date-range queries
2. **Paginate** attendance reports (LIMIT/OFFSET)
3. **Cache** plan limits in memory (rarely changes)
4. **Batch** QR token cleanup (DELETE with LIMIT 1000)
5. **Consider** partitioning attendance_logs by year for enterprise (SQLite 3.38+)

### Query Performance Targets
- Daily attendance report: < 100ms
- Late arrivals query: < 50ms
- CSV export (1 month): < 500ms
- Plan limit check: < 10ms (from view)

---

## Testing Checklist

### Database Integrity
- [ ] Foreign keys enforced (`PRAGMA foreign_keys = ON`)
- [ ] Unique constraints prevent duplicates
- [ ] Cascade deletes work correctly
- [ ] RESTRICT prevents orphaned attendance logs

### Plan Limits
- [ ] Free user cannot create 2nd store
- [ ] Free user cannot add 3rd employee
- [ ] Plus user cannot add manager
- [ ] Pro user can add manager to multiple stores
- [ ] Enterprise has no limits

### Attendance Flow
- [ ] Check-in creates log with device_verified=1
- [ ] GPS within radius sets location_verified=1
- [ ] Late arrival calculated correctly with grace period
- [ ] Timezone conversion accurate for stores in different zones

### Device Management
- [ ] New device creates approval request
- [ ] Approval revokes old device (is_active=0)
- [ ] Employee can check in only from active device

---

## File Structure Changes

Update your `/db` folder:

```
/db
  database.js          - DB connection + PRAGMA foreign_keys = ON
  schema.sql           - This complete schema
  migrations/
    001_add_plan_limits.sql
    002_add_employee_name.sql
    003_add_timezone.sql
  helpers.js           - dbGet, dbAll, dbRun wrappers
  validators.js        - canAddStore, canAddEmployee, canAddManager
  queries.js           - Common queries (dailyReport, lateArrivals, etc.)
```

---

## End of Document

**Next Steps for Implementation:**
1. Replace `schema.sql` with this design
2. Add `plan_limits` data
3. Create `validators.js` with plan limit checks
4. Update all INSERT operations to call validators first
5. Add cleanup cron jobs for QR tokens and invitations
6. Test with 500+ employee dataset for performance
7. Update API routes to use new schema (especially invitation flow)
