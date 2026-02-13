const { dbGet } = require("../db/helpers");
const {
  todayIST_yyyy_mm_dd,
  parseSqliteDateTimeToMs,
  parseOpenTimeToMinutes,
  getNowMinutesKolkata,
} = require("./time.utils"); // Import from our time utils

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

module.exports = {
  decideNextStepForToday,
  isTooSoon,
  computeCheckinTimeStatus,
};
