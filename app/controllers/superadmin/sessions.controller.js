const bcrypt = require("bcryptjs");
const { dbGet, dbRun } = require("../../../db/helpers");

// Renders the superadmin login form
exports.new = (req, res) => {
  res.renderPage("superadmin/sessions/new", { title: "Super Admin Login", error: null }); // Renamed view
};

// Handles superadmin login form submission
exports.create = async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    const sa = await dbGet(
      "SELECT id, password_hash, is_active, session_version FROM super_admins WHERE email = ?",
      [email]
    );

    if (!sa || !sa.is_active) {
      return res.renderPage("superadmin/sessions/new", {
        title: "Super Admin Login",
        error: "Invalid credentials."
      });
    }

    const ok = await bcrypt.compare(password, sa.password_hash);
    if (!ok) {
      return res.renderPage("superadmin/sessions/new", {
        title: "Super Admin Login",
        error: "Invalid credentials."
      });
    }

    // Set session
    req.session.superAdminId = sa.id;
    req.session.sessionVersion = Number(sa.session_version || 1);

    const remember = String(req.body.remember || "").toLowerCase();
    if (remember === "yes" || remember === "1" || remember === "true" || remember === "on") {
      req.session.cookie.maxAge = 14 * 24 * 60 * 60 * 1000;
    } else {
      req.session.cookie.expires = false;
    }

    return res.redirect("/superadmin/dashboard");
  } catch (e) {
    console.error(e);
    return res.renderPage("superadmin/sessions/new", {
      title: "Super Admin Login",
      error: "Something went wrong."
    });
  }
};

// Handles superadmin logout
exports.destroy = async (req, res) => {
  try {
    const sid = req.session.superAdminId;
    if (sid) {
      await dbRun("UPDATE super_admins SET session_version = session_version + 1 WHERE id = ?", [sid]);
    }

    if (!req.session) return res.redirect("/superadmin/login");
    req.session.destroy(() => {
      return res.redirect("/superadmin/login");
    });
  } catch (e) {
    console.error("[SUPERADMIN LOGOUT]", e);
    if (req.session) {
      req.session.destroy(() => res.redirect("/superadmin/login"));
    } else {
      res.redirect("/superadmin/login");
    }
  }
};
