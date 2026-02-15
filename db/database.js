const path = require("path");
const fs = require("fs");

const { Database } = require("bun:sqlite");

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "data.sqlite");
const SCHEMA_PATH = path.join(__dirname, "schema.sql");

let db = null;

function openDb() {
  if (!db) {
    db = new Database(DB_PATH);
  }
  return db;
}

function initDb() {
  return new Promise((resolve) => {
    const database = openDb();
    const schema = fs.readFileSync(SCHEMA_PATH, "utf-8");
    database.exec(schema);
    resolve(database);
  });
}

module.exports = { openDb, initDb, DB_PATH };
