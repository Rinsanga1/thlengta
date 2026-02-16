const path = require("path");
const fs = require("fs");

const { Database } = require("bun:sqlite");

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "data.sqlite");
const SCHEMA_PATH = path.join(__dirname, "schema.sql");

let db = null;


// should this function not take an argument "db"
// like this openDb(db)
function openDb() {
  if (!db) {
    // if there is not db, create a new db
    // this condition will always be true no
    db = new Database(DB_PATH);
  }
  return db;
}

// getDb() -> runs openDb() -> creates a new db always
function getDb() {
  return openDb();
}

// initDB run
function initDb() {
  // create a new promise
  return new Promise((resolve) => {
    // this creates new db
    const database = openDb();
    const schema = fs.readFileSync(SCHEMA_PATH, "utf-8");
    database.exec(schema);
    resolve(database);
  });
}

module.exports = { openDb, getDb, initDb, DB_PATH };
