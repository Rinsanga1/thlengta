const { Database } = require("bun:sqlite");
const { EventEmitter } = require("events");
const { Session } = require("express-session");

class BunSqliteSessionStore extends EventEmitter {
  constructor(options = {}) {
    super();
    this.dbPath = options.db || "sessions.sqlite";
    this.db = new Database(this.dbPath);
    this.prefix = options.prefix || "sess:";
    this.ttl = options.ttl || 86400000;
    this.Session = Session;
    this.initTable();
  }

  initTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        sid TEXT PRIMARY KEY,
        sess TEXT NOT NULL,
        expired INTEGER NOT NULL
      )
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_sessions_expired ON sessions(expired)
    `);
  }

  get(sid, callback) {
    try {
      const stmt = this.db.prepare("SELECT sess, expired FROM sessions WHERE sid = ?");
      const row = stmt.get(sid);
      
      if (!row) {
        return callback(null, null);
      }

      if (row.expired * 1000 < Date.now()) {
        this.destroy(sid, callback);
        return callback(null, null);
      }

      const session = JSON.parse(row.sess);
      callback(null, session);
    } catch (err) {
      callback(err);
    }
  }

  set(sid, session, callback) {
    try {
      const sess = JSON.stringify(session);
      const maxAge = session.cookie && session.cookie.maxAge;
      const ttl = maxAge ? maxAge : this.ttl;
      const expired = Math.floor(Date.now() / 1000) + Math.floor(ttl / 1000);
      
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO sessions (sid, sess, expired) VALUES (?, ?, ?)
      `);
      stmt.run(sid, sess, expired);
      callback(null);
    } catch (err) {
      callback(err);
    }
  }

  destroy(sid, callback) {
    try {
      const stmt = this.db.prepare("DELETE FROM sessions WHERE sid = ?");
      stmt.run(sid);
      callback(null);
    } catch (err) {
      callback(err);
    }
  }

  touch(sid, session, callback) {
    try {
      const maxAge = session.cookie && session.cookie.maxAge;
      const ttl = maxAge ? maxAge : this.ttl;
      const expired = Math.floor(Date.now() / 1000) + Math.floor(ttl / 1000);
      const stmt = this.db.prepare("UPDATE sessions SET expired = ? WHERE sid = ?");
      stmt.run(expired, sid);
      callback(null);
    } catch (err) {
      callback(err);
    }
  }

  ready(callback) {
    callback(null);
  }

  createSession(req, session) {
    req.sessionID = session.id;
    req.session = new this.Session(req, session);
  }

  concurrency = 1;
}

module.exports = { BunSqliteSessionStore };
