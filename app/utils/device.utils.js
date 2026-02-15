const crypto = require("crypto");
const { dbGet, dbRun } = require("../../db/helpers");

function hashToken(t) {
  return crypto.createHash("sha256").update(String(t || "")).digest("hex");
}

function newDeviceToken() {
  return crypto.randomBytes(24).toString("hex");
}

function isSqliteUniqueError(err) {
  const msg = String(err && err.message ? err.message : "");
  return msg.includes("SQLITE_CONSTRAINT");
}

async function getEmployeeByDeviceCookie(storeId, req) {
  const deviceToken = req.cookies.thlengta_device || null;
  if (!deviceToken) return null;

  const deviceHash = hashToken(deviceToken);

  const row = await dbGet(
    `
    SELECT e.id, e.store_id, e.pin_hash, e.email
    FROM employee_devices d
    JOIN employees e ON e.id = d.employee_id
    WHERE d.device_token_hash = ? AND e.store_id = ? AND e.is_active = 1
    `,
    [deviceHash, storeId]
  );

  return row || null;
}

async function logDeniedDevice(storeId, employeeId, lat, lng, req) {
  try {
    await dbRun(
      `
      INSERT INTO attendance_logs
        (store_id, employee_id, event_type, device_ok, gps_ok, lat, lng, user_agent, ip, time_status, minutes_late)
      VALUES
        (?, ?, 'denied_device', 0, 1, ?, ?, ?, ?, NULL, NULL)
      `,
      [storeId, employeeId, Number.isFinite(lat) ? lat : null, Number.isFinite(lng) ? lng : null, req.get("user-agent") || "", req.ip]
    );

    const row = await dbGet("SELECT last_insert_rowid() AS id");
    return row ? Number(row.id) : null;
  } catch (e) {
    return null;
  }
}

function setDeviceCookie(res, token) {
  res.cookie("thlengta_device", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 180 * 24 * 60 * 60 * 1000
  });
}

module.exports = {
  hashToken,
  newDeviceToken,
  isSqliteUniqueError,
  getEmployeeByDeviceCookie,
  logDeniedDevice,
  setDeviceCookie,
};
