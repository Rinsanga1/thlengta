const bcrypt = require("bcryptjs");
const { dbRun } = require("../db/helpers");
const { sendMail } = require("../utils/mailer");
const { normalizePlan, emailAlreadyUsed } = require("../utils/auth.utils");


exports.redirect = (req, res) => {
  res.renderPage("home", { 
    title: "Thlengta - Simple Staff Attendance"
  });
};

// Renders the registration form
exports.new = (req, res) => {
  const plan = normalizePlan(req.query.plan);

  res.renderPage("marketing/new", { // Renamed view
    title: "Register",
    error: null,
    ok: null,
    plan // <- pass selected plan to the EJS page
  });
};

// Handles registration form submission (create new admin)
exports.create = async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const phone = String(req.body.phone || "").trim();
    const address = String(req.body.address || "").trim();

    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    const plan = normalizePlan(req.body.plan);
    console.log("[REGISTER] plan from form =", req.body.plan, "normalized =", plan);

    if (!name || name.length < 2) {
      return res.renderPage("marketing/new", {
        title: "Register",
        error: "Please enter your name.",
        ok: null,
        plan
      });
    }

    if (!phone || phone.length < 6) {
      return res.renderPage("marketing/new", {
        title: "Register",
        error: "Please enter a valid phone number.",
        ok: null,
        plan
      });
    }

    if (!address || address.length < 3) {
      return res.renderPage("marketing/new", {
        title: "Register",
        error: "Please enter your address.",
        ok: null,
        plan
      });
    }

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return res.renderPage("marketing/new", {
        title: "Register",
        error: "Please enter a valid email.",
        ok: null,
        plan
      });
    }

    if (!password || password.length < 8) {
      return res.renderPage("marketing/new", {
        title: "Register",
        error: "Password must be at least 8 characters.",
        ok: null,
        plan
      });
    }

    const used = await emailAlreadyUsed(email);
    if (used) {
      return res.renderPage("marketing/new", {
        title: "Register",
        error: "This email is already registered. Please login or contact support.",
        ok: null,
        plan
      });
    }

    const password_hash = await bcrypt.hash(password, 12);

    await dbRun(
      `
      INSERT INTO admins (email, password_hash, name, phone, address, status, expires_at, requested_plan)
      VALUES (?, ?, ?, ?, ?, 'pending', NULL, ?)
      `,
      [email, password_hash, name, phone, address, plan]
    );

    try {
      await sendMail({
        to: process.env.SUPERADMIN_EMAIL,
        subject: "New Thlengta registration (pending)",
        text:
          `A new registration was submitted:\n\n` +
          `Name: ${name}\n` +
          `Email: ${email}\n` +
          `Phone: ${phone}\n` +
          `Address: ${address}\n` +
          `Plan: ${plan}\n` +
          `Time: ${new Date().toISOString()}\n`
      });
      console.log("[REGISTER] Superadmin email sent");
    } catch (err) {
      console.error("[REGISTER] Superadmin email failed:", err.message);
    }

    return res.redirect(`/register/submitted?plan=${encodeURIComponent(plan)}`);
  } catch (e) {
    console.error(e);
    return res.renderPage("marketing/new", {
      title: "Register",
      error: "Server error. Please try again.",
      ok: null,
      plan: normalizePlan(req.body?.plan)
    });
  }
};


// Renders registration submitted page
exports.submitted = (req, res) => {
  const plan = normalizePlan(req.query.plan);

  return res.renderPage("marketing/submitted", { // Renamed view
    title: "Registration Submitted",
    plan,
  });
};