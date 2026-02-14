const { dbGet } = require("../db/helpers");

// Helper: get owner ID from either user or admin session
function getOwnerId(req) {
  return req.session?.userId || req.session?.adminId || null;
}

// Helper: get owner type ('user' or 'admin')
function getOwnerType(req) {
  if (req.session?.userId) return 'user';
  if (req.session?.adminId) return 'admin';
  return null;
}

// Helper: hard logout for admin sessions
function clearAdminSession(req) {
  if (!req.session) return;
  delete req.session.adminId;
  delete req.session.managerId;
  delete req.session.managerAdminId;
  delete req.session.sessionVersion;
}

// Helper: hard logout for manager sessions
function clearManagerSession(req) {
  if (!req.session) return;
  delete req.session.managerId;
  delete req.session.managerAdminId;
  delete req.session.adminId;
  delete req.session.sessionVersion;
}

// Helper: hard logout for user sessions
function clearUserSession(req) {
  if (!req.session) return;
  delete req.session.userId;
}

// Middleware: require owner (either from admins table or users table)
async function requireOwner(req, res, next) {
  try {
    // Check for userId (new users table)
    if (req.session?.userId) {
      const userId = Number(req.session.userId);
      const user = await dbGet("SELECT id, status FROM users WHERE id = ?", [userId]);

      if (!user || user.status !== "active") {
        clearUserSession(req);
        return res.redirect("/users/signin");
      }

      return next();
    }

    // Check for adminId (legacy admins table)
    if (req.session?.adminId) {
      const adminId = Number(req.session.adminId);

      const row = await dbGet(
        "SELECT id, session_version, status, expires_at FROM admins WHERE id = ?",
        [adminId]
      );

      if (!row || row.status !== "active" || !row.expires_at) {
        clearAdminSession(req);
        return res.redirect("/owner/login");
      }

      const dbVer = Number(row.session_version || 0);

      // Backward compatibility: if sessionVersion missing, attach it now
      if (req.session.sessionVersion === undefined || req.session.sessionVersion === null) {
        req.session.sessionVersion = dbVer;
        return next();
      }

      const sessVer = Number(req.session.sessionVersion || 0);

      if (dbVer !== sessVer) {
        clearAdminSession(req);
        return res.redirect("/owner/login");
      }

      return next();
    }

    // No session found - redirect to sign in
    return res.redirect("/users/signin");
  } catch (e) {
    console.error("requireOwner error:", e);
    clearUserSession(req);
    return res.redirect("/users/signin");
  }
}

async function requireManager(req, res, next) {
  try {
    if (!req.session || !req.session.managerId || !req.session.managerAdminId) {
      return res.redirect("/owner/login");
    }

    const managerId = Number(req.session.managerId);
    const adminId = Number(req.session.managerAdminId);

    const mgr = await dbGet(
      "SELECT id, admin_id, is_active, session_version FROM managers WHERE id = ?",
      [managerId]
    );

    if (!mgr || !mgr.is_active || Number(mgr.admin_id) !== adminId) {
      clearManagerSession(req);
      return res.redirect("/owner/login");
    }

    const dbVer = Number(mgr.session_version || 0);

    // Backward compatibility: if sessionVersion missing, attach it now
    if (req.session.sessionVersion === undefined || req.session.sessionVersion === null) {
      req.session.sessionVersion = dbVer;
      return next();
    }

    const sessVer = Number(req.session.sessionVersion || 0);

    if (dbVer !== sessVer) {
      clearManagerSession(req);
      return res.redirect("/owner/login");
    }

    return next();
  } catch (e) {
    console.error("requireManager error:", e);
    clearManagerSession(req);
    return res.redirect("/owner/login");
  }
}

module.exports = { requireOwner, requireManager, getOwnerId, getOwnerType };
