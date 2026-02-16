const { dbGet, dbAll } = require("./helpers");

async function getDailyAttendanceReport(workplaceId, date = "now") {
  const sql = `
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
      AND DATE(a.created_at) = DATE(?)
    WHERE e.workplace_id = ? AND e.is_active = 1
    GROUP BY e.id
    ORDER BY e.name
  `;
  return dbAll(sql, [date, workplaceId]);
}

async function getLateArrivals(workplaceId, days = 7) {
  const sql = `
    SELECT
      e.name,
      DATE(a.created_at) as date,
      TIME(a.created_at, w.timezone) as actual_time,
      COALESCE(e.scheduled_start_time, w.open_time) as expected_time,
      CAST((julianday(TIME(a.created_at, w.timezone)) - julianday(TIME(COALESCE(e.scheduled_start_time, w.open_time)))) * 1440 AS INTEGER) as minutes_late
    FROM attendance_logs a
    JOIN employees e ON a.employee_id = e.id
    JOIN workplaces w ON a.workplace_id = w.id
    WHERE a.event_type = 'checkin'
      AND a.workplace_id = ?
      AND DATE(a.created_at) >= DATE('now', '-' || ? || ' days')
      AND TIME(a.created_at, w.timezone) > TIME(COALESCE(e.scheduled_start_time, w.open_time), '+' || w.grace_minutes || ' minutes')
    ORDER BY a.created_at DESC
  `;
  return dbAll(sql, [workplaceId, days]);
}

async function getEmployeeAttendanceHistory(workplaceId, startDate, endDate) {
  const sql = `
    SELECT
      DATE(a.created_at) as date,
      e.name,
      e.email,
      MIN(CASE WHEN a.event_type = 'checkin' THEN TIME(a.created_at, w.timezone) END) as checkin_time,
      MAX(CASE WHEN a.event_type = 'checkout' THEN TIME(a.created_at, w.timezone) END) as checkout_time,
      CASE
        WHEN MIN(CASE WHEN a.event_type = 'checkin' THEN a.location_verified END) = 1 THEN 'Verified'
        ELSE 'Unverified'
      END as location_status
    FROM attendance_logs a
    JOIN employees e ON a.employee_id = e.id
    JOIN workplaces w ON a.workplace_id = w.id
    WHERE a.workplace_id = ?
      AND DATE(a.created_at) BETWEEN ? AND ?
    GROUP BY DATE(a.created_at), e.id
    ORDER BY DATE(a.created_at) DESC, e.name
  `;
  return dbAll(sql, [workplaceId, startDate, endDate]);
}

async function getEmployeeCheckInStatus(workplaceId, date = "now") {
  const sql = `
    SELECT
      e.id,
      e.name,
      e.email,
      MAX(CASE WHEN a.event_type = 'checkin' THEN 1 ELSE 0 END) as has_checked_in,
      MAX(CASE WHEN a.event_type = 'checkout' THEN 1 ELSE 0 END) as has_checked_out,
      MAX(CASE WHEN a.event_type = 'checkin' THEN a.created_at END) as last_checkin
    FROM employees e
    LEFT JOIN attendance_logs a ON e.id = a.employee_id
      AND DATE(a.created_at) = DATE(?)
    WHERE e.workplace_id = ? AND e.is_active = 1
    GROUP BY e.id
    ORDER BY e.name
  `;
  return dbAll(sql, [date, workplaceId]);
}

async function getEmployeeById(employeeId) {
  return dbGet("SELECT * FROM employees WHERE id = ?", [employeeId]);
}

async function getWorkplaceById(workplaceId) {
  return dbGet("SELECT * FROM workplaces WHERE id = ?", [workplaceId]);
}

async function getWorkplaceByPublicId(publicId) {
  return dbGet("SELECT * FROM workplaces WHERE public_id = ?", [publicId]);
}

async function getUserById(userId) {
  return dbGet("SELECT id, email, name, phone, plan, status, created_at FROM users WHERE id = ?", [userId]);
}

async function getUserByEmail(email) {
  return dbGet("SELECT * FROM users WHERE email = ?", [email]);
}

async function getActiveEmployeesByWorkplace(workplaceId) {
  return dbAll("SELECT * FROM employees WHERE workplace_id = ? AND is_active = 1 ORDER BY name", [workplaceId]);
}

async function getManagersByUserId(userId) {
  return dbAll("SELECT * FROM managers WHERE user_id = ? AND is_active = 1", [userId]);
}

async function getManagerById(managerId) {
  return dbGet("SELECT * FROM managers WHERE id = ?", [managerId]);
}

async function getManagerByEmail(email) {
  return dbGet("SELECT * FROM managers WHERE email = ?", [email]);
}

async function getActiveDevicesByEmployee(employeeId) {
  return dbAll(
    "SELECT * FROM employee_devices WHERE employee_id = ? AND is_active = 1",
    [employeeId]
  );
}

async function cleanupExpiredQrTokens() {
  const { dbRun } = require("./helpers");
  const result = dbRun("DELETE FROM qr_tokens WHERE expires_at < CURRENT_TIMESTAMP");
  return result.changes;
}

async function cleanupExpiredInvitations() {
  const { dbRun } = require("./helpers");
  const result = dbRun(
    "UPDATE invitations SET status = 'expired' WHERE status = 'pending' AND expires_at < CURRENT_TIMESTAMP"
  );
  return result.changes;
}

module.exports = {
  getDailyAttendanceReport,
  getLateArrivals,
  getEmployeeAttendanceHistory,
  getEmployeeCheckInStatus,
  getEmployeeById,
  getWorkplaceById,
  getWorkplaceByPublicId,
  getUserById,
  getUserByEmail,
  getActiveEmployeesByWorkplace,
  getManagersByUserId,
  getManagerById,
  getManagerByEmail,
  getActiveDevicesByEmployee,
  cleanupExpiredQrTokens,
  cleanupExpiredInvitations,
};
