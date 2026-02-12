const bcrypt = require("bcryptjs");
const { dbGet, dbRun } = require("../db/helpers");
const express = require("express");
const router = express.Router();
const { sendMail } = require("../utils/mailer");//send email stuff

// Redirect root /auth to /admin/login
router.get("/", (req, res) => {
  res.redirect("/admin/login");
});


// Redirect /auth/login to /admin/login
router.get("/login", (req, res) => {
  return res.redirect("/admin/login");
});

// ---------- Helpers ----------
function normalizePlan(input) {
  const plan = String(input || "standard").trim().toLowerCase();
  const allowed = ["standard", "pro", "enterprise"];
  return allowed.includes(plan) ? plan : "standard";
}

// IMPORTANT (future-ready):
// Keep emails globally unique across all account types (admins + managers)
// so password reset + email OTP can work reliably later.
async function emailAlreadyUsed(email) {
  const e = String(email || "").trim().toLowerCase();
  if (!e) return false;

  const existingAdmin = await dbGet("SELECT id FROM admins WHERE email = ?", [e]);
  if (existingAdmin) return true;

  // Managers table will exist once you apply the schema update.
  // If the table doesn't exist yet, this query would error.
  // So we guard it with a safe try/catch.
  try {
    const existingManager = await dbGet("SELECT id FROM managers WHERE email = ?", [e]);
    if (existingManager) return true;
  } catch (err) {
    // If managers table isn't created yet, ignore here.
    // This keeps current production safe while you roll out DB changes.
  }

  return false;
}

// ---------- PUBLIC REGISTRATION (PENDING APPROVAL) ----------

router.get("/register", (req, res) => {
  const plan = normalizePlan(req.query.plan);

  res.renderPage("marketing/register", {
    title: "Register",
    error: null,
    ok: null,
    plan // <- pass selected plan to the EJS page
  });
});

router.post("/register", async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const phone = String(req.body.phone || "").trim();
    const address = String(req.body.address || "").trim();

    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    // Plan comes from hidden input in the form
    const plan = normalizePlan(req.body.plan);
    console.log("[REGISTER] plan from form =", req.body.plan, "normalized =", plan);

    if (!name || name.length < 2) {
      return res.renderPage("marketing/register", {
        title: "Register",
        error: "Please enter your name.",
        ok: null,
        plan
      });
    }

    if (!phone || phone.length < 6) {
      return res.renderPage("marketing/register", {
        title: "Register",
        error: "Please enter a valid phone number.",
        ok: null,
        plan
      });
    }

    if (!address || address.length < 3) {
      return res.renderPage("marketing/register", {
        title: "Register",
        error: "Please enter your address.",
        ok: null,
        plan
      });
    }

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return res.renderPage("marketing/register", {
        title: "Register",
        error: "Please enter a valid email.",
        ok: null,
        plan
      });
    }

    if (!password || password.length < 8) {
      return res.renderPage("marketing/register", {
        title: "Register",
        error: "Password must be at least 8 characters.",
        ok: null,
        plan
      });
    }

    // NEW: check email against admins + managers (future-ready)
    const used = await emailAlreadyUsed(email);
    if (used) {
      return res.renderPage("marketing/register", {
        title: "Register",
        error: "This email is already registered. Please login or contact support.",
        ok: null,
        plan
      });
    }

    const password_hash = await bcrypt.hash(password, 12);

    // Save requested plan along with pending admin record
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

return res.redirect(`/register/submitted?plan=${encodeURIComponent(plan)}`); // Redirect to submitted page

  } catch (e) {
    console.error(e);
    return res.renderPage("marketing/register", {
      title: "Register",
      error: "Server error. Please try again.",
      ok: null,
      plan: normalizePlan(req.body?.plan)
    });
  }
});

// Registration submitted page
router.get("/register/submitted", (req, res) => {
  const plan = normalizePlan(req.query.plan);

  return res.renderPage("marketing/register_submitted", {
    title: "Registration Submitted",
    plan,
  });
});


module.exports = router;
