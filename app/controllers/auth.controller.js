const bcrypt = require("bcryptjs");
const { dbGet, dbRun } = require("../../db/helpers");
const { setRememberMeCookie, deleteSessionsByNeedle } = require("../utils/session.utils");


exports.redirect = (req, res) => {
  res.renderPage("home", {
    title: "Thlengta - Simple Staff Attendance"
  });
};


exports.new = (req, res) => {
  res.renderPage("registration/new", {
    title: "Sign Up",
    error: null
  });
};


exports.create = async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return res.renderPage("registration/new", {
        title: "Sign Up",
        error: "Please enter a valid email."
      });
    }

    if (!password || password.length < 8) {
      return res.renderPage("registration/new", {
        title: "Sign Up",
        error: "Password must be at least 8 characters."
      });
    }

    const existingUser = await dbGet("SELECT id FROM users WHERE email = ?", [email]);
    if (existingUser) {
      return res.renderPage("registration/new", {
        title: "Sign Up",
        error: "This email is already registered. Please sign in instead."
      });
    }

    const password_hash = await bcrypt.hash(password, 12);

    const rememberMe = String(req.body.remember_me || "") === "on";
    
    const result = await dbRun(
      "INSERT INTO users (email, password_hash, status) VALUES (?, ?, 'active')",
      [email, password_hash]
    );

    const userId = result.lastID;
    req.session.userId = userId;
    setRememberMeCookie(req, rememberMe);

    req.session.save((err) => {
      if (err) {
        console.error("Session save error:", err);
        return res.renderPage("registration/new", {
          title: "Sign Up",
          error: "Server error. Please try again."
        });
      }
      return res.redirect("/");
    });
  } catch (e) {
    console.error(e);
    return res.renderPage("registration/new", {
      title: "Sign Up",
      error: "Server error. Please try again."
    });
  }
};


exports.submitted = (req, res) => {
  return res.renderPage("registration/submitted", {
    title: "Registration Submitted"
  });
};


exports.registerFree = (req, res) => {
  if (req.session?.userId) {
    return res.redirect("/owner/dashboard");
  }

  res.renderPage("registration/free", {
    title: "Sign Up - Free Plan",
    error: null
  });
};


exports.registerFreeSubmit = async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return res.renderPage("registration/free", {
        title: "Sign Up - Free Plan",
        error: "Please enter a valid email."
      });
    }

    if (!password || password.length < 8) {
      return res.renderPage("registration/free", {
        title: "Sign Up - Free Plan",
        error: "Password must be at least 8 characters."
      });
    }

    const existingUser = await dbGet("SELECT id FROM users WHERE email = ?", [email]);
    if (existingUser) {
      return res.renderPage("registration/free", {
        title: "Sign Up - Free Plan",
        error: "This email is already registered. Please sign in instead."
      });
    }

    const password_hash = await bcrypt.hash(password, 12);

    const result = await dbRun(
      "INSERT INTO users (email, password_hash, plan, status) VALUES (?, ?, 'free', 'active')",
      [email, password_hash]
    );

    const userId = result.lastID;
    req.session.userId = userId;

    req.session.save((err) => {
      if (err) {
        console.error("Session save error:", err);
        return res.renderPage("registration/free", {
          title: "Sign Up - Free Plan",
          error: "Server error. Please try again."
        });
      }
      return res.redirect("/owner/dashboard");
    });
  } catch (e) {
    console.error(e);
    return res.renderPage("registration/free", {
      title: "Sign Up - Free Plan",
      error: "Server error. Please try again."
    });
  }
};



