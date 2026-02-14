const { dbGet } = require("../db/helpers");

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

async function requireOwner(req, res, next) {
  try {
    if (!req.session || !req.session.adminId) {
      return res.redirect("/owner/login");
    }

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
  } catch (e) {
    console.error("requireOwner error:", e);
    clearAdminSession(req);
    return res.redirect("/owner/login");
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

module.exports = { requireOwner, requireManager };
