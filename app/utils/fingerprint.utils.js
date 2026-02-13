const crypto = require("crypto");
const { dbGet, dbRun } = require("../db/helpers"); // Assuming db/helpers is in parent directory

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

function buildFpString(body) {
  const tz = String(body.fp_tz || "").trim();
  const sw = String(body.fp_sw || "").trim();
  const sh = String(body.fp_sh || "").trim();
  const dpr = String(body.fp_dpr || "").trim();
  const lang = String(body.fp_lang || "").trim();
  const platform = String(body.fp_platform || "").trim();

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

module.exports = {
  ensureFpTable,
  buildFpString,
  fpHashFromBody,
  getStoredFpHash,
  upsertFpHash,
};
