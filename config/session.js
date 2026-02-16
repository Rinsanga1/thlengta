const session = require("express-session");
const { BunSqliteSessionStore } = require("./sessionStore");
const crypto = require("crypto");
const path = require("path");

function createSessionMiddleware() {
  const dbPath = path.join(process.cwd(), "data.sqlite");
  const sessionDb = new (require("bun:sqlite").Database)(dbPath);
  
  const store = new BunSqliteSessionStore(sessionDb, {
    tableName: 'sessions',
    ttl: 7 * 24 * 60 * 60 * 1000,
    cleanupInterval: 15 * 60 * 1000,
  });

  const secret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

  return session({
    store,
    secret,
    name: 'thlengta_session',
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    },
  });
}

function createSuperadminSessionMiddleware() {
  const dbPath = path.join(process.cwd(), "data.sqlite");
  const sessionDb = new (require("bun:sqlite").Database)(dbPath);
  
  const store = new BunSqliteSessionStore(sessionDb, {
    tableName: 'sessions',
    ttl: 24 * 60 * 60 * 1000,
    cleanupInterval: 15 * 60 * 1000,
  });

  const secret = process.env.SUPERADMIN_SESSION_SECRET || crypto.randomBytes(32).toString('hex');

  return session({
    store,
    secret,
    name: 'thlengta_admin',
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    },
  });
}

module.exports = { createSessionMiddleware, createSuperadminSessionMiddleware };
