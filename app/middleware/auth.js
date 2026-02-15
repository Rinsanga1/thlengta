const { dbGet } = require("../db/helpers");

function getOwnerId(req) {
  return req.session?.userId || null;
}

function getOwnerType(req) {
  if (req.session?.userId) return 'user';
  return null;
}

function clearUserSession(req) {
  if (!req.session) return;
  delete req.session.userId;
  delete req.session.managerId;
  delete req.session.managerUserId;
}

function clearManagerSession(req) {
  if (!req.session) return;
  delete req.session.managerId;
  delete req.session.managerUserId;
  delete req.session.userId;
}

async function requireOwner(req, res, next) {
  try {
    if (req.session?.userId) {
      const userId = Number(req.session.userId);
      const user = await dbGet("SELECT id, status FROM users WHERE id = ?", [userId]);

      if (!user || user.status !== "active") {
        clearUserSession(req);
        return res.redirect("/users/signin");
      }

      return next();
    }

    if (req.session?.managerId) {
      const managerId = Number(req.session.managerId);

      const mgr = await dbGet(
        "SELECT id, user_id, is_active FROM managers WHERE id = ?",
        [managerId]
      );

      if (!mgr || !mgr.is_active) {
        clearManagerSession(req);
        return res.redirect("/users/signin");
      }

      return next();
    }

    return res.redirect("/users/signin");
  } catch (e) {
    console.error("requireOwner error:", e);
    return res.redirect("/users/signin");
  }
}

async function requireManager(req, res, next) {
  try {
    if (!req.session || !req.session.managerId || !req.session.managerUserId) {
      return res.redirect("/users/signin");
    }

    const managerId = Number(req.session.managerId);
    const userId = Number(req.session.managerUserId);

    const mgr = await dbGet(
      "SELECT id, user_id, is_active FROM managers WHERE id = ?",
      [managerId]
    );

    if (!mgr || !mgr.is_active || Number(mgr.user_id) !== userId) {
      clearManagerSession(req);
      return res.redirect("/users/signin");
    }

    return next();
  } catch (e) {
    console.error("requireManager error:", e);
    clearManagerSession(req);
    return res.redirect("/users/signin");
  }
}

module.exports = { requireOwner, requireManager, getOwnerId, getOwnerType };
