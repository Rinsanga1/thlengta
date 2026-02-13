const path = require("path");
const { Database } = require("bun:sqlite");

const REMEMBER_ME_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

function setRememberMeCookie(req, remember) {
  if (!req.session || !req.session.cookie) return;
  if (remember) req.session.cookie.maxAge = REMEMBER_ME_MS;
  else req.session.cookie.expires = false; // session cookie
}

function deleteSessionsByNeedle(needle) {
  const sessionsDbPath = path.join(process.cwd(), "sessions.sqlite");
  const db = new Database(sessionsDbPath);
  
  const like = `%${needle}%`;
  const stmt = db.prepare("DELETE FROM sessions WHERE sess LIKE ?");
  const result = stmt.run(like);
  
  return result.changes || 0;
}

module.exports = {
  setRememberMeCookie,
  deleteSessionsByNeedle,
};
