const { dbGet } = require("../db/helpers");

// Manager must be logged in AND the parent admin must still be active + not expired
async function requireManager(req, res, next) {
  try {
    const managerId = req.session.managerId;
    const managerAdminId = req.session.managerAdminId;

    if (!managerId || !managerAdminId) {
      return res.redirect("/admin/login");
    }

    const row = await dbGet(
      `
      SELECT
        m.id AS manager_id,
        m.is_active AS manager_active,
        a.id AS admin_id,
        a.status AS admin_status,
        a.expires_at AS admin_expires_at
      FROM managers m
      JOIN admins a ON a.id = m.admin_id
      WHERE m.id = ? AND m.admin_id = ?
      `,
      [managerId, managerAdminId]
    );

    if (!row) return res.redirect("/admin/login");
    if (!row.manager_active) return res.redirect("/admin/login");
    if (row.admin_status !== "active") return res.redirect("/admin/login");

    if (!row.admin_expires_at) return res.redirect("/admin/login");

    // admin_expires_at stored in SQLite as "YYYY-MM-DD HH:MM:SS" UTC-ish
    const iso = String(row.admin_expires_at).replace(" ", "T") + "Z";
    const expMs = Date.parse(iso);
    if (!Number.isFinite(expMs) || expMs < Date.now()) {
      return res.redirect("/admin/login");
    }

    return next();
  } catch (err) {
    console.error(err);
    return res.redirect("/admin/login");
  }
}


module.exports = { requireManager };
