const { openDb } = require("./database");

const LOG_QUERIES = process.env.LOG_QUERIES === "true";

function log(sql, params) {
  if (LOG_QUERIES) {
    console.log("[DB]", sql, params?.length ? params : "");
  }
}

function dbGet(sql, params = []) {
  const db = openDb();
  log(sql, params);
  try {
    const stmt = db.prepare(sql);
    const row = stmt.get(...params);
    return row || undefined;
  } catch (err) {
    console.error("[DB ERROR] dbGet:", err.message, "SQL:", sql);
    throw err;
  }
}

function dbAll(sql, params = []) {
  const db = openDb();
  log(sql, params);
  try {
    const stmt = db.prepare(sql);
    const rows = stmt.all(...params);
    return rows;
  } catch (err) {
    console.error("[DB ERROR] dbAll:", err.message, "SQL:", sql);
    throw err;
  }
}

function dbRun(sql, params = []) {
  const db = openDb();
  log(sql, params);
  try {
    const stmt = db.prepare(sql);
    const result = stmt.run(...params);
    return { lastID: result.lastInsertRowid, changes: result.changes };
  } catch (err) {
    console.error("[DB ERROR] dbRun:", err.message, "SQL:", sql);
    throw err;
  }
}

function dbTransaction(fn) {
  const db = openDb();
  try {
    const transaction = db.transaction(() => fn(db));
    return transaction();
  } catch (err) {
    console.error("[DB ERROR] Transaction failed:", err.message);
    throw err;
  }
}

function sqlInListPlaceholders(n) {
  return Array.from({ length: n }, () => "?").join(",");

}

module.exports = {
  dbGet,
  dbAll,
  dbRun,
  dbTransaction,
  sqlInListPlaceholders,
};
