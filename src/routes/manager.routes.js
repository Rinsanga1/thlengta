const express = require("express");
const bcrypt = require("bcryptjs");

const { dbGet, dbAll, dbRun } = require("../db/helpers");
const { requireManager } = require("../middleware/auth");
const { toPngBuffer } = require("../utils/qr");

const router = express.Router();

// -------- Helpers (copied from admin for consistency) --------

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
function todayIST_yyyy_mm_dd() {
  return new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

function getBaseUrl(req) {
  const envBase = process.env.BASE_URL;
  if (envBase) return envBase.replace(/\/+$/, "");
  return `${req.protocol}://${req.get("host")}`;
}

function to12Hour(hhmmss) {
  if (!hhmmss) return "";
  const parts = String(hhmmss).split(":");
  const hh = Number(parts[0]);
  const mm = Number(parts[1] || 0);

  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return hhmmss;

  const ampm = hh >= 12 ? "PM" : "AM";
  let h12 = hh % 12;
  if (h12 === 0) h12 = 12;

  const mm2 = String(mm).padStart(2, "0");
  return `${h12}:${mm2} ${ampm}`;
}

function parseSqliteTimeToMinutes(hhmmss) {
  if (!hhmmss) return null;
  const parts = String(hhmmss).split(":");
  const hh = Number(parts[0]);
  const mm = Number(parts[1] || 0);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
}

async function cleanupOldLogs(storeId) {
  await dbRun(
    `
    DELETE FROM attendance_logs
    WHERE store_id = ?
      AND datetime(created_at) < datetime('now', '-90 days')
    `,
    [storeId]
  );
}

const MANAGER_VISIBLE_EVENTS = [
  "checkin",
  "checkout",
  "break_start",
  "break_end",
  "denied_device",
  "denied_gps"
];

function sqlInListPlaceholders(n) {
  return Array.from({ length: n }, () => "?").join(",");
}

// 🔐 Manager ↔ Store access check (USED EVERYWHERE)
async function getManagerStoreOrNull(managerId, adminId, storeId) {
  return dbGet(
    `
    SELECT
      s.id,
      s.admin_id,
      s.name,
      s.public_id,
      s.lat,
      s.lng,
      s.radius_m,
      s.open_time,
      s.grace_enabled,
      s.grace_minutes
    FROM stores s
    INNER JOIN manager_stores ms ON ms.store_id = s.id
    WHERE ms.manager_id = ?
      AND s.admin_id = ?
      AND s.id = ?
    `,
    [managerId, adminId, storeId]
  );
}

// -------- Dashboard --------

router.get("/dashboard", requireManager, async (req, res) => {
  try {
    const managerId = req.session.managerId;
    const adminId = req.session.managerAdminId;

    const manager = await dbGet(
      "SELECT id, admin_id, email, is_active FROM managers WHERE id = ? AND admin_id = ?",
      [managerId, adminId]
    );

    if (!manager || !manager.is_active) {
      req.session.destroy(() => {});
      return res.redirect("/admin/login");
    }

    const admin = await dbGet("SELECT id, email, plan FROM admins WHERE id = ?", [adminId]);

    const stores = await dbAll(
      `
      SELECT
        s.id,
        s.name,
        s.public_id,
        s.lat,
        s.lng,
        s.radius_m
      FROM stores s
      INNER JOIN manager_stores ms ON ms.store_id = s.id
      WHERE ms.manager_id = ?
        AND s.admin_id = ?
      ORDER BY s.id DESC
      `,
      [managerId, adminId]
    );

    return res.renderPage("manager/dashboard", {
      title: "Manager Dashboard",
      manager,
      admin,
      stores
    });
  } catch (err) {
    console.error("Manager dashboard error:", err);
    return res.status(500).send("Server error");
  }
});

// -------- Store QR (view + PNG) --------

router.get("/store/:storeId/qr", requireManager, async (req, res) => {
  try {
    const managerId = req.session.managerId;
    const adminId = req.session.managerAdminId;
    const storeId = Number(req.params.storeId);

    const store = await getManagerStoreOrNull(managerId, adminId, storeId);
    if (!store) return res.status(404).send("Store not found.");

    // match admin exactly
    const scanUrl = `${getBaseUrl(req)}/e/scan/${store.public_id}?src=qr`;

    return res.renderPage("manager/store_qr", {
      title: "Store QR",
      store,
      scanUrl
    });
  } catch (err) {
    console.error("Manager QR view error:", err);
    return res.status(500).send("Server error");
  }
});

router.get("/store/:storeId/qr.png", requireManager, async (req, res) => {
  try {
    const managerId = req.session.managerId;
    const adminId = req.session.managerAdminId;
    const storeId = Number(req.params.storeId);

    const store = await getManagerStoreOrNull(managerId, adminId, storeId);
    if (!store) return res.status(404).send("Store not found.");

    // match admin exactly
    const scanUrl = `${getBaseUrl(req)}/e/scan/${store.public_id}?src=qr`;
    const png = await toPngBuffer(scanUrl);

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "no-store");
    res.send(png);
  } catch (err) {
    console.error("Manager QR png error:", err);
    return res.status(500).send("Server error");
  }
});

// -------- Logs (view) --------

router.get("/store/:storeId/logs", requireManager, async (req, res) => {
  try {
    const managerId = req.session.managerId;
    const adminId = req.session.managerAdminId;
    const storeId = Number(req.params.storeId);

    const store = await getManagerStoreOrNull(managerId, adminId, storeId);
    if (!store) return res.status(404).send("Store not found.");

    await cleanupOldLogs(storeId);

    const selectedDate = String(req.query.date || todayIST_yyyy_mm_dd());
    const placeholders = sqlInListPlaceholders(MANAGER_VISIBLE_EVENTS.length);

    const rows = await dbAll(
      `
      SELECT
        a.id,
        a.event_type,
        a.gps_ok,
        a.device_ok,
        a.ip,
        datetime(a.created_at, '+5 hours', '+30 minutes') AS created_at_ist,
        e.email AS employee_email
      FROM attendance_logs a
      LEFT JOIN employees e ON e.id = a.employee_id
      WHERE a.store_id = ?
        AND date(datetime(a.created_at, '+5 hours', '+30 minutes')) = ?
        AND a.event_type IN (${placeholders})
      ORDER BY a.id DESC
      `,
      [storeId, selectedDate, ...MANAGER_VISIBLE_EVENTS]
    );

    const openMin = parseSqliteTimeToMinutes(store.open_time);
    const graceMin = store.grace_enabled ? Number(store.grace_minutes || 10) : 0;

    const logs = rows.map((r) => {
      let timePart = "";
      if (r.created_at_ist && typeof r.created_at_ist === "string") {
        const parts = r.created_at_ist.split(" ");
        timePart = parts[1] || "";
      }

      const time12 = to12Hour(timePart);

      let punctuality = "N_A";
      let late_by_min = null;

      if (r.event_type === "checkin" && r.employee_email && openMin !== null) {
        const tMin = parseSqliteTimeToMinutes(timePart);
        if (tMin !== null) {
          const cutoff = openMin + graceMin;
          if (tMin <= cutoff) {
            punctuality = "ON_TIME";
          } else {
            punctuality = "LATE";
            late_by_min = tMin - cutoff;
          }
        }
      }

      return { ...r, time: timePart, time12, punctuality, late_by_min };
    });

    return res.renderPage("manager/logs", {
      title: "Attendance Logs",
      store,
      selectedDate,
      logs
    });
  } catch (err) {
    console.error("Manager logs error:", err);
    return res.status(500).send("Server error");
  }
});

// -------- CSV export (day) --------

router.get("/store/:storeId/logs.csv", requireManager, async (req, res) => {
  try {
    const managerId = req.session.managerId;
    const adminId = req.session.managerAdminId;
    const storeId = Number(req.params.storeId);

    const store = await getManagerStoreOrNull(managerId, adminId, storeId);
    if (!store) return res.status(404).send("Store not found.");

    await cleanupOldLogs(storeId);

    const selectedDate = String(req.query.date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) {
      return res.status(400).send("Invalid date. Use YYYY-MM-DD");
    }

    const placeholders = sqlInListPlaceholders(MANAGER_VISIBLE_EVENTS.length);

    const rows = await dbAll(
      `
      SELECT
        datetime(a.created_at, '+5 hours', '+30 minutes') AS created_at_ist,
        e.email AS employee_email,
        a.event_type,
        a.gps_ok,
        a.device_ok,
        a.ip
      FROM attendance_logs a
      LEFT JOIN employees e ON e.id = a.employee_id
      WHERE a.store_id = ?
        AND date(datetime(a.created_at, '+5 hours', '+30 minutes')) = ?
        AND a.event_type IN (${placeholders})
      ORDER BY a.id ASC
      `,
      [storeId, selectedDate, ...MANAGER_VISIBLE_EVENTS]
    );

    const openMin = parseSqliteTimeToMinutes(store.open_time);
    const graceMin = store.grace_enabled ? Number(store.grace_minutes || 10) : 0;

    const header = [
      "store",
      "date",
      "time_12hr",
      "employee",
      "event",
      "status",
      "late_by_min",
      "gps_ok",
      "device_ok",
      "ip"
    ];

    const lines = [header.join(",")];

    for (const r of rows) {
      const parts = String(r.created_at_ist || "").split(" ");
      const datePart = parts[0] || "";
      const timePart = parts[1] || "";
      const time12 = to12Hour(timePart);

      let status = "";
      let late_by_min = "";

      if (r.event_type === "checkin" && r.employee_email && openMin !== null) {
        const tMin = parseSqliteTimeToMinutes(timePart);
        const cutoff = openMin + graceMin;
        if (tMin !== null) {
          if (tMin <= cutoff) status = "ON_TIME";
          else {
            status = "LATE";
            late_by_min = String(tMin - cutoff);
          }
        }
      }

      const row = [
        `"${String(store.name).replace(/"/g, '""')}"`,
        `"${datePart}"`,
        `"${time12}"`,
        `"${String(r.employee_email || "").replace(/"/g, '""')}"`,
        `"${String(r.event_type || "")}"`,
        `"${status}"`,
        `"${late_by_min}"`,
        r.gps_ok ? "1" : "0",
        r.device_ok ? "1" : "0",
        `"${String(r.ip || "").replace(/"/g, '""')}"`
      ];

      lines.push(row.join(","));
    }

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="manager_logs_${storeId}_${selectedDate}.csv"`
    );
    res.send(lines.join("\n"));
  } catch (err) {
    console.error("Manager logs.csv error:", err);
    return res.status(500).send("Server error");
  }
});

// -------- CSV export (month) --------

router.get("/store/:storeId/logs_month.csv", requireManager, async (req, res) => {
  try {
    const managerId = req.session.managerId;
    const adminId = req.session.managerAdminId;
    const storeId = Number(req.params.storeId);

    const store = await getManagerStoreOrNull(managerId, adminId, storeId);
    if (!store) return res.status(404).send("Store not found.");

    await cleanupOldLogs(storeId);

    const month = String(req.query.month || "");
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).send("Invalid month. Use YYYY-MM");
    }

    const placeholders = sqlInListPlaceholders(MANAGER_VISIBLE_EVENTS.length);

    const rows = await dbAll(
      `
      SELECT
        datetime(a.created_at, '+5 hours', '+30 minutes') AS created_at_ist,
        e.email AS employee_email,
        a.event_type,
        a.gps_ok,
        a.device_ok,
        a.ip
      FROM attendance_logs a
      LEFT JOIN employees e ON e.id = a.employee_id
      WHERE a.store_id = ?
        AND strftime('%Y-%m', datetime(a.created_at, '+5 hours', '+30 minutes')) = ?
        AND a.event_type IN (${placeholders})
      ORDER BY a.id ASC
      `,
      [storeId, month, ...MANAGER_VISIBLE_EVENTS]
    );

    const openMin = parseSqliteTimeToMinutes(store.open_time);
    const graceMin = store.grace_enabled ? Number(store.grace_minutes || 10) : 0;

    const header = [
      "store",
      "date",
      "time_12hr",
      "employee",
      "event",
      "status",
      "late_by_min",
      "gps_ok",
      "device_ok",
      "ip"
    ];

    const lines = [header.join(",")];

    for (const r of rows) {
      const parts = String(r.created_at_ist || "").split(" ");
      const datePart = parts[0] || "";
      const timePart = parts[1] || "";
      const time12 = to12Hour(timePart);

      let status = "";
      let late_by_min = "";

      if (r.event_type === "checkin" && r.employee_email && openMin !== null) {
        const tMin = parseSqliteTimeToMinutes(timePart);
        const cutoff = openMin + graceMin;
        if (tMin !== null) {
          if (tMin <= cutoff) status = "ON_TIME";
          else {
            status = "LATE";
            late_by_min = String(tMin - cutoff);
          }
        }
      }

      const row = [
        `"${String(store.name).replace(/"/g, '""')}"`,
        `"${datePart}"`,
        `"${time12}"`,
        `"${String(r.employee_email || "").replace(/"/g, '""')}"`,
        `"${String(r.event_type || "")}"`,
        `"${status}"`,
        `"${late_by_min}"`,
        r.gps_ok ? "1" : "0",
        r.device_ok ? "1" : "0",
        `"${String(r.ip || "").replace(/"/g, '""')}"`
      ];

      lines.push(row.join(","));
    }

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="manager_logs_${storeId}_${month}.csv"`
    );
    res.send(lines.join("\n"));
  } catch (err) {
    console.error("Manager logs_month.csv error:", err);
    return res.status(500).send("Server error");
  }
});

// -------- Employees (view/add/toggle/reset-device) --------

router.get("/store/:storeId/employees", requireManager, async (req, res) => {
  try {
    const managerId = req.session.managerId;
    const adminId = req.session.managerAdminId;
    const storeId = Number(req.params.storeId);

    const store = await getManagerStoreOrNull(managerId, adminId, storeId);
    if (!store) return res.status(404).send("Store not found.");

    const employees = await dbAll(
      `
      SELECT
        e.id,
        e.email,
        e.is_active,
        e.created_at,
        CASE
          WHEN EXISTS (SELECT 1 FROM employee_devices d WHERE d.employee_id = e.id)
          THEN 1 ELSE 0
        END AS device_registered
      FROM employees e
      WHERE e.store_id = ?
      ORDER BY e.id DESC
      `,
      [storeId]
    );

    return res.renderPage("manager/employees_list", {
      title: "Employees",
      store,
      employees,
      msg: req.query.msg || null
    });
  } catch (err) {
    console.error("Manager employees list error:", err);
    return res.status(500).send("Server error");
  }
});

router.get("/store/:storeId/employees/new", requireManager, async (req, res) => {
  try {
    const managerId = req.session.managerId;
    const adminId = req.session.managerAdminId;
    const storeId = Number(req.params.storeId);

    const store = await getManagerStoreOrNull(managerId, adminId, storeId);
    if (!store) return res.status(404).send("Store not found.");

    return res.renderPage("manager/employee_new", {
      title: "Add Employee",
      store,
      error: null
    });
  } catch (err) {
    console.error("Manager employee new page error:", err);
    return res.status(500).send("Server error");
  }
});

router.post("/store/:storeId/employees/new", requireManager, async (req, res) => {
  try {
    const managerId = req.session.managerId;
    const adminId = req.session.managerAdminId;
    const storeId = Number(req.params.storeId);

    const store = await getManagerStoreOrNull(managerId, adminId, storeId);
    if (!store) return res.status(404).send("Store not found.");

    const email = String(req.body.email || "").trim().toLowerCase();
    const pin = String(req.body.pin || "").trim();

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return res.renderPage("manager/employee_new", {
        title: "Add Employee",
        store,
        error: "Enter a valid email."
      });
    }

    if (!/^\d{4,8}$/.test(pin)) {
      return res.renderPage("manager/employee_new", {
        title: "Add Employee",
        store,
        error: "PIN must be 4 to 8 digits."
      });
    }

    const existing = await dbGet("SELECT id FROM employees WHERE store_id = ? AND email = ?", [
      storeId,
      email
    ]);
    if (existing) {
      return res.renderPage("manager/employee_new", {
        title: "Add Employee",
        store,
        error: "Employee already exists for this store."
      });
    }

    const pin_hash = await bcrypt.hash(pin, 12);

    await dbRun("INSERT INTO employees (store_id, email, pin_hash, is_active) VALUES (?, ?, ?, 1)", [
      storeId,
      email,
      pin_hash
    ]);

    return res.redirect(
      `/manager/store/${storeId}/employees?msg=` +
        encodeURIComponent("Employee added. They can login with email + PIN.")
    );
  } catch (err) {
    console.error("Manager create employee error:", err);
    return res.status(500).send("Server error");
  }
});

router.post("/store/:storeId/employees/:employeeId/toggle", requireManager, async (req, res) => {
  try {
    const managerId = req.session.managerId;
    const adminId = req.session.managerAdminId;
    const storeId = Number(req.params.storeId);
    const employeeId = Number(req.params.employeeId);

    const store = await getManagerStoreOrNull(managerId, adminId, storeId);
    if (!store) return res.status(404).send("Store not found.");

    const emp = await dbGet("SELECT id, is_active FROM employees WHERE id = ? AND store_id = ?", [
      employeeId,
      storeId
    ]);
    if (!emp) return res.status(404).send("Employee not found.");

    const newVal = emp.is_active ? 0 : 1;

    await dbRun("UPDATE employees SET is_active = ? WHERE id = ? AND store_id = ?", [
      newVal,
      employeeId,
      storeId
    ]);

    return res.redirect(`/manager/store/${storeId}/employees`);
  } catch (err) {
    console.error("Manager toggle employee error:", err);
    return res.status(500).send("Server error");
  }
});

// Reset device lock (manager allowed)
router.post("/store/:storeId/employees/:employeeId/device/reset", requireManager, async (req, res) => {
  try {
    const managerId = req.session.managerId;
    const adminId = req.session.managerAdminId;
    const storeId = Number(req.params.storeId);
    const employeeId = Number(req.params.employeeId);

    const store = await getManagerStoreOrNull(managerId, adminId, storeId);
    if (!store) return res.status(404).send("Store not found.");

    const emp = await dbGet("SELECT id FROM employees WHERE id = ? AND store_id = ?", [
      employeeId,
      storeId
    ]);
    if (!emp) return res.status(404).send("Employee not found.");

    await dbRun("DELETE FROM employee_devices WHERE employee_id = ?", [employeeId]);

    return res.redirect(
      `/manager/store/${storeId}/employees?msg=` +
        encodeURIComponent("Device reset. Employee can login again with email + PIN.")
    );
  } catch (err) {
    console.error("Manager reset device error:", err);
    return res.status(500).send("Server error");
  }
});

// -------- Logout (LOGOUT EVERYWHERE) --------
router.get("/logout", requireManager, async (req, res) => {
  try {
    const managerId = req.session?.managerId || null;

    if (managerId) {
      await dbRun("UPDATE managers SET session_version = session_version + 1 WHERE id = ?", [
        Number(managerId)
      ]);
    }

    if (!req.session) return res.redirect("/admin/login");
    req.session.destroy(() => res.redirect("/admin/login"));
  } catch (e) {
    console.error("[MANAGER LOGOUT]", e);
    if (req.session) {
      req.session.destroy(() => res.redirect("/admin/login"));
    } else {
      res.redirect("/admin/login");
    }
  }
});

module.exports = router;
