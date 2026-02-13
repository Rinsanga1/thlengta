function parseSqliteDateTimeToMs(sqliteDt) {
  if (!sqliteDt) return null;
  const s = String(sqliteDt).trim();
  if (!s) return null;

  if (s.includes("T")) {
    const ms = Date.parse(s);
    return Number.isFinite(ms) ? ms : null;
  }

  const iso = s.replace(" ", "T") + "Z";
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
function todayIST_yyyy_mm_dd() {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return fmt.format(new Date());
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

function addYears(date, years) {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + years);
  return d;
}

function toISODateTime(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return (
    d.getFullYear() +
    "-" +
    pad(d.getMonth() + 1) +
    "-" +
    pad(d.getDate()) +
    " " +
    pad(d.getHours()) +
    ":" +
    pad(d.getMinutes()) +
    ":" +
    pad(d.getSeconds())
  );
}

function toSqliteDateTimeFromInput(s) {
  if (!s) return null;
  const str = String(s).trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(str)) return null;
  return str.replace("T", " ") + ":00";
}

function toDateTimeLocalValue(sqliteDt) {
  if (!sqliteDt) return "";
  const s = String(sqliteDt);
  if (s.includes("T")) return s.slice(0, 16);
  return s.replace(" ", "T").slice(0, 16);
}

module.exports = {
  parseSqliteDateTimeToMs,
  todayIST_yyyy_mm_dd,
  to12Hour,
  parseSqliteTimeToMinutes,
  getNowMinutesKolkata,
  parseOpenTimeToMinutes,
  addYears,
  toISODateTime,
  toSqliteDateTimeFromInput,
  toDateTimeLocalValue,
};
