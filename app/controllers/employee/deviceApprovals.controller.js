const bcrypt = require("bcryptjs");
const { dbGet, dbRun } = require("../../db/helpers");
const { ensureFpTable, fpHashFromBody, upsertFpHash } = require("../../utils/fingerprint.utils");
const { newDeviceToken, hashToken, setDeviceCookie } = require("../../utils/device.utils");
const { computeCheckinTimeStatus } = require("../../utils/attendance.utils");


// POST approval: manager/admin approves device change
exports.create = async (req, res) => {
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
      return res.renderPage("employee/device_approvals/new", { // Renamed view
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
      return res.renderPage("employee/device_approvals/new", { // Renamed view
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
      return res.renderPage("employee/device_approvals/new", { // Renamed view
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

    return res.renderPage("employee/check_results/show", { // Renamed view
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
};
