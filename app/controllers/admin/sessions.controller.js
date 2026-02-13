const bcrypt = require("bcryptjs");
const { dbGet } = require("../../db/helpers");
const { setRememberMeCookie, deleteSessionsByNeedle } = require("../../utils/session.utils");
const { parseSqliteDateTimeToMs } = require("../../utils/time.utils");

// Renders the login form
exports.new = (req, res) => {
  if (req.session?.adminId) {
    return res.redirect("/admin/dashboard");
  }
  if (req.session?.managerId && req.session?.managerAdminId) {
    return res.redirect("/manager/dashboard");
  }
  res.renderPage("admin/sessions/new", {
    title: "Login",
    error: null
  });
};

// Handles login form submission (authentication)
exports.create = async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const rememberMe = String(req.body.remember_me || "") === "on";

    const invalid = () =>
      res.renderPage("admin/sessions/new", { title: "Login", error: "Invalid credentials." });

    favicon: "/assets/img/favicon.ico",
    blocked = (msg) => res.renderPage("admin/sessions/new", { title: "Login", error: msg });

    // 1) Try ADMIN login
    const admin = await dbGet(
      "SELECT id, password_hash, status, expires_at FROM admins WHERE email = ?",
      [email]
    );

    if (admin) {
      const ok = await bcrypt.compare(password, admin.password_hash);
      if (!ok) return invalid();

      if (admin.status !== "active") return blocked("Your account is pending approval or disabled.");
      if (!admin.expires_at) return blocked("Your account is not active yet. Please contact support.");

      const expMs = parseSqliteDateTimeToMs(admin.expires_at);
      if (!expMs) return blocked("Your account expiry is invalid. Please contact support.");
      if (expMs < Date.now()) return blocked("Your subscription has expired. Please contact support.");

      delete req.session.managerId;
      delete req.session.managerAdminId;

      req.session.adminId = admin.id;
      setRememberMeCookie(req, rememberMe);

      return res.redirect("/admin/dashboard");
    }

    // 2) Try MANAGER login
    const manager = await dbGet(
      "SELECT id, admin_id, email, password_hash, is_active FROM managers WHERE email = ?",
      [email]
    );

    if (!manager) return invalid();
    if (!manager.is_active) return blocked("Your manager account is disabled. Contact your admin.");

    const okMgr = await bcrypt.compare(password, manager.password_hash);
    if (!okMgr) return invalid();

    const parentAdmin = await dbGet(
      "SELECT id, status, expires_at FROM admins WHERE id = ?",
      [manager.admin_id]
    );

    if (!parentAdmin) return blocked("Your admin account was not found. Please contact support.");
    if (parentAdmin.status !== "active") return blocked("Your admin account is not active.");
    if (!parentAdmin.expires_at) return blocked("Your admin account is not active yet.");

    const expMs2 = parseSqliteDateTimeToMs(parentAdmin.expires_at);
    if (!expMs2) return blocked("Your admin account expiry is invalid.");
    if (expMs2 < Date.now()) return blocked("Your subscription has expired.");

    delete req.session.adminId;
    req.session.managerId = manager.id;
    req.session.managerAdminId = manager.admin_id;
    setRememberMeCookie(req, rememberMe);

    return res.redirect("/manager/dashboard");
  } catch (err) {
    console.error(err);
    return res.renderPage("admin/sessions/new", { title: "Login", error: "Something went wrong." });
  }
};

// Handles logout
exports.destroy = async (req, res) => {
  try {
    const adminId = req.session?.adminId || null;
    const managerId = req.session?.managerId || null;

    const destroyCurrent = () =>
      new Promise((resolve) => {
        if (!req.session) return resolve();
        req.session.destroy(() => resolve());
      });

    if (adminId) {
      await deleteSessionsByNeedle(`"adminId":${Number(adminId)}`);
    } else if (managerId) {
      await deleteSessionsByNeedle(`"managerId":${Number(managerId)}`);
    }

    await destroyCurrent();
    return res.redirect("/admin/login");
  } catch (e) {
    console.error("[LOGOUT]", e);
    if (req.session) {
      req.session.destroy(() => res.redirect("/admin/login"));
    } else {
      res.redirect("/admin/login");
    }
  }
};
