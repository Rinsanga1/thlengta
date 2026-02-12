const { dbGet } = require("../db/helpers");

async function requireSuperAdmin(req, res, next) {
  try {
    const sid = req.session && req.session.superAdminId;
    if (!sid) return res.redirect("/superadmin/login");

    const sa = await dbGet(
      "SELECT id, is_active, session_version FROM super_admins WHERE id = ?",
      [sid]
    );

    if (!sa || !sa.is_active) {
      if (req.session) req.session.superAdminId = null;
      return res.redirect("/superadmin/login");
    }

    // Enforce logout-everywhere
    const dbVer = Number(sa.session_version || 1);
    const sesVer = Number(req.session.sessionVersion || 0);

    if (!sesVer || sesVer !== dbVer) {
      // Session is stale (someone logged out everywhere)
      req.session.destroy(() => res.redirect("/superadmin/login"));
      return;
    }

    next();
  } catch (e) {
    console.error(e);
    return res.status(500).send("Server error");
  }
}

module.exports = { requireSuperAdmin };
