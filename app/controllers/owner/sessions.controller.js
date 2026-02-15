const bcrypt = require("bcryptjs");
const { dbGet } = require("../../db/helpers");
const { setRememberMeCookie, deleteSessionsByNeedle } = require("../../utils/session.utils");

exports.new = (req, res) => {
  if (req.session?.userId) {
    return res.redirect("/owner/dashboard");
  }
  if (req.session?.managerId && req.session?.managerUserId) {
    return res.redirect("/manager/dashboard");
  }
  res.renderPage("owner/sessions/new", {
    title: "Login",
    error: null
  });
};

exports.create = async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const rememberMe = String(req.body.remember_me || "") === "on";

    const invalid = () =>
      res.renderPage("owner/sessions/new", { title: "Login", error: "Invalid credentials." });

    const blocked = (msg) => res.renderPage("owner/sessions/new", { title: "Login", error: msg });

    const user = await dbGet(
      "SELECT id, password_hash, status FROM users WHERE email = ?",
      [email]
    );

    if (user) {
      const ok = await bcrypt.compare(password, user.password_hash);
      if (!ok) return invalid();

      if (user.status !== "active") return blocked("Your account is disabled. Please contact support.");

      delete req.session.managerId;
      delete req.session.managerUserId;

      req.session.userId = user.id;
      setRememberMeCookie(req, rememberMe);

      req.session.save((err) => {
        if (err) {
          console.error("Session save error:", err);
          return res.renderPage("owner/sessions/new", { title: "Login", error: "Server error." });
        }
        return res.redirect("/owner/dashboard");
      });
    }

    const manager = await dbGet(
      "SELECT id, user_id, email, password_hash, is_active FROM managers WHERE email = ?",
      [email]
    );

    if (!manager) return invalid();
    if (!manager.is_active) return blocked("Your manager account is disabled. Contact your admin.");

    const okMgr = await bcrypt.compare(password, manager.password_hash);
    if (!okMgr) return invalid();

    const parentUser = await dbGet(
      "SELECT id, status FROM users WHERE id = ?",
      [manager.user_id]
    );

    if (!parentUser) return blocked("Your owner account was not found. Please contact support.");
    if (parentUser.status !== "active") return blocked("Your owner account is not active.");

    delete req.session.userId;
    req.session.managerId = manager.id;
    req.session.managerUserId = manager.user_id;
    setRememberMeCookie(req, rememberMe);

    req.session.save((err) => {
      if (err) {
        console.error("Session save error:", err);
        return res.renderPage("owner/sessions/new", { title: "Login", error: "Server error." });
      }
      return res.redirect("/manager/dashboard");
    });
  } catch (err) {
    console.error(err);
    return res.renderPage("owner/sessions/new", { title: "Login", error: "Something went wrong." });
  }
};

exports.destroy = async (req, res) => {
  try {
    const userId = req.session?.userId || null;
    const managerId = req.session?.managerId || null;

    const destroyCurrent = () =>
      new Promise((resolve) => {
        if (!req.session) return resolve();
        req.session.destroy(() => resolve());
      });

    if (userId) {
      await deleteSessionsByNeedle(`"userId":${Number(userId)}`);
    } else if (managerId) {
      await deleteSessionsByNeedle(`"managerId":${Number(managerId)}`);
    }

    await destroyCurrent();
    return res.redirect("/owner/login");
  } catch (e) {
    console.error("[LOGOUT]", e);
    if (req.session) {
      req.session.destroy(() => res.redirect("/owner/login"));
    } else {
      res.redirect("/owner/login");
    }
  }
};
