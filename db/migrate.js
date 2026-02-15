const fs = require("fs");
const path = require("path");
const { Database } = require("bun:sqlite");

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "data.sqlite");

const MIGRATIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS _migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`;

function getDb() {
  return new Database(DB_PATH);
}

function getAppliedMigrations(db) {
  const stmt = db.prepare("SELECT name FROM _migrations ORDER BY id");
  return stmt.all().map(row => row.name);
}

function markMigrationApplied(db, name) {
  const stmt = db.prepare("INSERT INTO _migrations (name) VALUES (?)");
  stmt.run(name);
}

async function migrateUp() {
  const db = getDb();
  
  db.exec(MIGRATIONS_TABLE);
  
  const applied = getAppliedMigrations(db);
  const migrationsDir = path.join(__dirname, "migrations");
  
  if (!fs.existsSync(migrationsDir)) {
    console.log("No migrations directory found");
    return;
  }
  
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith(".sql"))
    .sort();
  
  let appliedCount = 0;
  
  for (const file of files) {
    if (!applied.includes(file)) {
      console.log(`Applying migration: ${file}`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
      db.exec(sql);
      markMigrationApplied(db, file);
      appliedCount++;
    }
  }
  
  if (appliedCount === 0) {
    console.log("No pending migrations");
  } else {
    console.log(`Applied ${appliedCount} migration(s)`);
  }
}

async function migrateDown(n = 1) {
  const db = getDb();
  
  const stmt = db.prepare("SELECT name FROM _migrations ORDER BY id DESC LIMIT ?");
  const toRollback = stmt.all(n);
  
  if (toRollback.length === 0) {
    console.log("No migrations to rollback");
    return;
  }
  
  console.log(`Rolling back ${toRollback.length} migration(s)`);
  
  for (const { name } of toRollback) {
    console.log(`Rolling back: ${name}`);
    const deleteStmt = db.prepare("DELETE FROM _migrations WHERE name = ?");
    deleteStmt.run(name);
  }
}

async function migrateStatus() {
  const db = getDb();
  
  db.exec(MIGRATIONS_TABLE);
  
  const applied = getAppliedMigrations(db);
  const migrationsDir = path.join(__dirname, "migrations");
  
  if (!fs.existsSync(migrationsDir)) {
    console.log("No migrations directory");
    return;
  }
  
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith(".sql"))
    .sort();
  
  console.log("\nMigration Status:");
  console.log("-----------------");
  
  for (const file of files) {
    const status = applied.includes(file) ? "✓ applied" : "✗ pending";
    console.log(`${status}  ${file}`);
  }
  
  console.log(`\nTotal: ${files.length} migrations, ${applied.length} applied, ${files.length - applied.length} pending\n`);
}

const command = process.argv[2] || "status";

if (command === "up") {
  migrateUp().then(() => process.exit(0));
} else if (command === "down") {
  const n = parseInt(process.argv[3]) || 1;
  migrateDown(n).then(() => process.exit(0));
} else if (command === "status") {
  migrateStatus().then(() => process.exit(0));
} else {
  console.log("Usage: node migrate.js [up|down|status]");
  process.exit(1);
}
