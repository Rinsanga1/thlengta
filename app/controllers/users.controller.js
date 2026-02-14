const bcrypt = require("bcryptjs");
const { dbGet, dbAll } = require("../db/helpers");
const { setRememberMeCookie, deleteSessionsByNeedle } = require("../utils/session.utils");


exports.new = (req, res) => {
  if (req.session?.userId) {
    return res.redirect("/");
  }
  
  const registered = req.query.registered === "true";
  
  res.renderPage("users/signin", {
    title: "Sign In",
    error: null,
    registered: registered || false
  });
};


exports.create = async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const rememberMe = String(req.body.remember_me || "") === "on";

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return res.renderPage("users/signin", {
        title: "Sign In",
        error: "Please enter a valid email."
      });
    }

    if (!password) {
      return res.renderPage("users/signin", {
        title: "Sign In",
        error: "Please enter your password."
      });
    }

    const user = await dbGet("SELECT id, email, password_hash, status FROM users WHERE email = ?", [email]);

    if (!user) {
      return res.renderPage("users/signin", {
        title: "Sign In",
        error: "User not found. Would you like to sign up instead?",
        registered: false
      });
    }

    if (user.status !== "active") {
      return res.renderPage("users/signin", {
        title: "Sign In",
        error: "Your account is disabled. Please contact support.",
        registered: false
      });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.renderPage("users/signin", {
        title: "Sign In",
        error: "Incorrect password.",
        registered: false
      });
    }

    req.session.userId = user.id;
    setRememberMeCookie(req, rememberMe);

    return res.redirect("/");
  } catch (err) {
    console.error(err);
    return res.renderPage("users/signin", {
      title: "Sign In",
      error: "Something went wrong. Please try again.",
      registered: false
    });
  }
};


exports.confirm = (req, res) => {
  if (!req.session?.userId) {
    return res.redirect("/users/signin");
  }
  
  res.renderPage("users/signout", {
    title: "Logout"
  });
};


exports.destroy = async (req, res) => {
  try {
    const userId = req.session?.userId || null;

    const destroyCurrent = () =>
      new Promise((resolve) => {
        if (!req.session) return resolve();
        req.session.destroy(() => resolve());
      });

    if (userId) {
      await deleteSessionsByNeedle(`"userId":${Number(userId)}`);
    }

    await destroyCurrent();
    return res.redirect("/");
  } catch (e) {
    console.error("[LOGOUT]", e);
    if (req.session) {
      req.session.destroy(() => res.redirect("/"));
    } else {
      res.redirect("/");
    }
  }
};
