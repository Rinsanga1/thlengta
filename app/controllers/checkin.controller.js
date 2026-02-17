const { dbGet, dbRun, dbAll } = require("../../db/helpers");
const { isInsideGeofence } = require("../utils/geo");
const { ensureFpTable, fpHashFromBody, upsertFpHash } = require("../utils/fingerprint.utils");
const { hashToken, newDeviceToken, setDeviceCookie } = require("../utils/device.utils");
const { decideNextStepForToday, isTooSoon, computeCheckinTimeStatus } = require("../utils/attendance.utils");

function requireCheckinUser(req, res, next) {
  if (!req.session.userId) {
    return res.redirect("/users/signin?redirect=/checkin");
  }
  next();
}

exports.requireCheckinUser = requireCheckinUser;

exports.index = async (req, res) => {
  const userId = req.session.userId;
  if (!userId) {
    return res.redirect("/users/signin?redirect=/checkin");
  }

  const user = dbGet("SELECT email FROM users WHERE id = ?", [userId]);
  if (!user) {
    return res.redirect("/users/signin");
  }

  const workplaces = dbAll(`
    SELECT w.id, w.name, w.public_id, w.lat, w.lng, w.radius_m, w.address, w.open_time,
           u.name as owner_name, u.email as owner_email
    FROM employees e
    JOIN workplaces w ON w.id = e.workplace_id
    JOIN users u ON u.id = w.user_id
    WHERE LOWER(e.email) = LOWER(?) AND e.is_active = 1
    ORDER BY w.name ASC
  `, [user.email]);

  res.renderPage("checkin/index", {
    title: "Check In",
    workplaces: workplaces || [],
    userEmail: user.email
  });
};

exports.create = async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(401).json({ ok: false, error: "Not logged in" });
    }

    const workplacePublicId = String(req.body.workplacePublicId);
    const lat = Number(req.body.lat);
    const lng = Number(req.body.lng);

    if (!workplacePublicId) {
      return res.status(400).json({ ok: false, error: "Workplace ID required" });
    }

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ ok: false, error: "GPS location required" });
    }

    const workplace = dbGet(`
      SELECT id, user_id, name, public_id, lat, lng, radius_m, open_time, grace_enabled, grace_minutes 
      FROM workplaces WHERE public_id = ?
    `, [workplacePublicId]);

    if (!workplace) {
      return res.status(404).json({ ok: false, error: "Workplace not found" });
    }

    const user = dbGet("SELECT email FROM users WHERE id = ?", [userId]);
    if (!user) {
      return res.status(401).json({ ok: false, error: "User not found" });
    }

    const employee = dbGet(`
      SELECT id, workplace_id, pin_hash, email, name
      FROM employees 
      WHERE workplace_id = ? AND LOWER(email) = LOWER(?) AND is_active = 1
    `, [workplace.id, user.email]);

    if (!employee) {
      return res.status(403).json({ ok: false, error: "You are not an employee at this workplace" });
    }

    await ensureFpTable();
    const incomingFpHash = fpHashFromBody(req.body);
    if (incomingFpHash) {
      await upsertFpHash(employee.id, incomingFpHash);
    }

    const gf = isInsideGeofence(workplace.lat, workplace.lng, workplace.radius_m, lat, lng);
    if (!gf.ok) {
      await dbRun(`
        INSERT INTO attendance_logs
          (workplace_id, employee_id, event_type, device_verified, location_verified, lat, lng, user_agent, ip)
        VALUES
          (?, ?, 'denied_gps', 1, 0, ?, ?, ?, ?)
      `, [workplace.id, employee.id, lat, lng, req.get("user-agent") || "", req.ip]);

      return res.json({ 
        ok: false, 
        error: `You are not at the workplace location. Distance ${gf.distance_m}m (allowed ${workplace.radius_m}m).` 
      });
    }

    const decision = await decideNextStepForToday(workplace.id, employee.id);
    const { step, mode: workMode, lastRow } = decision;

    if (isTooSoon(lastRow, 6) && step !== "need_choice") {
      return res.json({ ok: true, message: "Already recorded. Please wait a moment before scanning again." });
    }

    if (step === "already_checked_out") {
      return res.json({ ok: true, message: "You have already checked out for today." });
    }

    if (step === "need_choice") {
      return res.json({ 
        ok: true, 
        needsChoice: true,
        mode: workMode === "on_break" ? "on_break" : "checked_in",
        workplacePublicId: workplace.public_id,
        lat,
        lng
      });
    }

    const ts = computeCheckinTimeStatus(workplace);

    await dbRun(`
      INSERT INTO attendance_logs
        (workplace_id, employee_id, event_type, device_verified, location_verified, lat, lng, user_agent, ip, created_at)
      VALUES
        (?, ?, 'checkin', 1, 1, ?, ?, ?, ?, datetime('now', 'localtime'))
    `, [
      workplace.id,
      employee.id,
      lat,
      lng,
      req.get("user-agent") || "",
      req.ip
    ]);

    return res.json({ 
      ok: true, 
      message: "Checked in successfully!",
      workplaceName: workplace.name,
      checkinTime: new Date().toLocaleTimeString()
    });

  } catch (err) {
    console.error("Check-in error:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
};
