const bcrypt = require("bcryptjs");
const { dbGet, dbRun } = require("../../db/helpers");
const { isInsideGeofence } = require("../../utils/geo"); // Need to confirm geo.js path
const { ensureFpTable, fpHashFromBody, getStoredFpHash, upsertFpHash } = require("../../utils/fingerprint.utils");
const { hashToken, newDeviceToken, getEmployeeByDeviceCookie, logDeniedDevice, setDeviceCookie } = require("../../utils/device.utils");
const { decideNextStepForToday, isTooSoon, computeCheckinTimeStatus } = require("../../utils/attendance.utils");


// GET scan page
exports.index = async (req, res) => {
  await ensureFpTable();

  const storePublicId = String(req.params.storePublicId);
  const store = await dbGet(
    "SELECT id, user_id, name, public_id, lat, lng, radius_m, open_time, grace_enabled, grace_minutes FROM stores WHERE public_id = ?",
    [storePublicId]
  );
  if (!store) return res.status(404).send("Store not found.");

  const deviceToken = req.cookies.thlengta_device || null;

  let mode = "first";
  if (deviceToken) {
    const employee = await getEmployeeByDeviceCookie(store.id, req);
    mode = employee ? "pin" : "first";
  }

  res.renderPage("employee/scan/index", { title: "Scan", store, mode, error: null }); // Renamed view
};

// POST scan submit (3-layer device recognition)
exports.create = async (req, res) => {
  await ensureFpTable();

  try {
    const storePublicId = String(req.params.storePublicId);

    const store = await dbGet(
      "SELECT id, user_id, name, public_id, lat, lng, radius_m, open_time, grace_enabled, grace_minutes FROM stores WHERE public_id = ?",
      [storePublicId]
    );
    if (!store) return res.status(404).send("Store not found.");

    const lat = Number(req.body.lat);
    const lng = Number(req.body.lng);
    const pin = String(req.body.pin || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();

    const incomingFpHash = fpHashFromBody(req.body);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.renderPage("employee/scan/index", {
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
          return res.renderPage("employee/scan/index", {
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
        return res.renderPage("employee/scan/index", {
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
        return res.renderPage("employee/scan/index", {
          title: "Scan",
          store,
          mode: "first",
          error: "Employee not found. Ask admin to add you."
        });
      }

      const ok = await bcrypt.compare(pin, row.pin_hash);
      if (!ok) {
        return res.renderPage("employee/scan/index", {
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

          return res.renderPage("employee/device_approvals/new", { // Renamed view
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

      return res.renderPage("employee/check_results/show", { // Renamed view
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
      return res.renderPage("employee/check_results/show", { // Renamed view
        title: "Already recorded",
        ok: true,
        store,
        employeeEmail: employee.email || null,
        message: "Already recorded. Please wait a moment before scanning again."
      });
    }

    if (step === "already_checked_out") {
      return res.renderPage("employee/check_results/show", { // Renamed view
        title: "Already checked out",
        ok: true,
        store,
        employeeEmail: employee.email || null,
        message: "You have already checked out for today."
      });
    }

    if (step === "need_choice") {
      return res.renderPage("employee/choices/new", { // Renamed view
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

    return res.renderPage("employee/check_results/show", { // Renamed view
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
};
