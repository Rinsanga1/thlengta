const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const REMEMBER_ME_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

function setRememberMeCookie(req, remember) {
  if (!req.session || !req.session.cookie) return;
  if (remember) req.session.cookie.maxAge = REMEMBER_ME_MS;
  else req.session.cookie.expires = false; // session cookie
}

function deleteSessionsByNeedle(needle) {
  return new Promise((resolve, reject) => {
    try {
      const sessionsDbPath = path.join(process.cwd(), "sessions.sqlite");
      const db = new sqlite3.Database(sessionsDbPath, (err) => {
        if (err) return reject(err);
      });

      const like = `%${needle}%`;

      db.run("DELETE FROM sessions WHERE sess LIKE ?", [like], function (err) {
        db.close(() => {});
        if (err) return reject(err);
        return resolve(this.changes || 0);
      });
    } catch (e) {
      return reject(e);
    }
  });
}

module.exports = {
  setRememberMeCookie,
  deleteSessionsByNeedle,
};
