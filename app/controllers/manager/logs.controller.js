const { dbGet, dbAll, dbRun } = require("../../../db/helpers");
const { getManagerWorkplaceOrNull } = require("../../utils/manager.utils");
const { todayIST_yyyy_mm_dd, parseSqliteTimeToMinutes, to12Hour } = require("../../utils/time.utils");
const { sqlInListPlaceholders } = require("../../utils/db.utils");

const MANAGER_VISIBLE_EVENTS = [
  "checkin",
  "checkout",
  "break_start",
  "break_end",
  "denied_device",
  "denied_gps",
  "failed_not_logged_in",
  "failed_workplace_not_found",
  "failed_not_employee",
  "failed_gps_required",
  "failed_already_checked_out",
  "failed_duplicate_scan",
  "failed_invalid_pin",
  "failed_employee_not_found"
];

async function cleanupOldLogs(workplaceId) {
  await dbRun(
    `
    DELETE FROM attendance_logs
    WHERE workplace_id = ?
      AND datetime(created_at) < datetime('now', '-90 days')
    `,
    [workplaceId]
  );
}

// Lists attendance logs for a given workplace and date (index action)
exports.index = async (req, res) => {
  try {
    const managerId = req.session.managerId;
    const adminId = req.session.managerAdminId;
    const workplaceId = Number(req.params.workplaceId);

    const workplace = await getManagerWorkplaceOrNull(managerId, adminId, workplaceId);
    if (!workplace) return res.status(404).send("Workplace not found.");

    await cleanupOldLogs(workplaceId);

    const selectedDate = String(req.query.date || todayIST_yyyy_mm_dd());
    const placeholders = sqlInListPlaceholders(MANAGER_VISIBLE_EVENTS.length);

    const rows = await dbAll(
      `
      SELECT
        a.id,
        a.event_type,
        a.location_verified AS gps_ok,
        a.device_verified AS device_ok,
        a.ip,
        datetime(a.created_at, '+5 hours', '+30 minutes') AS created_at_ist,
        e.email AS employee_email
      FROM attendance_logs a
      LEFT JOIN employees e ON e.id = a.employee_id
      WHERE a.workplace_id = ?
        AND date(datetime(a.created_at, '+5 hours', '+30 minutes')) = ?
        AND a.event_type IN (${placeholders})
      ORDER BY a.id DESC
      `,
      [workplaceId, selectedDate, ...MANAGER_VISIBLE_EVENTS]
    );

    const openMin = parseSqliteTimeToMinutes(workplace.open_time);
    const graceMin = workplace.grace_enabled ? Number(workplace.grace_minutes || 10) : 0;

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

    return res.renderPage("manager/logs/index", {
      title: "Attendance Logs",
      workplace,
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
    const workplaceId = Number(req.params.workplaceId);

    const workplace = await getManagerWorkplaceOrNull(managerId, adminId, workplaceId);
    if (!workplace) return res.status(404).send("Workplace not found.");

    await cleanupOldLogs(workplaceId);

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
        a.location_verified AS gps_ok,
        a.device_verified AS device_ok,
        a.ip
      FROM attendance_logs a
      LEFT JOIN employees e ON e.id = a.employee_id
      WHERE a.workplace_id = ?
        AND date(datetime(a.created_at, '+5 hours', '+30 minutes')) = ?
        AND a.event_type IN (${placeholders})
      ORDER BY a.id ASC
      `,
      [workplaceId, selectedDate, ...MANAGER_VISIBLE_EVENTS]
    );

    const openMin = parseSqliteTimeToMinutes(workplace.open_time);
    const graceMin = workplace.grace_enabled ? Number(workplace.grace_minutes || 10) : 0;

    const header = [
      "workplace",
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
        `"${String(workplace.name).replace(/"/g, '""')}"`,
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
      `attachment; filename="manager_logs_${workplaceId}_${selectedDate}.csv"`
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
    const workplaceId = Number(req.params.workplaceId);

    const workplace = await getManagerWorkplaceOrNull(managerId, adminId, workplaceId);
    if (!workplace) return res.status(404).send("Workplace not found.");

    await cleanupOldLogs(workplaceId);

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
        a.location_verified AS gps_ok,
        a.device_verified AS device_ok,
        a.ip
      FROM attendance_logs a
      LEFT JOIN employees e ON e.id = a.employee_id
      WHERE a.workplace_id = ?
        AND strftime('%Y-%m', datetime(a.created_at, '+5 hours', '+30 minutes')) = ?
        AND a.event_type IN (${placeholders})
      ORDER BY a.id ASC
      `,
      [workplaceId, month, ...MANAGER_VISIBLE_EVENTS]
    );

    const openMin = parseSqliteTimeToMinutes(workplace.open_time);
    const graceMin = workplace.grace_enabled ? Number(workplace.grace_minutes || 10) : 0;

    const header = [
      "workplace",
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
        `"${String(workplace.name).replace(/"/g, '""')}"`,
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
      `attachment; filename="manager_logs_${workplaceId}_${month}.csv"`
    );
    res.send(lines.join("\n"));
  } catch (err) {
    console.error("Manager logs_month.csv error:", err);
    return res.status(500).send("Server error");
  }
};
