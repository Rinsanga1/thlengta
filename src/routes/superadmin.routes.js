const express = require("express");
const bcrypt = require("bcryptjs");
const path = require("path");
const fs = require("fs");

const { dbGet, dbAll, dbRun } = require("../db/helpers");
const { requireSuperAdmin } = require("../middleware/superadminAuth");

const router = express.Router();

function addYears(date, years) {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + years);
  return d;
}

function toISODateTime(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return (
    d.getFullYear() +
    "-" +
    pad(d.getMonth() + 1) +
    "-" +
    pad(d.getDate()) +
    " " +
    pad(d.getHours()) +
    ":" +
    pad(d.getMinutes()) +
    ":" +
    pad(d.getSeconds())
  );
}

function isValidEmail(email) {
  return /^\S+@\S+\.\S+$/.test(String(email || ""));
}

function toSqliteDateTimeFromInput(s) {
  if (!s) return null;
  const str = String(s).trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(str)) return null;
  return str.replace("T", " ") + ":00";
}

function toDateTimeLocalValue(sqliteDt) {
  if (!sqliteDt) return "";
  const s = String(sqliteDt);
  if (s.includes("T")) return s.slice(0, 16);
  return s.replace(" ", "T").slice(0, 16);
}

// -------------------- AUTH --------------------

router.get("/login", (req, res) => {
  res.renderPage("superadmin/login", { title: "Super Admin Login", error: null });
});

router.post("/login", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    const sa = await dbGet(
      "SELECT id, password_hash, is_active, session_version FROM super_admins WHERE email = ?",
      [email]
    );

    if (!sa || !sa.is_active) {
      return res.renderPage("superadmin/login", {
        title: "Super Admin Login",
        error: "Invalid credentials."
      });
    }

    const ok = await bcrypt.compare(password, sa.password_hash);
    if (!ok) {
      return res.renderPage("superadmin/login", {
        title: "Super Admin Login",
        error: "Invalid credentials."
      });
    }

    // Set session
    req.session.superAdminId = sa.id;
    req.session.sessionVersion = Number(sa.session_version || 1);

    // Optional: if you later add a Remember Me checkbox on superadmin login,
    // it will work automatically (same name as admin: remember=yes).
    const remember = String(req.body.remember || "").toLowerCase();
    if (remember === "yes" || remember === "1" || remember === "true" || remember === "on") {
      req.session.cookie.maxAge = 14 * 24 * 60 * 60 * 1000;
    } else {
      req.session.cookie.expires = false;
    }

    return res.redirect("/superadmin/dashboard");
  } catch (e) {
    console.error(e);
    return res.renderPage("superadmin/login", {
      title: "Super Admin Login",
      error: "Something went wrong."
    });
  }
});

// Logout everywhere: bump session_version + destroy session
router.post("/logout", requireSuperAdmin, async (req, res) => {
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
});

// -------------------- DASHBOARD --------------------

router.get("/", (req, res) => res.redirect("/superadmin/dashboard"));

router.get("/dashboard", requireSuperAdmin, async (req, res) => {
  const admins = await dbAll(
    "SELECT id, email, name, phone, address, status, expires_at, created_at, plan, requested_plan FROM admins ORDER BY id DESC",
    []
  );

  const stats = await dbAll(
    `
    SELECT
      s.admin_id AS admin_id,
      COUNT(DISTINCT s.id) AS store_count,
      COUNT(DISTINCT e.id) AS employee_count
    FROM stores s
    LEFT JOIN employees e ON e.store_id = s.id
    GROUP BY s.admin_id
    `,
    []
  );

  const storeNames = await dbAll(
    `
    SELECT admin_id, GROUP_CONCAT(name, ', ') AS store_names
    FROM stores
    GROUP BY admin_id
    `,
    []
  );

  const statMap = new Map(stats.map((r) => [r.admin_id, r]));
  const nameMap = new Map(storeNames.map((r) => [r.admin_id, r.store_names || ""]));

  const now = new Date();

  const rows = admins.map((a) => {
    const st = statMap.get(a.id) || { store_count: 0, employee_count: 0 };
    const stores = nameMap.get(a.id) || "";
    let expired = false;
    if (a.expires_at) expired = new Date(a.expires_at) < now;
    return {
      ...a,
      store_count: st.store_count,
      employee_count: st.employee_count,
      store_names: stores,
      expired
    };
  });

  res.renderPage("superadmin/dashboard", {
    title: "Super Admin Dashboard",
    admins: rows,
    msg: req.query.msg || null
  });
});

// -------------------- ADMIN EDIT --------------------

router.get("/admins/:adminId/edit", requireSuperAdmin, async (req, res) => {
  const adminId = Number(req.params.adminId);

  const admin = await dbGet(
    "SELECT id, email, name, phone, address, status, expires_at, created_at, plan, requested_plan FROM admins WHERE id = ?",
    [adminId]
  );
  if (!admin) return res.status(404).send("Admin not found.");

  res.renderPage("superadmin/admin_edit", {
    title: "Edit Admin",
    admin,
    expiresLocal: toDateTimeLocalValue(admin.expires_at),
    error: null,
    msg: req.query.msg || null
  });
});

router.post("/admins/:adminId/edit", requireSuperAdmin, async (req, res) => {
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
});

// -------------------- ADMIN ACTIONS --------------------

router.post("/admins/:adminId/approve", requireSuperAdmin, async (req, res) => {
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
});

router.post("/admins/:adminId/reject", requireSuperAdmin, async (req, res) => {
  const adminId = Number(req.params.adminId);
  await dbRun("UPDATE admins SET status = 'rejected' WHERE id = ?", [adminId]);
  return res.redirect("/superadmin/dashboard?msg=" + encodeURIComponent("Rejected admin."));
});

router.post("/admins/:adminId/disable", requireSuperAdmin, async (req, res) => {
  const adminId = Number(req.params.adminId);
  await dbRun("UPDATE admins SET status = 'disabled' WHERE id = ?", [adminId]);
  return res.redirect("/superadmin/dashboard?msg=" + encodeURIComponent("Disabled admin."));
});

router.post("/admins/:adminId/renew", requireSuperAdmin, async (req, res) => {
  const adminId = Number(req.params.adminId);

  const row = await dbGet("SELECT expires_at FROM admins WHERE id = ?", [adminId]);
  const base = row && row.expires_at ? new Date(row.expires_at) : new Date();
  const newExp = addYears(base, 1);

  await dbRun("UPDATE admins SET status = 'active', expires_at = ? WHERE id = ?", [
    toISODateTime(newExp),
    adminId
  ]);

  return res.redirect("/superadmin/dashboard?msg=" + encodeURIComponent("Renewed +1 year."));
});

router.post("/admins/:adminId/delete", requireSuperAdmin, async (req, res) => {
  const adminId = Number(req.params.adminId);

  const stores = await dbAll("SELECT id, logo_path FROM stores WHERE admin_id = ?", [adminId]);

  for (const s of stores) {
    if (s.logo_path && String(s.logo_path).startsWith("/uploads/")) {
      const abs = path.join(process.cwd(), "public", s.logo_path);
      try {
        if (fs.existsSync(abs)) fs.unlinkSync(abs);
      } catch (e) {
        console.warn("Failed to delete logo:", e.message);
      }
    }

    await dbRun(
      `DELETE FROM employee_devices
       WHERE employee_id IN (SELECT id FROM employees WHERE store_id = ?)`,
      [s.id]
    );

    await dbRun("DELETE FROM attendance_logs WHERE store_id = ?", [s.id]);
    await dbRun("DELETE FROM employees WHERE store_id = ?", [s.id]);
  }

  await dbRun("DELETE FROM stores WHERE admin_id = ?", [adminId]);
  await dbRun("DELETE FROM admins WHERE id = ?", [adminId]);

  return res.redirect("/superadmin/dashboard?msg=" + encodeURIComponent("Admin deleted fully."));
});

// -------------------- UPGRADE REQUESTS --------------------

router.get("/upgrade-requests", requireSuperAdmin, async (req, res) => {
  const rows = await dbAll(
    `
    SELECT
      ur.id,
      ur.admin_id,
      ur.from_plan,
      ur.to_plan,
      ur.status,
      ur.created_at,
      a.email AS admin_email
    FROM upgrade_requests ur
    JOIN admins a ON a.id = ur.admin_id
    WHERE ur.status = 'pending'
    ORDER BY ur.id DESC
    `
  );

  res.renderPage("superadmin/upgrade_requests", {
    title: "Upgrade Requests",
    rows,
    msg: req.query.msg || null,
    error: null
  });
});

router.post("/upgrade-requests/:id/approve", requireSuperAdmin, async (req, res) => {
  const superadminId = req.session.superAdminId;
  const id = Number(req.params.id);

  const reqRow = await dbGet(
    `SELECT id, admin_id, to_plan, status FROM upgrade_requests WHERE id = ?`,
    [id]
  );

  if (!reqRow || reqRow.status !== "pending") {
    return res.redirect(
      "/superadmin/upgrade-requests?msg=" +
        encodeURIComponent("Request not found or already handled.")
    );
  }

  await dbRun(`UPDATE admins SET plan = ? WHERE id = ?`, [String(reqRow.to_plan), reqRow.admin_id]);

  await dbRun(
    `
    UPDATE upgrade_requests
    SET status = 'approved',
        resolved_at = CURRENT_TIMESTAMP,
        resolved_by_superadmin_id = ?
    WHERE id = ?
    `,
    [superadminId, id]
  );

  return res.redirect("/superadmin/upgrade-requests?msg=" + encodeURIComponent("Approved and plan updated."));
});

router.post("/upgrade-requests/:id/reject", requireSuperAdmin, async (req, res) => {
  const superadminId = req.session.superAdminId;
  const id = Number(req.params.id);
  const note = String(req.body.note || "").trim().slice(0, 300);

  const reqRow = await dbGet(`SELECT id, status FROM upgrade_requests WHERE id = ?`, [id]);

  if (!reqRow || reqRow.status !== "pending") {
    return res.redirect(
      "/superadmin/upgrade-requests?msg=" +
        encodeURIComponent("Request not found or already handled.")
    );
  }

  await dbRun(
    `
    UPDATE upgrade_requests
    SET status = 'rejected',
        resolved_at = CURRENT_TIMESTAMP,
        resolved_by_superadmin_id = ?,
        note = ?
    WHERE id = ?
    `,
    [superadminId, note || null, id]
  );

  return res.redirect("/superadmin/upgrade-requests?msg=" + encodeURIComponent("Rejected."));
});

module.exports = router;
