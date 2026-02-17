const { dbGet, dbRun, dbAll } = require("../../../db/helpers");
const { nanoid } = require("nanoid");
const path = require("path");
const fs = require("fs");

const { toPngBuffer, makeFramedQrPng } = require("../../utils/qr");
const {
  parseTime12hToHHMM,
  isValidLatLng,
} = require("../../utils/workplace.utils");
const { getOwnerId } = require("../../middleware/auth");
const { canAddWorkplace } = require("../../../db/validators");
const bcrypt = require("bcryptjs");

const ITEMS_PER_PAGE = 10;

function getBaseUrl(req) {
  const envBase = process.env.BASE_URL;
  if (envBase) return envBase.replace(/\/+$/, "");
  return `${req.protocol}://${req.get("host")}`;
}

// Redirect old /edit route to settings tab
exports.editRedirect = (req, res) => {
  const workplaceId = req.params.workplaceId;
  return res.redirect(`/owner/workplaces/${workplaceId}?tab=settings`);
};

// GET /owner/workplaces/:workplaceId - Unified dashboard with tabs
exports.dashboard = async (req, res) => {
  const userId = getOwnerId(req);
  const workplaceId = Number(req.params.workplaceId);
  const activeTab = req.query.tab || "checkin";

  const workplace = await dbGet(
    "SELECT * FROM workplaces WHERE id = ? AND user_id = ?",
    [workplaceId, userId]
  );
  if (!workplace) return res.status(404).send("Workplace not found.");

  const user = await dbGet("SELECT plan FROM users WHERE id = ?", [userId]);
  const plan = user?.plan || "free";

  const scanUrl = `${getBaseUrl(req)}/e/scan/${workplace.public_id}?src=qr`;

  // Data for each tab
  let employees = [];
  let managers = [];
  let todayLogs = [];
  let checkinData = [];
  let msg = req.query.msg || null;
  let employeePage = 1;
  let employeeTotalPages = 1;
  let employeeTotalItems = 0;
  let selectedDate = new Date().toISOString().split('T')[0];

  if (activeTab === "employees") {
    employeePage = Math.max(1, Number(req.query.empPage) || 1);
    const offset = (employeePage - 1) * ITEMS_PER_PAGE;

    const countResult = await dbGet(
      "SELECT COUNT(*) as total FROM employees WHERE workplace_id = ?",
      [workplaceId]
    );
    employeeTotalItems = countResult?.total || 0;
    employeeTotalPages = Math.ceil(employeeTotalItems / ITEMS_PER_PAGE);

    employees = await dbAll(
      `SELECT e.*, 
        CASE WHEN EXISTS (SELECT 1 FROM employee_device_fps f WHERE f.employee_id = e.id) THEN 1 ELSE 0 END as has_device
       FROM employees e WHERE e.workplace_id = ? ORDER BY e.id DESC LIMIT ? OFFSET ?`,
      [workplaceId, ITEMS_PER_PAGE, offset]
    );
  }

  // CHECK-IN TAB: Get all active employees with their check-in status for today
  if (activeTab === "checkin") {
    const today = new Date().toISOString().split('T')[0];
    
    checkinData = await dbAll(
      `SELECT 
        e.id,
        e.email,
        e.is_active,
        CASE WHEN EXISTS (
          SELECT 1 FROM attendance_logs a 
          WHERE a.employee_id = e.id 
            AND a.workplace_id = ? 
            AND a.event_type = 'checkin'
            AND date(datetime(a.created_at, '+5 hours', '+30 minutes')) = ?
        ) THEN 1 ELSE 0 END as has_checked_in,
        (
          SELECT datetime(a.created_at, '+5 hours', '+30 minutes')
          FROM attendance_logs a
          WHERE a.employee_id = e.id
            AND a.workplace_id = ?
            AND a.event_type = 'checkin'
            AND date(datetime(a.created_at, '+5 hours', '+30 minutes')) = ?
          ORDER BY a.id ASC
          LIMIT 1
        ) as checkin_time
       FROM employees e 
       WHERE e.workplace_id = ? AND e.is_active = 1
       ORDER BY has_checked_in DESC, e.email ASC`,
      [workplaceId, today, workplaceId, today, workplaceId]
    );
  }

  if (activeTab === "managers" && plan === "enterprise") {
    managers = await dbAll(
      `SELECT m.* FROM manager_workplaces mw 
       JOIN managers m ON m.id = mw.manager_id 
       WHERE mw.workplace_id = ? AND m.user_id = ? ORDER BY m.id DESC`,
      [workplaceId, userId]
    );
  }

  // Track if a filter is applied for logs tab
  let isFilterApplied = false;
  let logPage = 1;
  let hasPrevLogPage = false;
  let hasNextLogPage = false;
  
  if (activeTab === "logs") {
    // Check if date parameter is provided from date picker
    const dateParam = req.query.date;
    
    let targetDate;
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      // User selected a specific date from date picker
      selectedDate = dateParam;
      targetDate = new Date(selectedDate);
      
      // Calculate how many days ago this date is from today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const pickedDate = new Date(selectedDate);
      pickedDate.setHours(0, 0, 0, 0);
      
      const diffTime = today - pickedDate;
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      logPage = diffDays + 1; // page 1 = today, page 2 = yesterday, etc.
    } else {
      // Get page number (1 = today, 2 = yesterday, etc.)
      logPage = Math.max(1, parseInt(req.query.logPage) || 1);
      
      // Calculate the date based on page (page 1 = today, page 2 = yesterday, etc.)
      targetDate = new Date();
      targetDate.setDate(targetDate.getDate() - (logPage - 1));
      selectedDate = targetDate.toISOString().split('T')[0];
      targetDate = new Date(selectedDate);
    }
    
    // Check if there's a previous page (more recent date)
    hasPrevLogPage = logPage > 1;
    
    // Check if there's a next page (older date with logs)
    const nextDate = new Date(targetDate);
    nextDate.setDate(nextDate.getDate() - 1);
    const nextDateStr = nextDate.toISOString().split('T')[0];
    
    const nextPageCheck = await dbGet(
      `SELECT COUNT(*) as count FROM attendance_logs 
       WHERE workplace_id = ? 
       AND date(datetime(created_at, '+5 hours', '+30 minutes')) = ?`,
      [workplaceId, nextDateStr]
    );
    hasNextLogPage = nextPageCheck.count > 0;
    
    // Check if current date is not today (for showing "Back to Present" button)
    const today = new Date().toISOString().split('T')[0];
    isFilterApplied = selectedDate !== today;
    
    todayLogs = await dbAll(
      `SELECT a.*, 
              a.location_verified AS gps_ok,
              a.device_verified AS device_ok,
              e.email as employee_email,
              datetime(a.created_at, '+5 hours', '+30 minutes') as created_at_ist
       FROM attendance_logs a 
       LEFT JOIN employees e ON e.id = a.employee_id 
       WHERE a.workplace_id = ? 
         AND date(datetime(a.created_at, '+5 hours', '+30 minutes')) = ?
       ORDER BY a.id DESC LIMIT 100`,
      [workplaceId, selectedDate]
    );
  }

  res.renderPage("owner/workplaces/dashboard", {
    title: workplace.name,
    workplace,
    plan,
    scanUrl,
    activeTab,
    employees,
    managers,
    logs: todayLogs,
    checkinData,
    msg,
    isEnterprise: plan === "enterprise",
    employeePage,
    employeeTotalPages,
    employeeTotalItems,
    selectedDate,
    isFilterApplied,
    logPage,
    hasPrevLogPage,
    hasNextLogPage
  });
};

// GET /owner/workplaces/new - Show combined form
exports.new = (req, res) => {
  return res.renderPage("owner/workplaces/new", {
    title: "Create Workplace",
    error: null,
    formData: {}
  });
};

// POST /owner/workplaces - Create workplace from combined form
exports.create = async (req, res) => {
  try {
    const userId = getOwnerId(req);
    
    // Check plan limits
    const canAdd = await canAddWorkplace(userId);
    if (!canAdd.allowed) {
      return res.renderPage("owner/workplaces/new", {
        title: "Create Workplace",
        error: canAdd.reason,
        formData: req.body
      });
    }

    // Extract and validate all fields
    const name = (req.body.name || "").trim();
    const address = (req.body.address || "").trim();
    const open12 = (req.body.opening_time || "").trim();
    const close12 = (req.body.closing_time || "").trim();
    const lat = Number(req.body.lat);
    const lng = Number(req.body.lng);
    const radius_m = Number(req.body.radius_m) || 70;

    // Validate required fields
    const errors = [];
    if (!name) errors.push("Workplace name is required");
    
    const opening_hhmm = parseTime12hToHHMM(open12);
    const closing_hhmm = parseTime12hToHHMM(close12);
    if (!opening_hhmm) errors.push("Opening time must be in 12-hour format like 9:00 AM");
    if (!closing_hhmm) errors.push("Closing time must be in 12-hour format like 5:00 PM");
    if (!isValidLatLng(lat, lng)) errors.push("Valid latitude and longitude are required");
    if (radius_m < 10 || radius_m > 1000) errors.push("Radius must be between 10 and 1000 meters");

    if (errors.length > 0) {
      return res.renderPage("owner/workplaces/new", {
        title: "Create Workplace",
        error: errors.join(". "),
        formData: req.body
      });
    }

    // Handle logo upload
    let logo_path = null;
    if (req.file && req.file.filename) {
      logo_path = `/uploads/${req.file.filename}`;
    }

    // Generate public ID
    const public_id = nanoid(10);

    // Create workplace
    const result = await dbRun(
      `INSERT INTO workplaces (
        user_id, name, public_id, lat, lng, radius_m,
        logo_path, open_time, close_time,
        grace_enabled, grace_minutes
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 10)`,
      [
        userId,
        name,
        public_id,
        lat,
        lng,
        radius_m,
        logo_path,
        opening_hhmm,
        closing_hhmm,
        0
      ]
    );

    const workplaceId = result.lastID;
    return res.redirect(`/owner/workplaces/${workplaceId}/qr`);
    
  } catch (err) {
    console.error("Error creating workplace:", err);
    return res.renderPage("owner/workplaces/new", {
      title: "Create Workplace",
      error: "Something went wrong while creating the workplace. Please try again.",
      formData: req.body
    });
  }
};

// GET /owner/workplaces/:workplaceId - Show QR
exports.show = async (req, res) => {
  const userId = getOwnerId(req);
  const workplaceId = Number(req.params.workplaceId);

  const workplace = await dbGet("SELECT id, name, public_id FROM workplaces WHERE id = ? AND user_id = ?", [
    workplaceId,
    userId
  ]);
  if (!workplace) return res.status(404).send("Workplace not found.");

  const scanUrl = `${getBaseUrl(req)}/e/scan/${workplace.public_id}?src=qr`;
  res.renderPage("owner/workplaces/show", { title: "Workplace QR", workplace, scanUrl });
};

// GET /owner/workplaces/:workplaceId/qr.png - Get QR PNG
exports.qrPng = async (req, res) => {
  const userId = getOwnerId(req);
  const workplaceId = Number(req.params.workplaceId);

  const workplace = await dbGet("SELECT id, public_id FROM workplaces WHERE id = ? AND user_id = ?", [
    workplaceId,
    userId
  ]);
  if (!workplace) return res.status(404).send("Workplace not found.");

  const scanUrl = `${getBaseUrl(req)}/e/scan/${workplace.public_id}?src=qr`;
  const png = await toPngBuffer(scanUrl);

  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "no-store");
  res.send(png);
};

// GET /owner/workplaces/:workplaceId/edit - Settings page
exports.edit = async (req, res) => {
  const userId = getOwnerId(req);
  const workplaceId = Number(req.params.workplaceId);

  const workplace = await dbGet(
    "SELECT id, name, public_id, logo_path, open_time, close_time, grace_enabled, grace_minutes, lat, lng, radius_m FROM workplaces WHERE id = ? AND user_id = ?",
    [workplaceId, userId]
  );
  if (!workplace) return res.status(404).send("Workplace not found.");

  res.renderPage("owner/workplaces/edit", {
    title: "Workplace Settings",
    workplace,
    message: req.query.msg || null,
    error: null
  });
};

// POST /owner/workplaces/:workplaceId/settings - Update settings
exports.update = async (req, res) => {
  try {
    const userId = getOwnerId(req);
    const workplaceId = Number(req.params.workplaceId);

    const workplace = await dbGet("SELECT id, logo_path FROM workplaces WHERE id = ? AND user_id = ?", [
      workplaceId,
      userId
    ]);
    if (!workplace) return res.status(404).send("Workplace not found.");

    const saveDetails = req.body.saveDetails;
    const saveRadius = req.body.saveRadius;

    if (saveDetails) {
      // Save details section
      const name = String(req.body.name || "").trim();
      const address = String(req.body.address || "").trim();
      const open_time = String(req.body.open_time || "").trim();
      const close_time = String(req.body.close_time || "").trim();
      const grace_enabled = req.body.grace_enabled ? 1 : 0;

      let logo_path = workplace.logo_path;

      if (req.file && req.file.filename) {
        if (workplace.logo_path && workplace.logo_path.startsWith("/uploads/")) {
          const oldAbs = path.join(process.cwd(), "public", workplace.logo_path);
          try {
            if (fs.existsSync(oldAbs)) fs.unlinkSync(oldAbs);
          } catch (e) {
            console.warn("Failed to delete old logo:", e.message);
          }
        }
        logo_path = `/uploads/${req.file.filename}`;
      }

      await dbRun(
        `UPDATE workplaces SET name = ?, address = ?, open_time = ?, close_time = ?, grace_enabled = ?, logo_path = ? WHERE id = ? AND user_id = ?`,
        [name, address || null, open_time || null, close_time || null, grace_enabled, logo_path, workplaceId, userId]
      );

      return res.redirect(`/owner/workplaces/${workplaceId}?tab=settings&msg=` + encodeURIComponent("Details saved successfully."));
    }

    if (saveRadius) {
      // Save radius section
      const name = String(req.body.name || "").trim();
      const lat = req.body.lat ? Number(req.body.lat) : null;
      const lng = req.body.lng ? Number(req.body.lng) : null;
      const radius_m = req.body.radius_m ? Number(req.body.radius_m) : 70;

      await dbRun(
        `UPDATE workplaces SET name = ?, lat = ?, lng = ?, radius_m = ? WHERE id = ? AND user_id = ?`,
        [name, lat, lng, radius_m, workplaceId, userId]
      );

      return res.redirect(`/owner/workplaces/${workplaceId}?tab=settings&msg=` + encodeURIComponent("Radius saved successfully."));
    }

    // Original save (all fields)
    const name = String(req.body.name || "").trim();
    const address = String(req.body.address || "").trim();
    const open_time = String(req.body.open_time || "").trim();
    const close_time = String(req.body.close_time || "").trim();
    const grace_enabled = req.body.grace_enabled ? 1 : 0;
    const lat = req.body.lat ? Number(req.body.lat) : null;
    const lng = req.body.lng ? Number(req.body.lng) : null;
    const radius_m = req.body.radius_m ? Number(req.body.radius_m) : 70;

    let logo_path = workplace.logo_path;

    // Handle logo upload
    if (req.file && req.file.filename) {
      // Delete old logo if exists
      if (workplace.logo_path && workplace.logo_path.startsWith("/uploads/")) {
        const oldAbs = path.join(process.cwd(), "public", workplace.logo_path);
        try {
          if (fs.existsSync(oldAbs)) fs.unlinkSync(oldAbs);
        } catch (e) {
          console.warn("Failed to delete old logo:", e.message);
        }
      }
      logo_path = `/uploads/${req.file.filename}`;
    }

    await dbRun(
      `UPDATE workplaces SET 
        name = ?, address = ?, open_time = ?, close_time = ?, 
        grace_enabled = ?, lat = ?, lng = ?, radius_m = ?, logo_path = ? 
       WHERE id = ? AND user_id = ?`,
      [name, address || null, open_time || null, close_time || null, 
       grace_enabled, lat, lng, radius_m, logo_path, workplaceId, userId]
    );

    return res.redirect(`/owner/workplaces/${workplaceId}?tab=settings&msg=` + encodeURIComponent("Workplace settings saved."));
  } catch (err) {
    console.error(err);
    return res.status(500).send("Server error");
  }
};

// POST /owner/workplaces/:workplaceId/logo - Update logo
exports.updateLogo = async (req, res) => {
  try {
    const userId = getOwnerId(req);
    const workplaceId = Number(req.params.workplaceId);

    if (!req.file || !req.file.filename) {
      return res.redirect(`/owner/workplaces/${workplaceId}/edit?msg=` + encodeURIComponent("No file uploaded."));
    }

    const workplace = await dbGet("SELECT id, logo_path FROM workplaces WHERE id = ? AND user_id = ?", [
      workplaceId,
      userId
    ]);
    if (!workplace) return res.status(404).send("Workplace not found.");

    const newLogoPath = `/uploads/${req.file.filename}`;

    if (workplace.logo_path && workplace.logo_path.startsWith("/uploads/")) {
      const oldAbs = path.join(process.cwd(), "public", workplace.logo_path);
      try {
        if (fs.existsSync(oldAbs)) fs.unlinkSync(oldAbs);
      } catch (e) {
        console.warn("Failed to delete old logo:", e.message);
      }
    }

    await dbRun("UPDATE workplaces SET logo_path = ? WHERE id = ? AND user_id = ?", [
      newLogoPath,
      workplaceId,
      userId
    ]);

    return res.redirect(`/owner/workplaces/${workplaceId}/edit?msg=` + encodeURIComponent("Logo updated."));
  } catch (err) {
    console.error(err);
    return res.status(500).send("Server error");
  }
};

// POST /owner/workplaces/:workplaceId/delete - Delete workplace
exports.destroy = async (req, res) => {
  try {
    const userId = getOwnerId(req);
    const workplaceId = Number(req.params.workplaceId);

    const workplace = await dbGet("SELECT id, logo_path FROM workplaces WHERE id = ? AND user_id = ?", [
      workplaceId,
      userId
    ]);
    if (!workplace) return res.status(404).send("Workplace not found.");

    if (workplace.logo_path && workplace.logo_path.startsWith("/uploads/")) {
      const oldAbs = path.join(process.cwd(), "public", workplace.logo_path);
      try {
        if (fs.existsSync(oldAbs)) fs.unlinkSync(oldAbs);
      } catch (e) {
        console.warn("Failed to delete logo file:", e.message);
      }
    }

    await dbRun(
      `DELETE FROM employee_devices
       WHERE employee_id IN (SELECT id FROM employees WHERE workplace_id = ?)`,
      [workplaceId]
    );

    await dbRun("DELETE FROM attendance_logs WHERE workplace_id = ?", [workplaceId]);
    await dbRun("DELETE FROM employees WHERE workplace_id = ?", [workplaceId]);
    await dbRun("DELETE FROM workplaces WHERE id = ? AND user_id = ?", [workplaceId, userId]);

    res.redirect("/owner/dashboard");
  } catch (err) {
    console.error(err);
    return res.status(500).send("Server error");
  }
};

// POST /owner/workplaces/:workplaceId/qr/rotate - Rotate QR
exports.rotateQr = async (req, res) => {
  const userId = getOwnerId(req);
  const workplaceId = Number(req.params.workplaceId);

  const workplace = await dbGet("SELECT id FROM workplaces WHERE id = ? AND user_id = ?", [
    workplaceId,
    userId
  ]);
  if (!workplace) return res.status(404).send("Workplace not found.");

  const newPublicId = nanoid(10);

  await dbRun("UPDATE workplaces SET public_id = ? WHERE id = ? AND user_id = ?", [
    newPublicId,
    workplaceId,
    userId
  ]);

  res.redirect(`/owner/workplaces/${workplaceId}/edit?msg=` + encodeURIComponent("QR rotated. Print the new QR now."));
};

// Test QR Download routes
exports.testQrDownload = async (req, res) => {
  const userId = getOwnerId(req);
  const workplaces = await dbAll(
    "SELECT id, name FROM workplaces WHERE user_id = ? ORDER BY id DESC",
    [userId]
  );
  return res.renderPage("owner/workplaces/test_qr_download", {
    title: "Test QR Download",
    workplaces
  });
};

exports.testQrDownloadRawPng = async (req, res) => {
  const userId = getOwnerId(req);
  const workplaceId = Number(req.params.workplaceId);

  const workplace = await dbGet(
    "SELECT id, public_id, name FROM workplaces WHERE id = ? AND user_id = ?",
    [workplaceId, userId]
  );
  if (!workplace) return res.status(404).send("Workplace not found.");

  const scanUrl = `${getBaseUrl(req)}/e/scan/${workplace.public_id}?src=qr`;
  const png = await toPngBuffer(scanUrl);

  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Disposition", `attachment; filename="thlengta-raw-qr-${workplaceId}.png"`);
  return res.send(png);
};

exports.testQrDownloadFramedPng = async (req, res) => {
  const userId = getOwnerId(req);
  const workplaceId = Number(req.params.workplaceId);

  const workplace = await dbGet(
    "SELECT id, public_id, name FROM workplaces WHERE id = ? AND user_id = ?",
    [workplaceId, userId]
  );
  if (!workplace) return res.status(404).send("Workplace not found.");

  const scanUrl = `${getBaseUrl(req)}/e/scan/${workplace.public_id}?src=qr`;
  const qrPng = await toPngBuffer(scanUrl);

  const framed = await makeFramedQrPng(qrPng, {
    qrSize: 720,
    offsetX: 0,
    offsetY: 0
  });

  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Disposition", `attachment; filename="thlengta-framed-qr-${workplaceId}.png"`);
  return res.send(framed);
};

exports.debugFrame = async (req, res) => {
  try {
    const p = path.join(process.cwd(), "public", "assets", "img", "qr-frame.png");
    res.send({ ok: true, framePath: p, exists: fs.existsSync(p) });
  } catch (e) {
    res.status(500).send({ ok: false, error: String(e.message || e) });
  }
};
