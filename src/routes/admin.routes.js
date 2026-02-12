const express = require("express");
const bcrypt = require("bcryptjs");
const { nanoid } = require("nanoid");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const sqlite3 = require("sqlite3").verbose();

const { sendMail } = require("../utils/mailer");
const { dbGet, dbRun, dbAll } = require("../db/helpers");
const { requireAdmin } = require("../middleware/auth");

function ensureWorkplaceDraft(req) {
  if (!req.session.workplaceDraft) req.session.workplaceDraft = {};
  return req.session.workplaceDraft;
}

function clearWorkplaceDraft(req) {
  delete req.session.workplaceDraft;
}

function parseTime12hToHHMM(t) {
  if (!t) return null;
  const s = String(t).trim().toUpperCase();
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/);
  if (!m) return null;
  let hh = parseInt(m[1], 10);
  let mm = parseInt(m[2] || "00", 10);
  const ap = m[3];

  if (hh < 1 || hh > 12) return null;
  if (mm < 0 || mm > 59) return null;

  if (ap === "AM") {
    if (hh === 12) hh = 0;
  } else {
    if (hh !== 12) hh += 12;
  }

  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function isValidLatLng(lat, lng) {
  const la = Number(lat);
  const lo = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return false;
  if (la < -90 || la > 90) return false;
  if (lo < -180 || lo > 180) return false;
  return true;
}

const { toPngBuffer } = require("../utils/qr");
const { makeFramedQrPng } = require("../utils/qrPoster");

const router = express.Router();

// --------------------
// Session helpers
// --------------------
const REMEMBER_ME_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

function setRememberMeCookie(req, remember) {
  // If remember = true, persist cookie for 14 days
  // Else: session cookie (dies when browser closes)
  if (!req.session || !req.session.cookie) return;
  if (remember) req.session.cookie.maxAge = REMEMBER_ME_MS;
  else req.session.cookie.expires = false; // session cookie
}

// Logout everywhere by deleting matching sessions in sessions.sqlite (connect-sqlite3)
function deleteSessionsByNeedle(needle) {
  return new Promise((resolve, reject) => {
    try {
      const sessionsDbPath = path.join(process.cwd(), "sessions.sqlite");
      const db = new sqlite3.Database(sessionsDbPath, (err) => {
        if (err) return reject(err);
      });

      // connect-sqlite3 default table + columns: sessions(sid TEXT PRIMARY KEY, sess TEXT, expire INTEGER)
      const like = `%${needle}%`;

      db.run("DELETE FROM sessions WHERE sess LIKE ?", [like], function (err) {
        db.close(() => {});
        if (err) return reject(err);
        return resolve(this.changes || 0);
      });
    } catch (e) {
      return reject(e);
    }
  });
}

// -------- Helpers --------

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
function todayIST_yyyy_mm_dd() {
  return new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

function getBaseUrl(req) {
  const envBase = process.env.BASE_URL;
  if (envBase) return envBase.replace(/\/+$/, "");
  return `${req.protocol}://${req.get("host")}`;
}

function to12Hour(hhmmss) {
  if (!hhmmss) return "";
  const parts = String(hhmmss).split(":");
  const hh = Number(parts[0]);
  const mm = Number(parts[1] || 0);

  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return hhmmss;

  const ampm = hh >= 12 ? "PM" : "AM";
  let h12 = hh % 12;
  if (h12 === 0) h12 = 12;

  const mm2 = String(mm).padStart(2, "0");
  return `${h12}:${mm2} ${ampm}`;
}

function parseSqliteTimeToMinutes(hhmmss) {
  if (!hhmmss) return null;
  const parts = String(hhmmss).split(":");
  const hh = Number(parts[0]);
  const mm = Number(parts[1] || 0);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
}

function parseSqliteDateTimeToMs(sqliteDt) {
  if (!sqliteDt) return null;
  const s = String(sqliteDt).trim();
  if (!s) return null;

  if (s.includes("T")) {
    const ms = Date.parse(s);
    return Number.isFinite(ms) ? ms : null;
  }

  const iso = s.replace(" ", "T") + "Z";
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

async function cleanupOldLogs(storeId) {
  await dbRun(
    `
    DELETE FROM attendance_logs
    WHERE store_id = ?
      AND datetime(created_at) < datetime('now', '-90 days')
    `,
    [storeId]
  );
}

// Show these events to admins in Logs and CSV exports (INCLUDING breaks)
const ADMIN_VISIBLE_EVENTS = [
  "checkin",
  "checkout",
  "break_start",
  "break_end",
  "denied_device",
  "denied_gps"
];

function sqlInListPlaceholders(n) {
  return Array.from({ length: n }, () => "?").join(",");
}

// -------- Multer (logo upload) --------

const uploadDir = path.join(process.cwd(), "public", "uploads");
try {
  fs.mkdirSync(uploadDir, { recursive: true });
} catch (e) {
  console.warn("Could not create uploads dir:", e.message);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".png";
    const safeExt = [".png", ".jpg", ".jpeg", ".webp"].includes(ext) ? ext : ".png";
    cb(null, `store_${req.params.storeId || "new"}_${Date.now()}_${nanoid(6)}${safeExt}`);
  }
});

function fileFilter(req, file, cb) {
  const ok = ["image/png", "image/jpeg", "image/webp"].includes(file.mimetype);
  cb(ok ? null : new Error("Invalid file type. Only PNG/JPG/WEBP allowed."), ok);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 } // 2MB
});

// ---------- AUTH ----------

// Disable admin self-register (use /register marketing + superadmin approval)
router.get("/register", (req, res) => res.status(404).send("Not found"));
router.post("/register", (req, res) => res.status(404).send("Not found"));

router.get("/login", (req, res) => {
  // If already logged in, do NOT show login page again
  if (req.session?.adminId) {
    return res.redirect("/admin/dashboard");
  }

  // If manager is already logged in, send to manager dashboard
  if (req.session?.managerId && req.session?.managerAdminId) {
    return res.redirect("/manager/dashboard");
  }

  // Otherwise show login
  return res.renderPage("admin/login", { title: "Login", error: null });
});


router.post("/login", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const rememberMe = String(req.body.remember_me || "") === "on";

    const invalid = () =>
      res.renderPage("admin/login", { title: "Login", error: "Invalid credentials." });

    const blocked = (msg) => res.renderPage("admin/login", { title: "Login", error: msg });

    // 1) Try ADMIN login first
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

      // clear manager session leftovers
      delete req.session.managerId;
      delete req.session.managerAdminId;

      req.session.adminId = admin.id;

      // Remember Me behavior
      setRememberMeCookie(req, rememberMe);

      return res.redirect("/admin/dashboard");
    }

    // 2) Try MANAGER login (same login page)
    const manager = await dbGet(
      "SELECT id, admin_id, email, password_hash, is_active FROM managers WHERE email = ?",
      [email]
    );

    if (!manager) return invalid();
    if (!manager.is_active) return blocked("Your manager account is disabled. Contact your admin.");

    const okMgr = await bcrypt.compare(password, manager.password_hash);
    if (!okMgr) return invalid();

    // Parent admin must be active + not expired
    const parentAdmin = await dbGet(
      "SELECT id, status, expires_at, plan FROM admins WHERE id = ?",
      [manager.admin_id]
    );

    if (!parentAdmin) return blocked("Your admin account was not found. Please contact support.");
    if (parentAdmin.status !== "active") return blocked("Your admin account is not active.");
    if (!parentAdmin.expires_at) return blocked("Your admin account is not active yet.");

    const expMs2 = parseSqliteDateTimeToMs(parentAdmin.expires_at);
    if (!expMs2) return blocked("Your admin account expiry is invalid.");
    if (expMs2 < Date.now()) return blocked("Your subscription has expired.");

    // IMPORTANT: managers must NOT have adminId session
    delete req.session.adminId;

    req.session.managerId = manager.id;
    req.session.managerAdminId = manager.admin_id;

    // Remember Me behavior
    setRememberMeCookie(req, rememberMe);

    return res.redirect("/manager/dashboard");
  } catch (err) {
    console.error(err);
    return res.renderPage("admin/login", { title: "Login", error: "Something went wrong." });
  }
});

// Logout everywhere for admin OR manager (based on who is logged in)
router.get("/logout", async (req, res) => {
  try {
    const adminId = req.session?.adminId || null;
    const managerId = req.session?.managerId || null;

    // destroy current session first
    const destroyCurrent = () =>
      new Promise((resolve) => {
        if (!req.session) return resolve();
        req.session.destroy(() => resolve());
      });

    // If admin logged in: delete ALL sessions containing this adminId
    if (adminId) {
      await deleteSessionsByNeedle(`"adminId":${Number(adminId)}`);
      await destroyCurrent();
      return res.redirect("/admin/login");
    }

    // If manager logged in: delete ALL sessions containing this managerId
    if (managerId) {
      await deleteSessionsByNeedle(`"managerId":${Number(managerId)}`);
      await destroyCurrent();
      return res.redirect("/admin/login");
    }

    await destroyCurrent();
    return res.redirect("/admin/login");
  } catch (e) {
    console.error("[LOGOUT]", e);
    // fallback: at least kill current session
    if (req.session) {
      req.session.destroy(() => res.redirect("/admin/login"));
    } else {
      res.redirect("/admin/login");
    }
  }
});

// ---------- DASHBOARD ----------

router.get("/dashboard", requireAdmin, async (req, res) => {
  const adminId = req.session.adminId;

  const admin = await dbGet("SELECT id, email, plan FROM admins WHERE id = ?", [adminId]);

  const stores = await dbAll("SELECT id, name, public_id FROM stores WHERE admin_id = ?", [adminId]);

  const pendingUpgrade = await dbGet(
    `SELECT id, from_plan, to_plan, status, created_at
     FROM upgrade_requests
     WHERE admin_id = ? AND status = 'pending'
     ORDER BY id DESC
     LIMIT 1`,
    [adminId]
  );

  res.renderPage("admin/dashboard2", {
    title: "Admin Dashboard",
    admin,
    stores,
    pendingUpgrade
  });
});
router.get("/", (req, res) => {
  // /admin should behave like a gateway:
  // - admin -> /admin/dashboard
  // - manager -> /manager/dashboard
  // - otherwise -> /admin/login

  if (req.session?.adminId) {
    return res.redirect("/admin/dashboard");
  }

  if (req.session?.managerId && req.session?.managerAdminId) {
    return res.redirect("/manager/dashboard");
  }

  return res.redirect("/admin/login");
});


//---------- workplace -------------//
// Wizard: Step 1 (Workplace info)
router.get("/workplace/new/step-1", requireAdmin, (req, res) => {
  const draft = ensureWorkplaceDraft(req);
  return res.renderPage("admin/workplace_step1", {
    title: "Create Workplace",
    draft,
    error: null
  });
});

router.post("/workplace/new/step-1", requireAdmin, upload.single("logo"), (req, res) => {
  const draft = ensureWorkplaceDraft(req);

  const name = (req.body.name || "").trim();
  const address = (req.body.address || "").trim();

  const open12 = (req.body.opening_time || "").trim();
  const close12 = (req.body.closing_time || "").trim();

  const opening_hhmm = parseTime12hToHHMM(open12);
  const closing_hhmm = parseTime12hToHHMM(close12);

  if (!name) {
    return res.renderPage("admin/workplace_step1", {
      title: "Create Workplace",
      draft,
      error: "Workplace name is required."
    });
  }
  if (!opening_hhmm || !closing_hhmm) {
    return res.renderPage("admin/workplace_step1", {
      title: "Create Workplace",
      draft,
      error: "Opening and closing time must be in 12-hour format like 9:00 AM."
    });
  }

  draft.name = name;
  draft.address = address;
  draft.opening_time_12 = open12;
  draft.closing_time_12 = close12;
  draft.opening_time = opening_hhmm;
  draft.closing_time = closing_hhmm;

  if (req.file && req.file.filename) {
    draft.logo_filename = req.file.filename;
  }

  return res.redirect("/admin/workplace/new/step-2");
});

// Wizard: Step 2 (Location)
router.get("/workplace/new/step-2", requireAdmin, (req, res) => {
  const draft = ensureWorkplaceDraft(req);
  if (!draft.name) return res.redirect("/admin/workplace/new/step-1");

  return res.renderPage("admin/workplace_step2_location", {
    title: "Workplace Location",
    draft,
    error: null
  });
});

router.post("/workplace/new/step-2", requireAdmin, (req, res) => {
  const draft = ensureWorkplaceDraft(req);
  if (!draft.name) return res.redirect("/admin/workplace/new/step-1");

  const { lat, lng, accuracy_m } = req.body;

  if (!isValidLatLng(lat, lng)) {
    return res.renderPage("admin/workplace_step2_location", {
      title: "Workplace Location",
      draft,
      error: "Invalid latitude/longitude."
    });
  }

  draft.lat = Number(lat);
  draft.lng = Number(lng);
  draft.accuracy_m = accuracy_m ? Number(accuracy_m) : null;

  return res.redirect("/admin/workplace/new/step-3");
});

// Wizard: Step 3 (Radius)
router.get("/workplace/new/step-3", requireAdmin, (req, res) => {
  const draft = ensureWorkplaceDraft(req);
  if (!draft.lat || !draft.lng) return res.redirect("/admin/workplace/new/step-2");

  if (!draft.radius_m) draft.radius_m = 70;

  return res.renderPage("admin/workplace_step3_radius", {
    title: "Workplace Radius",
    draft,
    error: null
  });
});

router.post("/workplace/new/step-3", requireAdmin, (req, res) => {
  const draft = ensureWorkplaceDraft(req);
  if (!draft.lat || !draft.lng) return res.redirect("/admin/workplace/new/step-2");

  const radius = Number(req.body.radius_m);
  if (!Number.isFinite(radius) || radius < 10 || radius > 1000) {
    return res.renderPage("admin/workplace_step3_radius", {
      title: "Workplace Radius",
      draft,
      error: "Radius must be between 10 and 1000 meters."
    });
  }

  draft.radius_m = Math.round(radius);
  return res.redirect("/admin/workplace/new/step-4");
});

// Wizard: Step 4 (Review)
router.get("/workplace/new/step-4", requireAdmin, (req, res) => {
  const draft = ensureWorkplaceDraft(req);
  if (!draft.radius_m) return res.redirect("/admin/workplace/new/step-3");

  return res.renderPage("admin/workplace_step4_review", {
    title: "Review Workplace",
    draft,
    error: null
  });
});

// Wizard: Finish (Create store/workplace + redirect to QR)
router.post("/workplace/new/finish", requireAdmin, async (req, res) => {
  try {
    const adminId = req.session.adminId;
    const draft = ensureWorkplaceDraft(req);

    if (!draft || !draft.name || !draft.lat || !draft.lng || !draft.radius_m) {
      return res.redirect("/admin/workplace/new/step-1");
    }

    const adminRow = await dbGet("SELECT plan FROM admins WHERE id = ?", [adminId]);
    const plan = String(adminRow?.plan || "standard").toLowerCase();

    let maxStores = 1;
    if (plan === "pro") maxStores = 5;
    if (plan === "enterprise") maxStores = Number.POSITIVE_INFINITY;

    const countRow = await dbGet("SELECT COUNT(*) AS cnt FROM stores WHERE admin_id = ?", [adminId]);
    const currentCount = Number(countRow?.cnt || 0);

    if (currentCount >= maxStores) {
      return res.renderPage("admin/workplace_step4_review", {
        title: "Review Workplace",
        draft,
        error: `Workplace limit reached for your plan (${plan}).`
      });
    }

    let logo_path = null;
    if (draft.logo_filename) {
      logo_path = `/uploads/${draft.logo_filename}`;
    }

    const public_id = nanoid(10);

    const open_time = String(draft.opening_time || "").trim();
    const close_time = String(draft.closing_time || "").trim();

    const result = await dbRun(
      `
      INSERT INTO stores (
        admin_id, name, public_id, lat, lng, radius_m,
        logo_path, open_time, close_time,
        grace_enabled, grace_minutes
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 10)
      `,
      [
        adminId,
        draft.name,
        public_id,
        draft.lat,
        draft.lng,
        draft.radius_m,
        logo_path,
        open_time || null,
        close_time || null,
        0
      ]
    );

    const storeId = result.lastID;
    clearWorkplaceDraft(req);

    return res.redirect(`/admin/store/${storeId}/qr`);
  } catch (err) {
    console.error(err);
    return res.renderPage("admin/workplace_step4_review", {
      title: "Review Workplace",
      draft: ensureWorkplaceDraft(req),
      error: "Something went wrong while creating workplace."
    });
  }
});

// ---------- STORE CREATE ----------
router.get("/store/new", requireAdmin, (req, res) => {
  clearWorkplaceDraft(req);
  return res.redirect("/admin/workplace/new/step-1");
});

router.post("/store/new", requireAdmin, upload.single("logo"), async (req, res) => {
  try {
    const adminId = req.session.adminId;

    const adminRow = await dbGet("SELECT plan FROM admins WHERE id = ?", [adminId]);
    const plan = String(adminRow?.plan || "standard").toLowerCase();

    let maxStores = 1;
    if (plan === "pro") maxStores = 5;
    if (plan === "enterprise") maxStores = Number.POSITIVE_INFINITY;

    const countRow = await dbGet("SELECT COUNT(*) AS cnt FROM stores WHERE admin_id = ?", [adminId]);
    const currentCount = Number(countRow?.cnt || 0);

    if (currentCount >= maxStores) {
      return res.renderPage("admin/store_new", {
        title: "Create Store",
        error: `Store limit reached for your plan (${plan}).`
      });
    }

    const name = String(req.body.name || "").trim();
    const lat = Number(req.body.lat);
    const lng = Number(req.body.lng);
    const radius_m = Number(req.body.radius_m);

    const open_time = String(req.body.open_time || "").trim();
    const close_time = String(req.body.close_time || "").trim();
    const grace_enabled = req.body.grace_enabled ? 1 : 0;

    if (!name || !Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(radius_m)) {
      return res.renderPage("admin/store_new", { title: "Create Store", error: "Invalid inputs." });
    }
    if (radius_m < 10 || radius_m > 1000) {
      return res.renderPage("admin/store_new", {
        title: "Create Store",
        error: "Radius should be 10 to 1000 meters."
      });
    }

    let logo_path = null;
    if (req.file && req.file.filename) {
      logo_path = `/uploads/${req.file.filename}`;
    }

    const public_id = nanoid(10);

    const result = await dbRun(
      `
      INSERT INTO stores (admin_id, name, public_id, lat, lng, radius_m, logo_path, open_time, close_time, grace_enabled, grace_minutes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 10)
      `,
      [
        adminId,
        name,
        public_id,
        lat,
        lng,
        radius_m,
        logo_path,
        open_time || null,
        close_time || null,
        grace_enabled
      ]
    );

    return res.redirect(`/admin/store/${result.lastID}/qr`);
  } catch (err) {
    console.error(err);
    return res.renderPage("admin/store_new", { title: "Create Store", error: "Something went wrong." });
  }
});

// ---------- STORE QR VIEW + PNG ----------

router.get("/store/:storeId/qr", requireAdmin, async (req, res) => {
  const adminId = req.session.adminId;
  const storeId = Number(req.params.storeId);

  const store = await dbGet("SELECT id, name, public_id FROM stores WHERE id = ? AND admin_id = ?", [
    storeId,
    adminId
  ]);
  if (!store) return res.status(404).send("Store not found.");

  const scanUrl = `${getBaseUrl(req)}/e/scan/${store.public_id}?src=qr`;
  res.renderPage("admin/store_qr", { title: "Store QR", store, scanUrl });
});

router.get("/store/:storeId/qr.png", requireAdmin, async (req, res) => {
  const adminId = req.session.adminId;
  const storeId = Number(req.params.storeId);

  const store = await dbGet("SELECT id, public_id FROM stores WHERE id = ? AND admin_id = ?", [
    storeId,
    adminId
  ]);
  if (!store) return res.status(404).send("Store not found.");

  const scanUrl = `${getBaseUrl(req)}/e/scan/${store.public_id}?src=qr`;
  const png = await toPngBuffer(scanUrl);

  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "no-store");
  res.send(png);
});

// ---------- ADMIN TEST: FRAMED QR DOWNLOAD (hidden) ----------

// Hidden test page (admin-only). No links in UI.
router.get("/test_qr_download", requireAdmin, async (req, res) => {
  const adminId = req.session.adminId;

  const stores = await dbAll(
    "SELECT id, name FROM stores WHERE admin_id = ? ORDER BY id DESC",
    [adminId]
  );

  return res.renderPage("admin/test_qr_download", {
    title: "Test QR Download",
    stores
  });
});

// Download RAW QR (admin-only test)
router.get("/test_qr_download/raw/:storeId.png", requireAdmin, async (req, res) => {
  const adminId = req.session.adminId;
  const storeId = Number(req.params.storeId);

  const store = await dbGet(
    "SELECT id, public_id, name FROM stores WHERE id = ? AND admin_id = ?",
    [storeId, adminId]
  );
  if (!store) return res.status(404).send("Store not found.");

  const scanUrl = `${getBaseUrl(req)}/e/scan/${store.public_id}?src=qr`;
  const png = await toPngBuffer(scanUrl);

  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Disposition", `attachment; filename="thlengta-raw-qr-${storeId}.png"`);
  return res.send(png);
});

// Download FRAMED QR (admin-only test)
router.get("/test_qr_download/framed/:storeId.png", requireAdmin, async (req, res) => {
  const adminId = req.session.adminId;
  const storeId = Number(req.params.storeId);

  const store = await dbGet(
    "SELECT id, public_id, name FROM stores WHERE id = ? AND admin_id = ?",
    [storeId, adminId]
  );
  if (!store) return res.status(404).send("Store not found.");

  const scanUrl = `${getBaseUrl(req)}/e/scan/${store.public_id}?src=qr`;
  const qrPng = await toPngBuffer(scanUrl);

  const framed = await makeFramedQrPng(qrPng, {
    qrSize: 720,
    offsetX: 0,
    offsetY: 0
  });

  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Disposition", `attachment; filename="thlengta-framed-qr-${storeId}.png"`);
  return res.send(framed);
});

router.get("/test_qr_download/debug_frame", requireAdmin, async (req, res) => {
  try {
    const p = path.join(process.cwd(), "public", "assets", "img", "qr-frame.png");
    res.send({ ok: true, framePath: p, exists: fs.existsSync(p) });
  } catch (e) {
    res.status(500).send({ ok: false, error: String(e.message || e) });
  }
});

// ---------- EMPLOYEES ----------
router.get("/store/:storeId/employees", requireAdmin, async (req, res) => {
  const adminId = req.session.adminId;
  const storeId = Number(req.params.storeId);

  const store = await dbGet("SELECT id, name FROM stores WHERE id = ? AND admin_id = ?", [
    storeId,
    adminId
  ]);
  if (!store) return res.status(404).send("Store not found.");

  const employees = await dbAll(
    `
    SELECT
      e.id,
      e.email,
      e.is_active,
      e.created_at,
      CASE
        WHEN EXISTS (SELECT 1 FROM employee_devices d WHERE d.employee_id = e.id)
        THEN 1 ELSE 0
      END AS device_registered
    FROM employees e
    WHERE e.store_id = ?
    ORDER BY e.id DESC
    `,
    [storeId]
  );

  res.renderPage("admin/employees_list", {
    title: "Employees",
    store,
    employees,
    msg: req.query.msg || null
  });
});

router.get("/store/:storeId/employees/new", requireAdmin, async (req, res) => {
  const adminId = req.session.adminId;
  const storeId = Number(req.params.storeId);

  const store = await dbGet("SELECT id, name FROM stores WHERE id = ? AND admin_id = ?", [
    storeId,
    adminId
  ]);
  if (!store) return res.status(404).send("Store not found.");

  res.renderPage("admin/employee_new", {
    title: "Add Employee",
    store,
    error: null
  });
});

router.post("/store/:storeId/employees/new", requireAdmin, async (req, res) => {
  try {
    const adminId = req.session.adminId;
    const storeId = Number(req.params.storeId);

    const store = await dbGet("SELECT id, name FROM stores WHERE id = ? AND admin_id = ?", [
      storeId,
      adminId
    ]);
    if (!store) return res.status(404).send("Store not found.");

    const email = String(req.body.email || "").trim().toLowerCase();
    const pin = String(req.body.pin || "").trim();

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return res.renderPage("admin/employee_new", {
        title: "Add Employee",
        store,
        error: "Enter a valid email."
      });
    }

    if (!/^\d{4,8}$/.test(pin)) {
      return res.renderPage("admin/employee_new", {
        title: "Add Employee",
        store,
        error: "PIN must be 4 to 8 digits."
      });
    }

    const existing = await dbGet("SELECT id FROM employees WHERE store_id = ? AND email = ?", [
      storeId,
      email
    ]);
    if (existing) {
      return res.renderPage("admin/employee_new", {
        title: "Add Employee",
        store,
        error: "Employee already exists for this store."
      });
    }

    const pin_hash = await bcrypt.hash(pin, 12);

    await dbRun("INSERT INTO employees (store_id, email, pin_hash, is_active) VALUES (?, ?, ?, 1)", [
      storeId,
      email,
      pin_hash
    ]);

    return res.redirect(
      `/admin/store/${storeId}/employees?msg=` +
        encodeURIComponent("Employee added. They can login with email + PIN.")
    );
  } catch (err) {
    console.error(err);
    return res.status(500).send("Server error");
  }
});

router.post("/store/:storeId/employees/:employeeId/toggle", requireAdmin, async (req, res) => {
  try {
    const adminId = req.session.adminId;
    const storeId = Number(req.params.storeId);
    const employeeId = Number(req.params.employeeId);

    const store = await dbGet("SELECT id FROM stores WHERE id = ? AND admin_id = ?", [
      storeId,
      adminId
    ]);
    if (!store) return res.status(404).send("Store not found.");

    const emp = await dbGet("SELECT id, is_active FROM employees WHERE id = ? AND store_id = ?", [
      employeeId,
      storeId
    ]);
    if (!emp) return res.status(404).send("Employee not found.");

    const newVal = emp.is_active ? 0 : 1;

    await dbRun("UPDATE employees SET is_active = ? WHERE id = ? AND store_id = ?", [
      newVal,
      employeeId,
      storeId
    ]);

    return res.redirect(`/admin/store/${storeId}/employees`);
  } catch (err) {
    console.error(err);
    return res.status(500).send("Server error");
  }
});

router.post("/store/:storeId/employees/:employeeId/device/reset", requireAdmin, async (req, res) => {
  const adminId = req.session.adminId;
  const storeId = Number(req.params.storeId);
  const employeeId = Number(req.params.employeeId);

  const store = await dbGet("SELECT id FROM stores WHERE id = ? AND admin_id = ?", [
    storeId,
    adminId
  ]);
  if (!store) return res.status(404).send("Store not found.");

  const emp = await dbGet("SELECT id FROM employees WHERE id = ? AND store_id = ?", [
    employeeId,
    storeId
  ]);
  if (!emp) return res.status(404).send("Employee not found.");

  await dbRun("DELETE FROM employee_devices WHERE employee_id = ?", [employeeId]);

  return res.redirect(
    `/admin/store/${storeId}/employees?msg=` +
      encodeURIComponent("Device reset. Employee can login again with email + PIN.")
  );
});

router.post("/store/:storeId/employees/:employeeId/delete", requireAdmin, async (req, res) => {
  try {
    const adminId = req.session.adminId;
    const storeId = Number(req.params.storeId);
    const employeeId = Number(req.params.employeeId);

    const store = await dbGet("SELECT id FROM stores WHERE id = ? AND admin_id = ?", [
      storeId,
      adminId
    ]);
    if (!store) return res.status(404).send("Store not found.");

    const emp = await dbGet("SELECT id, email FROM employees WHERE id = ? AND store_id = ?", [
      employeeId,
      storeId
    ]);
    if (!emp) return res.status(404).send("Employee not found.");

    await dbRun("DELETE FROM employee_devices WHERE employee_id = ?", [employeeId]);
    await dbRun("DELETE FROM attendance_logs WHERE employee_id = ? AND store_id = ?", [
      employeeId,
      storeId
    ]);
    await dbRun("DELETE FROM employees WHERE id = ? AND store_id = ?", [employeeId, storeId]);

    return res.redirect(
      `/admin/store/${storeId}/employees?msg=` + encodeURIComponent(`Deleted employee ${emp.email}.`)
    );
  } catch (err) {
    console.error(err);
    return res.status(500).send("Server error");
  }
});

// ---------- STORE SETTINGS ----------
router.get("/store/:storeId/settings", requireAdmin, async (req, res) => {
  const adminId = req.session.adminId;
  const storeId = Number(req.params.storeId);

  const store = await dbGet(
    "SELECT id, name, public_id, logo_path, open_time, close_time, grace_enabled, grace_minutes FROM stores WHERE id = ? AND admin_id = ?",
    [storeId, adminId]
  );
  if (!store) return res.status(404).send("Store not found.");

  res.renderPage("admin/store_settings", {
    title: "Store Settings",
    store,
    message: req.query.msg || null,
    error: null
  });
});

router.post("/store/:storeId/logo", requireAdmin, upload.single("logo"), async (req, res) => {
  try {
    const adminId = req.session.adminId;
    const storeId = Number(req.params.storeId);

    if (!req.file || !req.file.filename) {
      return res.redirect(`/admin/store/${storeId}/settings?msg=` + encodeURIComponent("No file uploaded."));
    }

    const store = await dbGet("SELECT id, logo_path FROM stores WHERE id = ? AND admin_id = ?", [
      storeId,
      adminId
    ]);
    if (!store) return res.status(404).send("Store not found.");

    const newLogoPath = `/uploads/${req.file.filename}`;

    if (store.logo_path && store.logo_path.startsWith("/uploads/")) {
      const oldAbs = path.join(process.cwd(), "public", store.logo_path);
      try {
        if (fs.existsSync(oldAbs)) fs.unlinkSync(oldAbs);
      } catch (e) {
        console.warn("Failed to delete old logo:", e.message);
      }
    }

    await dbRun("UPDATE stores SET logo_path = ? WHERE id = ? AND admin_id = ?", [
      newLogoPath,
      storeId,
      adminId
    ]);

    return res.redirect(`/admin/store/${storeId}/settings?msg=` + encodeURIComponent("Logo updated."));
  } catch (err) {
    console.error(err);
    return res.status(500).send("Server error");
  }
});

router.post("/store/:storeId/settings", requireAdmin, async (req, res) => {
  try {
    const adminId = req.session.adminId;
    const storeId = Number(req.params.storeId);

    const open_time = String(req.body.open_time || "").trim();
    const close_time = String(req.body.close_time || "").trim();
    const grace_enabled = req.body.grace_enabled ? 1 : 0;

    await dbRun(
      "UPDATE stores SET open_time = ?, close_time = ?, grace_enabled = ? WHERE id = ? AND admin_id = ?",
      [open_time || null, close_time || null, grace_enabled, storeId, adminId]
    );

    return res.redirect(`/admin/store/${storeId}/settings?msg=` + encodeURIComponent("Store times saved."));
  } catch (err) {
    console.error(err);
    return res.status(500).send("Server error");
  }
});

// ---------- STORE DELETE ----------
router.post("/store/:storeId/delete", requireAdmin, async (req, res) => {
  try {
    const adminId = req.session.adminId;
    const storeId = Number(req.params.storeId);

    const store = await dbGet("SELECT id, logo_path FROM stores WHERE id = ? AND admin_id = ?", [
      storeId,
      adminId
    ]);
    if (!store) return res.status(404).send("Store not found.");

    if (store.logo_path && store.logo_path.startsWith("/uploads/")) {
      const oldAbs = path.join(process.cwd(), "public", store.logo_path);
      try {
        if (fs.existsSync(oldAbs)) fs.unlinkSync(oldAbs);
      } catch (e) {
        console.warn("Failed to delete logo file:", e.message);
      }
    }

    await dbRun(
      `DELETE FROM employee_devices
       WHERE employee_id IN (SELECT id FROM employees WHERE store_id = ?)`,
      [storeId]
    );

    await dbRun("DELETE FROM attendance_logs WHERE store_id = ?", [storeId]);
    await dbRun("DELETE FROM employees WHERE store_id = ?", [storeId]);
    await dbRun("DELETE FROM stores WHERE id = ? AND admin_id = ?", [storeId, adminId]);

    res.redirect("/admin/dashboard");
  } catch (err) {
    console.error(err);
    return res.status(500).send("Server error");
  }
});

// ---------- QR ROTATE ----------
router.post("/store/:storeId/qr/rotate", requireAdmin, async (req, res) => {
  const adminId = req.session.adminId;
  const storeId = Number(req.params.storeId);

  const store = await dbGet("SELECT id FROM stores WHERE id = ? AND admin_id = ?", [
    storeId,
    adminId
  ]);
  if (!store) return res.status(404).send("Store not found.");

  const newPublicId = nanoid(10);

  await dbRun("UPDATE stores SET public_id = ? WHERE id = ? AND admin_id = ?", [
    newPublicId,
    storeId,
    adminId
  ]);

  res.redirect(`/admin/store/${storeId}/settings?msg=` + encodeURIComponent("QR rotated. Print the new QR now."));
});

// ---------- LOGS (view) ----------
router.get("/store/:storeId/logs", requireAdmin, async (req, res) => {
  const adminId = req.session.adminId;
  const storeId = Number(req.params.storeId);

  const store = await dbGet(
    "SELECT id, name, open_time, grace_enabled, grace_minutes FROM stores WHERE id = ? AND admin_id = ?",
    [storeId, adminId]
  );
  if (!store) return res.status(404).send("Store not found.");

  await cleanupOldLogs(storeId);

  const selectedDate = String(req.query.date || todayIST_yyyy_mm_dd());
  const placeholders = sqlInListPlaceholders(ADMIN_VISIBLE_EVENTS.length);

  const rows = await dbAll(
    `
    SELECT
      a.id,
      a.event_type,
      a.gps_ok,
      a.device_ok,
      a.ip,
      datetime(a.created_at, '+5 hours', '+30 minutes') AS created_at_ist,
      e.email AS employee_email
    FROM attendance_logs a
    LEFT JOIN employees e ON e.id = a.employee_id
    WHERE a.store_id = ?
      AND date(datetime(a.created_at, '+5 hours', '+30 minutes')) = ?
      AND a.event_type IN (${placeholders})
    ORDER BY a.id DESC
    `,
    [storeId, selectedDate, ...ADMIN_VISIBLE_EVENTS]
  );

  const openMin = parseSqliteTimeToMinutes(store.open_time);
  const graceMin = store.grace_enabled ? Number(store.grace_minutes || 10) : 0;

  const logs = rows.map((r) => {
    let timePart = "";
    if (r.created_at_ist && typeof r.created_at_ist === "string") {
      const parts = r.created_at_ist.split(" ");
      timePart = parts[1] || "";
    }

    const time12 = to12Hour(timePart);

    let punctuality = "N_A";
    let late_by_min = null;

    if (r.event_type === "checkin" && r.employee_email && openMin !== null) {
      const tMin = parseSqliteTimeToMinutes(timePart);
      if (tMin !== null) {
        const cutoff = openMin + graceMin;
        if (tMin <= cutoff) {
          punctuality = "ON_TIME";
        } else {
          punctuality = "LATE";
          late_by_min = tMin - cutoff;
        }
      }
    }

    return { ...r, time: timePart, time12, punctuality, late_by_min };
  });

  res.renderPage("admin/logs", { title: "Attendance Logs", store, selectedDate, logs });
});

// ---------- CSV EXPORT (day) ----------
router.get("/store/:storeId/logs.csv", requireAdmin, async (req, res) => {
  const adminId = req.session.adminId;
  const storeId = Number(req.params.storeId);

  const store = await dbGet(
    "SELECT id, name, open_time, grace_enabled, grace_minutes FROM stores WHERE id = ? AND admin_id = ?",
    [storeId, adminId]
  );
  if (!store) return res.status(404).send("Store not found.");

  await cleanupOldLogs(storeId);

  const selectedDate = String(req.query.date || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) {
    return res.status(400).send("Invalid date. Use YYYY-MM-DD");
  }

  const placeholders = sqlInListPlaceholders(ADMIN_VISIBLE_EVENTS.length);

  const rows = await dbAll(
    `
    SELECT
      datetime(a.created_at, '+5 hours', '+30 minutes') AS created_at_ist,
      e.email AS employee_email,
      a.event_type,
      a.gps_ok,
      a.device_ok,
      a.ip
    FROM attendance_logs a
    LEFT JOIN employees e ON e.id = a.employee_id
    WHERE a.store_id = ?
      AND date(datetime(a.created_at, '+5 hours', '+30 minutes')) = ?
      AND a.event_type IN (${placeholders})
    ORDER BY a.id ASC
    `,
    [storeId, selectedDate, ...ADMIN_VISIBLE_EVENTS]
  );

  const openMin = parseSqliteTimeToMinutes(store.open_time);
  const graceMin = store.grace_enabled ? Number(store.grace_minutes || 10) : 0;

  const header = [
    "store",
    "date",
    "time_12hr",
    "employee",
    "event",
    "status",
    "late_by_min",
    "gps_ok",
    "device_ok",
    "ip"
  ];

  const lines = [header.join(",")];

  for (const r of rows) {
    const parts = String(r.created_at_ist || "").split(" ");
    const datePart = parts[0] || "";
    const timePart = parts[1] || "";
    const time12 = to12Hour(timePart);

    let status = "";
    let late_by_min = "";

    if (r.event_type === "checkin" && r.employee_email && openMin !== null) {
      const tMin = parseSqliteTimeToMinutes(timePart);
      const cutoff = openMin + graceMin;
      if (tMin !== null) {
        if (tMin <= cutoff) status = "ON_TIME";
        else {
          status = "LATE";
          late_by_min = String(tMin - cutoff);
        }
      }
    }

    const row = [
      `"${String(store.name).replace(/"/g, '""')}"`,
      `"${datePart}"`,
      `"${time12}"`,
      `"${String(r.employee_email || "").replace(/"/g, '""')}"`,
      `"${String(r.event_type || "")}"`,
      `"${status}"`,
      `"${late_by_min}"`,
      r.gps_ok ? "1" : "0",
      r.device_ok ? "1" : "0",
      `"${String(r.ip || "").replace(/"/g, '""')}"`
    ];

    lines.push(row.join(","));
  }

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="logs_${storeId}_${selectedDate}.csv"`);
  res.send(lines.join("\n"));
});

// ---------- CSV EXPORT (month) ----------
router.get("/store/:storeId/logs_month.csv", requireAdmin, async (req, res) => {
  const adminId = req.session.adminId;
  const storeId = Number(req.params.storeId);

  const store = await dbGet(
    "SELECT id, name, open_time, grace_enabled, grace_minutes FROM stores WHERE id = ? AND admin_id = ?",
    [storeId, adminId]
  );
  if (!store) return res.status(404).send("Store not found.");

  await cleanupOldLogs(storeId);

  const month = String(req.query.month || "");
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).send("Invalid month. Use YYYY-MM");
  }

  const placeholders = sqlInListPlaceholders(ADMIN_VISIBLE_EVENTS.length);

  const rows = await dbAll(
    `
    SELECT
      datetime(a.created_at, '+5 hours', '+30 minutes') AS created_at_ist,
      e.email AS employee_email,
      a.event_type,
      a.gps_ok,
      a.device_ok,
      a.ip
    FROM attendance_logs a
    LEFT JOIN employees e ON e.id = a.employee_id
    WHERE a.store_id = ?
      AND strftime('%Y-%m', datetime(a.created_at, '+5 hours', '+30 minutes')) = ?
      AND a.event_type IN (${placeholders})
    ORDER BY a.id ASC
    `,
    [storeId, month, ...ADMIN_VISIBLE_EVENTS]
  );

  const openMin = parseSqliteTimeToMinutes(store.open_time);
  const graceMin = store.grace_enabled ? Number(store.grace_minutes || 10) : 0;

  const header = [
    "store",
    "date",
    "time_12hr",
    "employee",
    "event",
    "status",
    "late_by_min",
    "gps_ok",
    "device_ok",
    "ip"
  ];

  const lines = [header.join(",")];

  for (const r of rows) {
    const parts = String(r.created_at_ist || "").split(" ");
    const datePart = parts[0] || "";
    const timePart = parts[1] || "";
    const time12 = to12Hour(timePart);

    let status = "";
    let late_by_min = "";

    if (r.event_type === "checkin" && r.employee_email && openMin !== null) {
      const tMin = parseSqliteTimeToMinutes(timePart);
      const cutoff = openMin + graceMin;
      if (tMin !== null) {
        if (tMin <= cutoff) status = "ON_TIME";
        else {
          status = "LATE";
          late_by_min = String(tMin - cutoff);
        }
      }
    }

    const row = [
      `"${String(store.name).replace(/"/g, '""')}"`,
      `"${datePart}"`,
      `"${time12}"`,
      `"${String(r.employee_email || "").replace(/"/g, '""')}"`,
      `"${String(r.event_type || "")}"`,
      `"${status}"`,
      `"${late_by_min}"`,
      r.gps_ok ? "1" : "0",
      r.device_ok ? "1" : "0",
      `"${String(r.ip || "").replace(/"/g, '""')}"`
    ];

    lines.push(row.join(","));
  }

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="logs_${storeId}_${month}.csv"`);
  res.send(lines.join("\n"));
});

// ---------- UPGRADE ----------
function normalizePlan(p) {
  return String(p || "").trim().toLowerCase();
}

function getUpgradeOptions(currentPlan) {
  const plan = normalizePlan(currentPlan);
  if (plan === "standard") return ["pro", "enterprise"];
  if (plan === "pro") return ["enterprise"];
  return [];
}

router.get("/upgrade", requireAdmin, async (req, res) => {
  const adminId = req.session.adminId;
  const admin = await dbGet("SELECT id, email, plan FROM admins WHERE id = ?", [adminId]);

  const options = getUpgradeOptions(admin?.plan);

  const pendingUpgrade = await dbGet(
    "SELECT id, from_plan, to_plan, status, created_at FROM upgrade_requests WHERE admin_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1",
    [adminId]
  );

  return res.renderPage("admin/upgrade_request", {
    title: "Upgrade Plan",
    admin,
    options,
    pendingUpgrade,
    error: null,
    message: null
  });
});

router.post("/upgrade", requireAdmin, async (req, res) => {
  const adminId = req.session.adminId;
  const admin = await dbGet("SELECT id, email, plan FROM admins WHERE id = ?", [adminId]);

  const options = getUpgradeOptions(admin?.plan);
  const toPlan = normalizePlan(req.body.to_plan);

  const pendingUpgrade = await dbGet(
    "SELECT id FROM upgrade_requests WHERE admin_id = ? AND status = 'pending' LIMIT 1",
    [adminId]
  );

  if (pendingUpgrade) {
    return res.renderPage("admin/upgrade_request", {
      title: "Upgrade Plan",
      admin,
      options,
      pendingUpgrade,
      error: "You already have a pending upgrade request. Please wait for approval.",
      message: null
    });
  }

  if (!options.includes(toPlan)) {
    return res.renderPage("admin/upgrade_request", {
      title: "Upgrade Plan",
      admin,
      options,
      pendingUpgrade: null,
      error: "Invalid upgrade option.",
      message: null
    });
  }

  await dbRun(
    "INSERT INTO upgrade_requests (admin_id, from_plan, to_plan, status) VALUES (?, ?, ?, 'pending')",
    [adminId, normalizePlan(admin.plan), toPlan]
  );

  try {
    await sendMail({
      to: process.env.SUPERADMIN_EMAIL,
      subject: "Thlengta upgrade request",
      text:
        `Admin requested upgrade.\n\n` +
        `Admin ID: ${adminId}\n` +
        `Admin Email: ${admin.email}\n` +
        `From: ${normalizePlan(admin.plan)}\n` +
        `To: ${toPlan}\n` +
        `Time: ${new Date().toISOString()}\n`
    });
  } catch (e) {
    console.error("Failed to email superadmin about upgrade:", e.message);
  }

  return res.renderPage("admin/upgrade_request", {
    title: "Upgrade Plan",
    admin,
    options,
    pendingUpgrade: {
      from_plan: normalizePlan(admin.plan),
      to_plan: toPlan,
      status: "pending",
      created_at: new Date().toISOString()
    },
    error: null,
    message: "Upgrade requested"
  });
});

// helper to pick alert type from query
function pickAlertTypeFromQuery(req) {
  const t = String(req.query.type || "").trim().toLowerCase();
  if (t === "success" || t === "error") return t;
  return null;
}

// ---------- MANAGERS (Enterprise, per-store) ----------
// (your existing managers code unchanged)
router.get("/store/:storeId/managers", requireAdmin, async (req, res) => {
  const adminId = req.session.adminId;
  const storeId = Number(req.params.storeId);

  const store = await dbGet("SELECT id, name FROM stores WHERE id = ? AND admin_id = ?", [
    storeId,
    adminId
  ]);
  if (!store) return res.status(404).send("Store not found.");

  const admin = await dbGet("SELECT id, plan FROM admins WHERE id = ?", [adminId]);
  const plan = String(admin?.plan || "").toLowerCase();

  if (plan !== "enterprise") {
    return res.renderPage("admin/managers_list", {
      title: "Managers",
      store,
      managers: [],
      enterpriseOnly: true,
      msg: "Managers are available only on Enterprise plan. Upgrade to gain this useful feature!",
      alertType: "error"
    });
  }

  const managers = await dbAll(
    `
    SELECT
      m.id,
      m.email,
      m.is_active,
      m.created_at
    FROM manager_stores ms
    JOIN managers m ON m.id = ms.manager_id
    WHERE ms.store_id = ?
      AND m.admin_id = ?
    ORDER BY m.id DESC
    `,
    [storeId, adminId]
  );

  const msg = req.query.msg ? String(req.query.msg) : null;
  const alertType = pickAlertTypeFromQuery(req);

  return res.renderPage("admin/managers_list", {
    title: "Managers",
    store,
    managers,
    enterpriseOnly: false,
    msg,
    alertType
  });
});

router.get("/store/:storeId/managers/new", requireAdmin, async (req, res) => {
  const adminId = req.session.adminId;
  const storeId = Number(req.params.storeId);

  const store = await dbGet("SELECT id, name FROM stores WHERE id = ? AND admin_id = ?", [
    storeId,
    adminId
  ]);
  if (!store) return res.status(404).send("Store not found.");

  const admin = await dbGet("SELECT id, plan FROM admins WHERE id = ?", [adminId]);
  const plan = String(admin?.plan || "").toLowerCase();
  if (plan !== "enterprise") {
    return res.renderPage("admin/manager_new", {
      title: "Add Manager",
      store,
      error: "Managers are available only on Enterprise plan.",
      enterpriseOnly: true
    });
  }

  return res.renderPage("admin/manager_new", {
    title: "Add Manager",
    store,
    error: null,
    enterpriseOnly: false
  });
});

router.post("/store/:storeId/managers/new", requireAdmin, async (req, res) => {
  try {
    const adminId = req.session.adminId;
    const storeId = Number(req.params.storeId);

    const store = await dbGet("SELECT id, name FROM stores WHERE id = ? AND admin_id = ?", [
      storeId,
      adminId
    ]);
    if (!store) return res.status(404).send("Store not found.");

    const admin = await dbGet("SELECT id, plan FROM admins WHERE id = ?", [adminId]);
    const plan = String(admin?.plan || "").toLowerCase();
    if (plan !== "enterprise") {
      return res.renderPage("admin/manager_new", {
        title: "Add Manager",
        store,
        error: "Managers are available only on Enterprise plan.",
        enterpriseOnly: true
      });
    }

    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return res.renderPage("admin/manager_new", {
        title: "Add Manager",
        store,
        error: "Enter a valid email.",
        enterpriseOnly: false
      });
    }

    let manager = await dbGet("SELECT id, admin_id, email FROM managers WHERE email = ?", [email]);

    if (manager && Number(manager.admin_id) !== Number(adminId)) {
      return res.renderPage("admin/manager_new", {
        title: "Add Manager",
        store,
        error: "This email is already used by another company. Use a different email.",
        enterpriseOnly: false
      });
    }

    if (!manager) {
      if (!password || password.length < 8) {
        return res.renderPage("admin/manager_new", {
          title: "Add Manager",
          store,
          error: "Password must be at least 8 characters.",
          enterpriseOnly: false
        });
      }

      const password_hash = await bcrypt.hash(password, 12);

      const result = await dbRun(
        "INSERT INTO managers (admin_id, email, password_hash, is_active) VALUES (?, ?, ?, 1)",
        [adminId, email, password_hash]
      );

      manager = { id: result.lastID, admin_id: adminId, email };
    }

    const existsMap = await dbGet(
      "SELECT id FROM manager_stores WHERE manager_id = ? AND store_id = ?",
      [manager.id, storeId]
    );

    if (!existsMap) {
      await dbRun("INSERT INTO manager_stores (manager_id, store_id) VALUES (?, ?)", [
        manager.id,
        storeId
      ]);
    }

    return res.redirect(
      `/admin/store/${storeId}/managers?type=success&msg=` +
        encodeURIComponent("Manager assigned to this store.")
    );
  } catch (err) {
    console.error(err);
    return res.status(500).send("Server error");
  }
});

router.post("/store/:storeId/managers/:managerId/toggle", requireAdmin, async (req, res) => {
  try {
    const adminId = req.session.adminId;
    const storeId = Number(req.params.storeId);
    const managerId = Number(req.params.managerId);

    const store = await dbGet("SELECT id FROM stores WHERE id = ? AND admin_id = ?", [
      storeId,
      adminId
    ]);
    if (!store) return res.status(404).send("Store not found.");

    const mgr = await dbGet("SELECT id, is_active FROM managers WHERE id = ? AND admin_id = ?", [
      managerId,
      adminId
    ]);
    if (!mgr) return res.status(404).send("Manager not found.");

    const newVal = mgr.is_active ? 0 : 1;
    await dbRun("UPDATE managers SET is_active = ? WHERE id = ? AND admin_id = ?", [
      newVal,
      managerId,
      adminId
    ]);

    return res.redirect(
      `/admin/store/${storeId}/managers?type=success&msg=` +
        encodeURIComponent("Manager status updated.")
    );
  } catch (err) {
    console.error(err);
    return res.status(500).send("Server error");
  }
});

router.post("/store/:storeId/managers/:managerId/remove", requireAdmin, async (req, res) => {
  try {
    const adminId = req.session.adminId;
    const storeId = Number(req.params.storeId);
    const managerId = Number(req.params.managerId);

    const store = await dbGet("SELECT id FROM stores WHERE id = ? AND admin_id = ?", [
      storeId,
      adminId
    ]);
    if (!store) return res.status(404).send("Store not found.");

    const mgr = await dbGet("SELECT id FROM managers WHERE id = ? AND admin_id = ?", [
      managerId,
      adminId
    ]);
    if (!mgr) return res.status(404).send("Manager not found.");

    await dbRun("DELETE FROM manager_stores WHERE manager_id = ? AND store_id = ?", [
      managerId,
      storeId
    ]);

    return res.redirect(
      `/admin/store/${storeId}/managers?type=success&msg=` +
        encodeURIComponent("Manager removed from this store.")
    );
  } catch (err) {
    console.error(err);
    return res.status(500).send("Server error");
  }
});

module.exports = router;
