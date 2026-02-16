const session = require("express-session");
const { BunSqliteSessionStore } = require("./sessionStore");
const crypto = require("crypto");

function createSessionMiddleware(db) {
  const store = new BunSqliteSessionStore(db, {
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

function createSuperadminSessionMiddleware(db) {
  const store = new BunSqliteSessionStore(db, {
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
