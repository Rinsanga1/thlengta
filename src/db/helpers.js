const { openDb } = require("./database");

// Promise wrappers for sqlite3
function dbGet(sql, params = []) {
  const db = openDb();
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      db.close();
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function dbAll(sql, params = []) {
  const db = openDb();
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      db.close();
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function dbRun(sql, params = []) {
  const db = openDb();
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      db.close();
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

module.exports = { dbGet, dbAll, dbRun };
