const { openDb } = require("./database");

function dbGet(sql, params = []) {
  const db = openDb();
  const stmt = db.prepare(sql);
  const row = stmt.get(...params);
  return row || undefined;
}

function dbAll(sql, params = []) {
  const db = openDb();
  const stmt = db.prepare(sql);
  const rows = stmt.all(...params);
  return rows;
}

function dbRun(sql, params = []) {
  const db = openDb();
  const stmt = db.prepare(sql);
  const result = stmt.run(...params);
  return { lastID: result.lastInsertRowid, changes: result.changes };
}

module.exports = { dbGet, dbAll, dbRun };
