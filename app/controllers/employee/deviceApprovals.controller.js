const bcrypt = require("bcryptjs");
const { dbGet, dbRun } = require("../../../db/helpers");
const { ensureFpTable, fpHashFromBody, upsertFpHash } = require("../../utils/fingerprint.utils");
const { newDeviceToken, hashToken, setDeviceCookie } = require("../../utils/device.utils");
const { computeCheckinTimeStatus } = require("../../utils/attendance.utils");


exports.create = async (req, res) => {
  await ensureFpTable();

  try {
    const storePublicId = String(req.params.storePublicId);

    const store = await dbGet(
      "SELECT id, user_id, name, public_id, lat, lng, radius_m, open_time, grace_enabled, grace_minutes FROM stores WHERE public_id = ?",
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
      return res.renderPage("employee/device_approvals/new", {
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

    const employee = await dbGet(
      "SELECT id, email FROM employees WHERE store_id = ? AND email = ? AND is_active = 1",
      [store.id, employeeEmail]
    );

    if (!employee) {
      return res.renderPage("employee/device_approvals/new", {
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

    let approved = false;
    let approvedByType = null;

    const userRow = await dbGet(
      "SELECT id, password_hash FROM users WHERE id = ? AND email = ?",
      [store.user_id, managerEmail]
    );

    if (userRow) {
      const okUser = await bcrypt.compare(managerPassword, userRow.password_hash);
      if (okUser) {
        approved = true;
        approvedByType = "user";
      }
    }

    if (!approved) {
      const mgr = await dbGet(
        "SELECT id, password_hash, is_active FROM managers WHERE email = ? AND user_id = ?",
        [managerEmail, store.user_id]
      );

      if (mgr && Number(mgr.is_active) === 1) {
        const okMgr = await bcrypt.compare(managerPassword, mgr.password_hash);
        if (okMgr) {
          const map = await dbGet(
            "SELECT id FROM manager_stores WHERE manager_id = ? AND store_id = ?",
            [mgr.id, store.id]
          );
          if (map) {
            approved = true;
            approvedByType = "manager";
          }
        }
      }
    }

    if (!approved) {
      return res.renderPage("employee/device_approvals/new", {
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
        error: "Invalid owner/manager email or password."
      });
    }

    const clientDeviceToken = String(req.body.client_device_token || "");
    if (clientDeviceToken) {
      const dTokenHash = hashToken(clientDeviceToken);
      await dbRun(
        `INSERT OR REPLACE INTO employee_devices (employee_id, device_token_hash, fp_hash, fp_updated_at)
         VALUES (?, ?, ?, datetime('now'))`,
        [employee.id, dTokenHash, incomingFpHash || null]
      );
    }

    const deniedLogId = String(req.body.deniedLogId || "");
    if (deniedLogId && /^\d+$/.test(deniedLogId)) {
      const nId = Number(deniedLogId);
      const logRow = await dbGet("SELECT id, event_type FROM attendance_logs WHERE id = ?", [nId]);
      if (logRow) {
        await dbRun("UPDATE attendance_logs SET approved_at = datetime('now') WHERE id = ?", [nId]);
        if (approvedByType === "user") {
          await dbRun("UPDATE attendance_logs SET approved_by_user_id = ? WHERE id = ?", [store.user_id, nId]);
        } else if (approvedByType === "manager") {
          const mgr = await dbGet("SELECT id FROM managers WHERE email = ?", [managerEmail]);
          if (mgr) {
            await dbRun("UPDATE attendance_logs SET approved_by_manager_id = ? WHERE id = ?", [mgr.id, nId]);
          }
        }
      }
    }

    await dbRun(
      "UPDATE device_approval_requests SET status = 'approved', approved_at = datetime('now') WHERE employee_id = ? AND status = 'pending'",
      [employee.id]
    );

    const event_type = String(req.body.attempted_event_type || "checkin").trim();
    const timeStatus = computeCheckinTimeStatus(store, lat, lng);

    await dbRun(
      `INSERT INTO attendance_logs (
        store_id, employee_id, event_type, device_ok, gps_ok,
        lat, lng, user_agent, ip, time_status
      )
      VALUES (?, ?, ?, 1, 1, ?, ?, ?, ?, ?)`,
      [
        store.id,
        employee.id,
        event_type,
        lat,
        lng,
        req.get("user-agent") || "",
        req.ip,
        timeStatus
      ]
    );

    setDeviceCookie(res, clientDeviceToken);

    return res.redirect(`/e/scan/${storePublicId}?approved=1`);
  } catch (err) {
    console.error(err);
    return res.status(500).send("Server error");
  }
};
