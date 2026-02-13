const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "data.sqlite");
const SCHEMA_PATH = path.join(__dirname, "schema.sql");

function openDb() {
  return new sqlite3.Database(DB_PATH);
}

function initDb() {
  return new Promise((resolve, reject) => {
    const db = openDb();
    const schema = fs.readFileSync(SCHEMA_PATH, "utf-8");
    db.exec(schema, (err) => {
      if (err) return reject(err);
      resolve(db);
    });
  });
}

module.exports = { openDb, initDb, DB_PATH };
