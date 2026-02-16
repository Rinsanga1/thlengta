const bcrypt = require("bcryptjs");
const path = require("path");
const fs = require("fs");

const { dbGet, dbAll, dbRun } = require("../../../db/helpers");
const { addYears, toISODateTime, toSqliteDateTimeFromInput, toDateTimeLocalValue } = require("../../utils/time.utils");
const { isValidEmail } = require("../../utils/validation.utils");
const { normalizePlan } = require("../../utils/plan.utils"); // Reuse normalizePlan

// Renders the form to edit an admin
exports.edit = async (req, res) => {
  const adminId = Number(req.params.adminId);

  const admin = await dbGet(
    "SELECT id, email, name, phone, address, status, expires_at, created_at, plan, requested_plan FROM admins WHERE id = ?",
    [adminId]
  );
  if (!admin) return res.status(404).send("Admin not found.");

  res.renderPage("superadmin/admins/edit", { // Renamed view
    title: "Edit Admin",
    admin,
    expiresLocal: toDateTimeLocalValue(admin.expires_at),
    error: null,
    msg: req.query.msg || null
  });
};

// Handles the update of an admin
exports.update = async (req, res) => {
  try {
    const adminId = Number(req.params.adminId);

    const existing = await dbGet("SELECT id FROM admins WHERE id = ?", [adminId]);
    if (!existing) return res.status(404).send("Admin not found.");

    const email = String(req.body.email || "").trim().toLowerCase();
    const name = String(req.body.name || "").trim();
    const phone = String(req.body.phone || "").trim();
    const address = String(req.body.address || "").trim();
    const status = String(req.body.status || "").trim();
    const expires_at = toSqliteDateTimeFromInput(req.body.expires_at);
    const plan = String(req.body.plan || "standard").trim().toLowerCase();
    const allowedPlans = new Set(["standard", "pro", "enterprise"]);
    const safePlan = allowedPlans.has(plan) ? plan : "standard";

    const newPassword = String(req.body.new_password || "").trim();

    if (!isValidEmail(email)) {
      return res.redirect(`/superadmin/admins/${adminId}/edit?msg=` + encodeURIComponent("Invalid email."));
    }

    if (!["pending", "active", "rejected", "disabled"].includes(status)) {
      return res.redirect(`/superadmin/admins/${adminId}/edit?msg=` + encodeURIComponent("Invalid status."));
    }

    const taken = await dbGet("SELECT id FROM admins WHERE email = ? AND id != ?", [email, adminId]);
    if (taken) {
      return res.redirect(`/superadmin/admins/${adminId}/edit?msg=` + encodeURIComponent("Email already in use."));
    }

    if (newPassword && newPassword.length < 8) {
      return res.redirect(
        `/superadmin/admins/${adminId}/edit?msg=` + encodeURIComponent("Password must be at least 8 characters.")
      );
    }

    if (newPassword) {
      const password_hash = await bcrypt.hash(newPassword, 12);
      await dbRun(
        `
        UPDATE admins
        SET email = ?, name = ?, phone = ?, address = ?, status = ?, expires_at = ?, plan = ?, password_hash = ?
        WHERE id = ?
        `,
        [email, name, phone, address, status, expires_at, safePlan, password_hash, adminId]
      );
    } else {
      await dbRun(
        `
        UPDATE admins
        SET email = ?, name = ?, phone = ?, address = ?, status = ?, expires_at = ?, plan = ?
        WHERE id = ?
        `,
        [email, name, phone, address, status, expires_at, safePlan, adminId]
      );
    }

    return res.redirect(`/superadmin/admins/${adminId}/edit?msg=` + encodeURIComponent("Saved."));
  } catch (e) {
    console.error(e);
    return res.status(500).send("Server error");
  }
};

// Approves an admin
exports.approve = async (req, res) => {
  const adminId = Number(req.params.adminId);
  const exp = addYears(new Date(), 1);

  await dbRun(
    `
    UPDATE admins
    SET status = 'active',
        expires_at = ?,
        plan = COALESCE(requested_plan, plan, 'standard'),
        requested_plan = NULL
    WHERE id = ?
    `,
    [toISODateTime(exp), adminId]
  );

  return res.redirect("/superadmin/dashboard?msg=" + encodeURIComponent("Approved for 1 year."));
};

// Rejects an admin
exports.reject = async (req, res) => {
  const adminId = Number(req.params.adminId);
  await dbRun("UPDATE admins SET status = 'rejected' WHERE id = ?", [adminId]);
  return res.redirect("/superadmin/dashboard?msg=" + encodeURIComponent("Rejected admin."));
};

// Disables an admin
exports.disable = async (req, res) => {
  const adminId = Number(req.params.adminId);
  await dbRun("UPDATE admins SET status = 'disabled' WHERE id = ?", [adminId]);
  return res.redirect("/superadmin/dashboard?msg=" + encodeURIComponent("Disabled admin."));
};

// Renews an admin's subscription
exports.renew = async (req, res) => {
  const adminId = Number(req.params.adminId);

  const row = await dbGet("SELECT expires_at FROM admins WHERE id = ?", [adminId]);
  const base = row && row.expires_at ? new Date(row.expires_at) : new Date();
  const newExp = addYears(base, 1);

  await dbRun("UPDATE admins SET status = 'active', expires_at = ? WHERE id = ?", [
    toISODateTime(newExp),
    adminId
  ]);

  return res.redirect("/superadmin/dashboard?msg=" + encodeURIComponent("Renewed +1 year."));
};

// Deletes an admin and associated data
exports.destroy = async (req, res) => {
  const adminId = Number(req.params.adminId);

  const workplaces = await dbAll("SELECT id, logo_path FROM workplaces WHERE user_id = ?", [adminId]);

  for (const w of workplaces) {
    if (w.logo_path && String(w.logo_path).startsWith("/uploads/")) {
      const abs = path.join(process.cwd(), "public", w.logo_path);
      try {
        if (fs.existsSync(abs)) fs.unlinkSync(abs);
      } catch (e) {
        console.warn("Failed to delete logo:", e.message);
      }
    }

    await dbRun(
      `DELETE FROM employee_devices
       WHERE employee_id IN (SELECT id FROM employees WHERE workplace_id = ?)`,
      [w.id]
    );

    await dbRun("DELETE FROM attendance_logs WHERE workplace_id = ?", [w.id]);
    await dbRun("DELETE FROM employees WHERE workplace_id = ?", [w.id]);
  }

  await dbRun("DELETE FROM workplaces WHERE user_id = ?", [adminId]);
  await dbRun("DELETE FROM users WHERE id = ?", [adminId]);

  return res.redirect("/superadmin/dashboard?msg=" + encodeURIComponent("Admin deleted fully."));
};
