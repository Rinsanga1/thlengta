const { dbGet, dbAll, dbRun } = require("../../db/helpers");
const { getManagerStoreOrNull } = require("../../utils/manager.utils");
const { todayIST_yyyy_mm_dd, parseSqliteTimeToMinutes, to12Hour } = require("../../utils/time.utils");
const { sqlInListPlaceholders } = require("../../utils/db.utils");

const MANAGER_VISIBLE_EVENTS = [
  "checkin",
  "checkout",
  "break_start",
  "break_end",
  "denied_device",
  "denied_gps"
];

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

// Lists attendance logs for a given store and date (index action)
exports.index = async (req, res) => {
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

    return res.renderPage("manager/logs/index", { // Renamed view
      title: "Attendance Logs",
      store,
      selectedDate,
      logs
    });
  } catch (err) {
    console.error("Manager logs error:", err);
    return res.status(500).send("Server error");
  }
};

// Downloads daily attendance logs as CSV
exports.downloadDayCsv = async (req, res) => {
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
};

// Downloads monthly attendance logs as CSV
exports.downloadMonthCsv = async (req, res) => {
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
};
