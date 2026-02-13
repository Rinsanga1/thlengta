const { dbRun } = require("../../db/helpers");

// Handles manager logout
exports.destroy = async (req, res) => {
  try {
    const managerId = req.session?.managerId || null;

    if (managerId) {
      // Invalidate all sessions for this manager by incrementing session_version
      // The requireManager middleware will then automatically log out sessions
      await dbRun("UPDATE managers SET session_version = session_version + 1 WHERE id = ?", [
        Number(managerId)
      ]);
    }

    if (!req.session) return res.redirect("/admin/login");
    req.session.destroy(() => res.redirect("/admin/login"));
  } catch (e) {
    console.error("[MANAGER LOGOUT]", e);
    if (req.session) {
      req.session.destroy(() => res.redirect("/admin/login"));
    } else {
      res.redirect("/admin/login");
    }
  }
};
