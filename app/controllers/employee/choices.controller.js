const { dbGet, dbRun } = require("../../db/helpers");
const { isInsideGeofence } = require("../../utils/geo");
const { ensureFpTable } = require("../../utils/fingerprint.utils");
const { hashToken } = require("../../utils/device.utils"); // hashToken moved to device.utils
const { decideNextStepForToday } = require("../../utils/attendance.utils");


async function handleChoiceStateless(req, res) {
  await ensureFpTable(); // This is in fingerprint.utils

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
      return res.renderPage("employee/check_results/show", { // Renamed view
        title: "Please scan again",
        ok: false,
        store,
        employeeEmail: null,
        message: "Session lost. Please scan the QR again and enter PIN."
      });
    }

    // hashToken is in device.utils now
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
      return res.renderPage("employee/check_results/show", { // Renamed view
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

        return res.renderPage("employee/check_results/show", { // Renamed view
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
      return res.renderPage("employee/check_results/show", { // Renamed view
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
      return res.renderPage("employee/choices/new", { // Renamed view
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

    return res.renderPage("employee/check_results/show", { // Renamed view
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

exports.create = handleChoiceStateless;
