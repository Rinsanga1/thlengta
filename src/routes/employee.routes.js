const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const { dbGet, dbRun } = require("../db/helpers");
const { isInsideGeofence } = require("../utils/geo");

const router = express.Router();

// ----------------------------------------------------
// Device helpers
// ----------------------------------------------------
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

// ----------------------------------------------------
// Fingerprint helpers (Layer 2)
// We store 1 fingerprint hash per employee in a small table.
// This avoids changing your main schema.sql by hand.
// ----------------------------------------------------
async function ensureFpTable() {
  await dbRun(`
    CREATE TABLE IF NOT EXISTS employee_device_fps (
      employee_id INTEGER PRIMARY KEY,
      fp_hash TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
    )
  `);
}

// Build a stable-ish fingerprint string from posted fields
function buildFpString(body) {
  const tz = String(body.fp_tz || "").trim();
  const sw = String(body.fp_sw || "").trim();
  const sh = String(body.fp_sh || "").trim();
  const dpr = String(body.fp_dpr || "").trim();
  const lang = String(body.fp_lang || "").trim();
  const platform = String(body.fp_platform || "").trim();

  // Keep it simple: this is not "perfect fingerprinting", just a 2nd layer hint.
  return [tz, sw, sh, dpr, lang, platform].join("|");
}

function fpHashFromBody(body) {
  const s = buildFpString(body);
  if (!s || s === "|||||") return null;
  return crypto.createHash("sha256").update(s).digest("hex");
}

async function getStoredFpHash(employeeId) {
  const row = await dbGet(
    "SELECT fp_hash FROM employee_device_fps WHERE employee_id = ? LIMIT 1",
    [employeeId]
  );
  return row ? String(row.fp_hash || "") : null;
}

async function upsertFpHash(employeeId, fpHash) {
  if (!fpHash) return;
  await dbRun(
    `
    INSERT INTO employee_device_fps (employee_id, fp_hash, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(employee_id) DO UPDATE SET
      fp_hash = excluded.fp_hash,
      updated_at = CURRENT_TIMESTAMP
    `,
    [employeeId, fpHash]
  );
}

// ----------------------------------------------------
// Time helpers (IST)
// ----------------------------------------------------
function getNowMinutesKolkata() {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  const parts = fmt.formatToParts(new Date());
  const hh = Number(parts.find((p) => p.type === "hour")?.value || "0");
  const mm = Number(parts.find((p) => p.type === "minute")?.value || "0");
  return hh * 60 + mm;
}

function todayIST_yyyy_mm_dd() {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return fmt.format(new Date());
}

function parseOpenTimeToMinutes(openTime) {
  if (!openTime || typeof openTime !== "string") return null;
  const m = openTime.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function parseSqliteDateTimeToMs(sqliteDt) {
  if (!sqliteDt) return null;
  const s = String(sqliteDt).trim();
  if (!s) return null;
  const iso = s.includes("T") ? s : s.replace(" ", "T") + "Z";
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function computeCheckinTimeStatus(store) {
  const openMin = parseOpenTimeToMinutes(store.open_time);
  if (openMin === null) return { time_status: null, minutes_late: null };

  const nowMin = getNowMinutesKolkata();
  const grace = store.grace_enabled ? Number(store.grace_minutes || 10) : 0;

  const lateBy = nowMin - (openMin + grace);
  const minutes_late = lateBy > 0 ? lateBy : 0;
  const time_status = minutes_late > 0 ? "LATE" : "ON_TIME";

  return { time_status, minutes_late };
}

// ----------------------------------------------------
// Break state machine
// ----------------------------------------------------
async function decideNextStepForToday(storeId, employeeId) {
  const today = todayIST_yyyy_mm_dd();

  const last = await dbGet(
    `
    SELECT id, event_type, created_at
    FROM attendance_logs
    WHERE store_id = ?
      AND employee_id = ?
      AND event_type IN ('checkin','checkout','break_start','break_end')
      AND date(datetime(created_at, '+5 hours', '+30 minutes')) = ?
    ORDER BY id DESC
    LIMIT 1
    `,
    [storeId, employeeId, today]
  );

  if (!last) return { step: "checkin", mode: "checked_in", lastRow: null };

  if (last.event_type === "checkout") {
    return { step: "already_checked_out", mode: "checked_in", lastRow: last };
  }

  if (last.event_type === "break_start") {
    return { step: "need_choice", mode: "on_break", lastRow: last };
  }

  return { step: "need_choice", mode: "checked_in", lastRow: last };
}

function isTooSoon(lastRow, seconds) {
  if (!lastRow || !lastRow.created_at) return false;
  const lastMs = parseSqliteDateTimeToMs(lastRow.created_at);
  if (!lastMs) return false;
  return Date.now() - lastMs < seconds * 1000;
}

// ----------------------------------------------------
// Device lookup using cookie (Layer 1)
// ----------------------------------------------------
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

// ----------------------------------------------------
// Logging helpers
// ----------------------------------------------------
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

    // Return the created log row id so we can "credit" it on approval
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

// ----------------------------------------------------
// GET scan page
// ----------------------------------------------------
router.get("/scan/:storePublicId", async (req, res) => {
  await ensureFpTable();

  const storePublicId = String(req.params.storePublicId);
  const store = await dbGet(
    "SELECT id, admin_id, name, public_id, lat, lng, radius_m, open_time, grace_enabled, grace_minutes FROM stores WHERE public_id = ?",
    [storePublicId]
  );
  if (!store) return res.status(404).send("Store not found.");

  const deviceToken = req.cookies.thlengta_device || null;

  let mode = "first";
  if (deviceToken) {
    const employee = await getEmployeeByDeviceCookie(store.id, req);
    mode = employee ? "pin" : "first";
  }

  res.renderPage("employee/scan", { title: "Scan", store, mode, error: null });
});

// ----------------------------------------------------
// POST scan submit (3-layer device recognition)
// ----------------------------------------------------
router.post("/scan/:storePublicId", async (req, res) => {
  await ensureFpTable();

  try {
    const storePublicId = String(req.params.storePublicId);

    const store = await dbGet(
      "SELECT id, admin_id, name, public_id, lat, lng, radius_m, open_time, grace_enabled, grace_minutes FROM stores WHERE public_id = ?",
      [storePublicId]
    );
    if (!store) return res.status(404).send("Store not found.");

    const lat = Number(req.body.lat);
    const lng = Number(req.body.lng);
    const pin = String(req.body.pin || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();

    const incomingFpHash = fpHashFromBody(req.body);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.renderPage("employee/scan", {
        title: "Scan",
        store,
        mode: "first",
        error: "GPS not captured. Allow location and refresh."
      });
    }

    // 1) Identify employee
    let deviceToken = req.cookies.thlengta_device || null;
    let employee = null;

    // ---- Layer 1: cookie -> DB device match ----
    if (deviceToken) {
      employee = await getEmployeeByDeviceCookie(store.id, req);

      if (employee) {
        const ok = await bcrypt.compare(pin, employee.pin_hash);
        if (!ok) {
          return res.renderPage("employee/scan", {
            title: "Scan",
            store,
            mode: "pin",
            error: "Invalid PIN."
          });
        }

        // Update stored fingerprint if we have one (improves Layer 2 later)
        await upsertFpHash(employee.id, incomingFpHash);
      } else {
        // stale cookie
        deviceToken = null;
        res.clearCookie("thlengta_device", { path: "/" });
      }
    }

    // ---- If no valid cookie, do email+PIN identify ----
    if (!employee) {
      if (!email) {
        return res.renderPage("employee/scan", {
          title: "Scan",
          store,
          mode: "first",
          error: "Email is required for first-time login."
        });
      }

      const row = await dbGet(
        "SELECT id, store_id, pin_hash, email FROM employees WHERE store_id = ? AND email = ? AND is_active = 1",
        [store.id, email]
      );

      if (!row) {
        return res.renderPage("employee/scan", {
          title: "Scan",
          store,
          mode: "first",
          error: "Employee not found. Ask admin to add you."
        });
      }

      const ok = await bcrypt.compare(pin, row.pin_hash);
      if (!ok) {
        return res.renderPage("employee/scan", {
          title: "Scan",
          store,
          mode: "first",
          error: "Invalid PIN."
        });
      }

      employee = row;

      // Check if employee already has a registered device
      const already = await dbGet(
        "SELECT employee_id FROM employee_devices WHERE employee_id = ? LIMIT 1",
        [employee.id]
      );

      if (!already) {
        // First ever device, register immediately
        const newToken = newDeviceToken();
        const newHash = hashToken(newToken);

        await dbRun("INSERT INTO employee_devices (employee_id, device_token_hash) VALUES (?, ?)", [
          employee.id,
          newHash
        ]);

        setDeviceCookie(res, newToken);

        // Store fingerprint for Layer 2 recovery later
        await upsertFpHash(employee.id, incomingFpHash);

        deviceToken = newToken;
      } else {
        // Employee is locked to a device already.
        // Layer 2: fingerprint match = auto-rebind.
        const storedFp = await getStoredFpHash(employee.id);

        const fpMatches =
          incomingFpHash &&
          storedFp &&
          String(incomingFpHash) === String(storedFp);

        if (fpMatches) {
          // Auto approve device change based on fingerprint match
          const newToken = newDeviceToken();
          const newHash = hashToken(newToken);

          await dbRun(
            "UPDATE employee_devices SET device_token_hash = ? WHERE employee_id = ?",
            [newHash, employee.id]
          );

          setDeviceCookie(res, newToken);
          await upsertFpHash(employee.id, incomingFpHash);

          deviceToken = newToken;
        } else {
          // Layer 3: require manager/admin approval
          const deniedLogId = await logDeniedDevice(store.id, employee.id, lat, lng, req);

          return res.renderPage("employee/device_approval", {
            title: "Approval needed",
            store,
            employeeEmail: employee.email,
            lat,
            lng,
            // pass through a snapshot of fingerprint fields so approval can bind them too
            fp: {
              fp_tz: req.body.fp_tz || "",
              fp_sw: req.body.fp_sw || "",
              fp_sh: req.body.fp_sh || "",
              fp_dpr: req.body.fp_dpr || "",
              fp_lang: req.body.fp_lang || "",
              fp_platform: req.body.fp_platform || ""
            },
            clientDeviceToken: String(req.body.device_token || ""),
            deniedLogId: deniedLogId || "",
            error: null
          });
        }
      }
    }

    // 2) Geofence check
    const gf = isInsideGeofence(store.lat, store.lng, store.radius_m, lat, lng);
    if (!gf.ok) {
      await dbRun(
        `
        INSERT INTO attendance_logs
          (store_id, employee_id, event_type, device_ok, gps_ok, lat, lng, user_agent, ip, time_status, minutes_late)
        VALUES
          (?, ?, 'denied_gps', 1, 0, ?, ?, ?, ?, NULL, NULL)
        `,
        [store.id, employee.id, lat, lng, req.get("user-agent") || "", req.ip]
      );

      return res.renderPage("employee/check_result", {
        title: "Check failed",
        ok: false,
        store,
        employeeEmail: employee.email || null,
        message: `You are not at the store location. Distance ${gf.distance_m}m (allowed ${store.radius_m}m).`
      });
    }

    // 3) Decide step for today
    const decision = await decideNextStepForToday(store.id, employee.id);
    const { step, mode: workMode, lastRow } = decision;

    if (isTooSoon(lastRow, 6) && step !== "need_choice") {
      return res.renderPage("employee/check_result", {
        title: "Already recorded",
        ok: true,
        store,
        employeeEmail: employee.email || null,
        message: "Already recorded. Please wait a moment before scanning again."
      });
    }

    if (step === "already_checked_out") {
      return res.renderPage("employee/check_result", {
        title: "Already checked out",
        ok: true,
        store,
        employeeEmail: employee.email || null,
        message: "You have already checked out for today."
      });
    }

    if (step === "need_choice") {
      return res.renderPage("employee/break_or_checkout", {
        title: "Choose action",
        store,
        storePublicId: store.public_id,
        employeeEmail: employee.email || null,
        mode: workMode === "on_break" ? "on_break" : "checked_in",
        lat,
        lng,
        error: null
      });
    }

    // 4) Checkin
    const ts = computeCheckinTimeStatus(store);

    await dbRun(
      `
      INSERT INTO attendance_logs
        (store_id, employee_id, event_type, device_ok, gps_ok, lat, lng, user_agent, ip, time_status, minutes_late)
      VALUES
        (?, ?, 'checkin', 1, 1, ?, ?, ?, ?, ?, ?)
      `,
      [
        store.id,
        employee.id,
        lat,
        lng,
        req.get("user-agent") || "",
        req.ip,
        ts.time_status,
        ts.minutes_late
      ]
    );

    return res.renderPage("employee/check_result", {
      title: "Check-in successful",
      ok: true,
      store,
      employeeEmail: employee.email || null,
      message: "Checked in."
    });
  } catch (err) {
    console.error(err);
    return res.status(500).send("Server error");
  }
});

// ----------------------------------------------------
// POST approval: manager/admin approves device change
// Endpoint must match device_approval.ejs
// POST /e/scan/:storePublicId/device/approve
// ----------------------------------------------------
router.post("/scan/:storePublicId/device/approve", async (req, res) => {
  await ensureFpTable();

  try {
    const storePublicId = String(req.params.storePublicId);

    const store = await dbGet(
      "SELECT id, admin_id, name, public_id, lat, lng, radius_m, open_time, grace_enabled, grace_minutes FROM stores WHERE public_id = ?",
      [storePublicId]
    );
    if (!store) return res.status(404).send("Store not found.");

    const employeeEmail = String(req.body.employee_email || "").trim().toLowerCase();
    const managerEmail = String(req.body.manager_email || "").trim().toLowerCase();
    const managerPassword = String(req.body.manager_password || "");

    const lat = Number(req.body.lat);
    const lng = Number(req.body.lng);

    const incomingFpHash = fpHashFromBody(req.body);

    if (!employeeEmail) {
      return res.renderPage("employee/device_approval", {
        title: "Approval needed",
        store,
        employeeEmail: "",
        lat,
        lng,
        fp: {
          fp_tz: req.body.fp_tz || "",
          fp_sw: req.body.fp_sw || "",
          fp_sh: req.body.fp_sh || "",
          fp_dpr: req.body.fp_dpr || "",
          fp_lang: req.body.fp_lang || "",
          fp_platform: req.body.fp_platform || ""
        },
        clientDeviceToken: String(req.body.client_device_token || ""),
        deniedLogId: String(req.body.deniedLogId || ""),
        error: "Missing employee email. Please rescan."
      });
    }

    // Find employee (must belong to this store)
    const employee = await dbGet(
      "SELECT id, email FROM employees WHERE store_id = ? AND email = ? AND is_active = 1",
      [store.id, employeeEmail]
    );

    if (!employee) {
      return res.renderPage("employee/device_approval", {
        title: "Approval needed",
        store,
        employeeEmail,
        lat,
        lng,
        fp: {
          fp_tz: req.body.fp_tz || "",
          fp_sw: req.body.fp_sw || "",
          fp_sh: req.body.fp_sh || "",
          fp_dpr: req.body.fp_dpr || "",
          fp_lang: req.body.fp_lang || "",
          fp_platform: req.body.fp_platform || ""
        },
        clientDeviceToken: String(req.body.client_device_token || ""),
        deniedLogId: String(req.body.deniedLogId || ""),
        error: "Employee not found for this store."
      });
    }

    // Auth approver:
    // Option A: store owner admin (admins.id == store.admin_id)
    // Option B: manager assigned to this store (manager_stores)
    let approved = false;

    // Try Admin
    const adminRow = await dbGet(
      "SELECT id, password_hash FROM admins WHERE id = ? AND email = ?",
      [store.admin_id, managerEmail]
    );

    if (adminRow) {
      const okAdmin = await bcrypt.compare(managerPassword, adminRow.password_hash);
      if (okAdmin) approved = true;
    }

    // Try Manager if not approved yet
    if (!approved) {
      const mgr = await dbGet(
        "SELECT id, password_hash, is_active FROM managers WHERE email = ? AND admin_id = ?",
        [managerEmail, store.admin_id]
      );

      if (mgr && Number(mgr.is_active) === 1) {
        const okMgr = await bcrypt.compare(managerPassword, mgr.password_hash);
        if (okMgr) {
          const map = await dbGet(
            "SELECT id FROM manager_stores WHERE manager_id = ? AND store_id = ?",
            [mgr.id, store.id]
          );
          if (map) approved = true;
        }
      }
    }

    if (!approved) {
      return res.renderPage("employee/device_approval", {
        title: "Approval needed",
        store,
        employeeEmail: employee.email,
        lat,
        lng,
        fp: {
          fp_tz: req.body.fp_tz || "",
          fp_sw: req.body.fp_sw || "",
          fp_sh: req.body.fp_sh || "",
          fp_dpr: req.body.fp_dpr || "",
          fp_lang: req.body.fp_lang || "",
          fp_platform: req.body.fp_platform || ""
        },
        clientDeviceToken: String(req.body.client_device_token || ""),
        deniedLogId: String(req.body.deniedLogId || ""),
        error: "Invalid approver credentials or not assigned to this store."
      });
    }

    // Approved: bind new device now
    const newToken = newDeviceToken();
    const newHash = hashToken(newToken);

    // Update device hash for this employee (single device rule)
    await dbRun(
      "UPDATE employee_devices SET device_token_hash = ? WHERE employee_id = ?",
      [newHash, employee.id]
    );

    // Update fingerprint too (so Layer 2 works in future)
    await upsertFpHash(employee.id, incomingFpHash);

    // Set cookie on this device
    setDeviceCookie(res, newToken);

    // CREDIT the denied attempt:
    // If we can find the latest denied_device today, convert it to checkin with same timestamp.
    // We do not create a new row; we flip denied_device into checkin so admin logs look clean.
    const denied = await dbGet(
      `
      SELECT id, created_at
      FROM attendance_logs
      WHERE store_id = ?
        AND employee_id = ?
        AND event_type = 'denied_device'
      ORDER BY id DESC
      LIMIT 1
      `,
      [store.id, employee.id]
    );

    if (denied && denied.id) {
      const ts = computeCheckinTimeStatus(store);

      await dbRun(
        `
        UPDATE attendance_logs
        SET event_type = 'checkin',
            device_ok = 1,
            gps_ok = 1,
            lat = COALESCE(lat, ?),
            lng = COALESCE(lng, ?),
            time_status = ?,
            minutes_late = ?
        WHERE id = ?
          AND event_type = 'denied_device'
        `,
        [
          Number.isFinite(lat) ? lat : null,
          Number.isFinite(lng) ? lng : null,
          ts.time_status,
          ts.minutes_late,
          denied.id
        ]
      );
    }

    return res.renderPage("employee/check_result", {
      title: "Approved",
      ok: true,
      store,
      employeeEmail: employee.email,
      message: "Approved. This device is now linked. You are checked in."
    });
  } catch (err) {
    console.error(err);
    return res.status(500).send("Server error");
  }
});

// ----------------------------------------------------
// POST choice action (Break / Resume / Checkout) - Stateless
// ----------------------------------------------------
async function handleChoiceStateless(req, res) {
  await ensureFpTable();

  try {
    const storePublicId = String(req.params.storePublicId);

    const store = await dbGet(
      "SELECT id, admin_id, name, public_id, lat, lng, radius_m, open_time, grace_enabled, grace_minutes FROM stores WHERE public_id = ?",
      [storePublicId]
    );
    if (!store) return res.status(404).send("Store not found.");

    // Identify employee from device cookie
    const deviceToken = req.cookies.thlengta_device || null;
    if (!deviceToken) {
      return res.renderPage("employee/check_result", {
        title: "Please scan again",
        ok: false,
        store,
        employeeEmail: null,
        message: "Session lost. Please scan the QR again and enter PIN."
      });
    }

    const deviceHash = hashToken(deviceToken);

    const employee = await dbGet(
      `
      SELECT e.id, e.email
      FROM employee_devices d
      JOIN employees e ON e.id = d.employee_id
      WHERE d.device_token_hash = ? AND e.store_id = ? AND e.is_active = 1
      `,
      [deviceHash, store.id]
    );

    if (!employee) {
      return res.renderPage("employee/check_result", {
        title: "Device not registered",
        ok: false,
        store,
        employeeEmail: null,
        message: "This device is not registered. Please scan again and login using email + PIN."
      });
    }

    const choice = String(req.body.choice || "").trim(); // break | resume | checkout

    const lat = Number(req.body.lat);
    const lng = Number(req.body.lng);

    let gps_ok = 1;
    let usedLat = null;
    let usedLng = null;

    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      const gf = isInsideGeofence(store.lat, store.lng, store.radius_m, lat, lng);
      if (!gf.ok) {
        await dbRun(
          `
          INSERT INTO attendance_logs
            (store_id, employee_id, event_type, device_ok, gps_ok, lat, lng, user_agent, ip, time_status, minutes_late)
          VALUES
            (?, ?, 'denied_gps', 1, 0, ?, ?, ?, ?, NULL, NULL)
          `,
          [store.id, employee.id, lat, lng, req.get("user-agent") || "", req.ip]
        );

        return res.renderPage("employee/check_result", {
          title: "Check failed",
          ok: false,
          store,
          employeeEmail: employee.email || null,
          message: `You are not at the store location.`
        });
      }

      usedLat = lat;
      usedLng = lng;
      gps_ok = 1;
    }

    const { step, mode } = await decideNextStepForToday(store.id, employee.id);

    if (step === "already_checked_out") {
      return res.renderPage("employee/check_result", {
        title: "Already checked out",
        ok: true,
        store,
        employeeEmail: employee.email || null,
        message: "You have already checked out for today."
      });
    }

    const isOnBreak = mode === "on_break";
    const allowed = isOnBreak ? ["resume", "checkout"] : ["break", "checkout"];

    if (!allowed.includes(choice)) {
      return res.renderPage("employee/break_or_checkout", {
        title: "Choose action",
        store,
        storePublicId: store.public_id,
        employeeEmail: employee.email || null,
        mode: isOnBreak ? "on_break" : "checked_in",
        lat: usedLat,
        lng: usedLng,
        error: "Invalid option. Please choose again."
      });
    }

    let event_type = "checkout";
    if (choice === "break") event_type = "break_start";
    if (choice === "resume") event_type = "break_end";
    if (choice === "checkout") event_type = "checkout";

    await dbRun(
      `
      INSERT INTO attendance_logs
        (store_id, employee_id, event_type, device_ok, gps_ok, lat, lng, user_agent, ip, time_status, minutes_late)
      VALUES
        (?, ?, ?, 1, ?, ?, ?, ?, ?, NULL, NULL)
      `,
      [store.id, employee.id, event_type, gps_ok, usedLat, usedLng, req.get("user-agent") || "", req.ip]
    );

    let title = "Recorded";
    let msg = "Saved.";

    if (event_type === "break_start") {
      title = "Break started";
      msg = "Break recorded. Scan again when you return to resume work.";
    } else if (event_type === "break_end") {
      title = "Resumed work";
      msg = "Break ended. You are back to work.";
    } else if (event_type === "checkout") {
      title = "Check-out successful";
      msg = "Checked out.";
    }

    return res.renderPage("employee/check_result", {
      title,
      ok: true,
      store,
      employeeEmail: employee.email || null,
      message: msg
    });
  } catch (err) {
    console.error(err);
    return res.status(500).send("Server error");
  }
}

router.post("/scan/:storePublicId/choice", handleChoiceStateless);
router.post("/scan/:storePublicId/action", handleChoiceStateless);

module.exports = router;
