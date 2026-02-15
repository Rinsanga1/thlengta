const { dbGet, dbRun, dbAll } = require("../../../db/helpers");
const { nanoid } = require("nanoid");
const path = require("path");
const fs = require("fs");

const { toPngBuffer, makeFramedQrPng } = require("../../utils/qr");
const {
  ensureWorkplaceDraft,
  clearWorkplaceDraft,
  parseTime12hToHHMM,
  isValidLatLng,
} = require("../../utils/store.utils");
const { getOwnerId } = require("../../middleware/auth");

function getBaseUrl(req) {
  const envBase = process.env.BASE_URL;
  if (envBase) return envBase.replace(/\/+$/, "");
  return `${req.protocol}://${req.get("host")}`;
}

// this one is failing ?
// this is not called at all ?
exports.new = (req, res) => {
  console.log("this is not run for some reason");
  clearWorkplaceDraft(req);
  return res.redirect("/owner/stores/new/step-1");
};

exports.new_step1_get = (req, res) => {
  const draft = ensureWorkplaceDraft(req);
  return res.renderPage("owner/stores/new_step1", {
    title: "Create Workplace",
    draft,
    error: null
  });
};


exports.new_step1_post = async (req, res) => {
  const draft = ensureWorkplaceDraft(req);

  const name = (req.body.name || "").trim();
  const address = (req.body.address || "").trim();

  const open12 = (req.body.opening_time || "").trim();
  const close12 = (req.body.closing_time || "").trim();

  const opening_hhmm = parseTime12hToHHMM(open12);
  const closing_hhmm = parseTime12hToHHMM(close12);

  if (!name) {
    return res.renderPage("owner/stores/new_step1", {
      title: "Create Workplace",
      draft,
      error: "Workplace name is required."
    });
  }
  if (!opening_hhmm || !closing_hhmm) {
    return res.renderPage("owner/stores/new_step1", {
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

  return res.redirect("/owner/stores/new/step-2");
};

exports.new_step2_get = (req, res) => {
  const draft = ensureWorkplaceDraft(req);
  if (!draft.name) return res.redirect("/owner/stores/new/step-1");

  return res.renderPage("owner/stores/new_step2_location", {
    title: "Workplace Location",
    draft,
    error: null
  });
};

exports.new_step2_post = (req, res) => {
  const draft = ensureWorkplaceDraft(req);
  if (!draft.name) return res.redirect("/owner/stores/new/step-1");

  const { lat, lng, accuracy_m } = req.body;

  if (!isValidLatLng(lat, lng)) {
    return res.renderPage("owner/stores/new_step2_location", {
      title: "Workplace Location",
      draft,
      error: "Invalid latitude/longitude."
    });
  }

  draft.lat = Number(lat);
  draft.lng = Number(lng);
  draft.accuracy_m = accuracy_m ? Number(accuracy_m) : null;

  return res.redirect("/owner/stores/new/step-3");
};

exports.new_step3_get = (req, res) => {
  const draft = ensureWorkplaceDraft(req);
  if (!draft.lat || !draft.lng) return res.redirect("/owner/stores/new/step-2");

  if (!draft.radius_m) draft.radius_m = 70;

  return res.renderPage("owner/stores/new_step3_radius", {
    title: "Workplace Radius",
    draft,
    error: null
  });
};

exports.new_step3_post = (req, res) => {
  const draft = ensureWorkplaceDraft(req);
  if (!draft.lat || !draft.lng) return res.redirect("/owner/stores/new/step-2");

  const radius = Number(req.body.radius_m);
  if (!Number.isFinite(radius) || radius < 10 || radius > 1000) {
    return res.renderPage("owner/stores/new_step3_radius", {
      title: "Workplace Radius",
      draft,
      error: "Radius must be between 10 and 1000 meters."
    });
  }

  draft.radius_m = Math.round(radius);
  return res.redirect("/owner/stores/new/step-4");
};

exports.new_step4_get = (req, res) => {
  const draft = ensureWorkplaceDraft(req);
  if (!draft.radius_m) return res.redirect("/owner/stores/new/step-3");

  return res.renderPage("owner/stores/new_step4_review", {
    title: "Review Workplace",
    draft,
    error: null
  });
};

exports.create = async (req, res) => {
  try {
    const userId = getOwnerId(req);
    const draft = ensureWorkplaceDraft(req);

    if (!draft || !draft.name || !draft.lat || !draft.lng || !draft.radius_m) {
      return res.redirect("/owner/stores/new/step-1");
    }

    const userRow = await dbGet("SELECT plan FROM users WHERE id = ?", [userId]);
    const plan = String(userRow?.plan || "free").toLowerCase();

    let maxStores = 1;
    if (plan === "plus") maxStores = 1;
    if (plan === "pro") maxStores = 20;
    if (plan === "enterprise") maxStores = Number.POSITIVE_INFINITY;

    const countRow = await dbGet("SELECT COUNT(*) AS cnt FROM stores WHERE user_id = ?", [userId]);
    const currentCount = Number(countRow?.cnt || 0);

    if (currentCount >= maxStores) {
      return res.renderPage("owner/stores/new_step4_review", {
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
      `INSERT INTO stores (
        user_id, name, public_id, lat, lng, radius_m,
        logo_path, open_time, close_time,
        grace_enabled, grace_minutes
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 10)`,
      [
        userId,
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

    return res.redirect(`/owner/stores/${storeId}/qr`);
  } catch (err) {
    console.error(err);
    return res.renderPage("owner/stores/new_step4_review", {
      title: "Review Workplace",
      draft: ensureWorkplaceDraft(req),
      error: "Something went wrong while creating workplace."
    });
  }
};

exports.show = async (req, res) => {
  const userId = getOwnerId(req);
  const storeId = Number(req.params.storeId);

  const store = await dbGet("SELECT id, name, public_id FROM stores WHERE id = ? AND user_id = ?", [
    storeId,
    userId
  ]);
  if (!store) return res.status(404).send("Store not found.");

  const scanUrl = `${getBaseUrl(req)}/e/scan/${store.public_id}?src=qr`;
  res.renderPage("owner/stores/show", { title: "Store QR", store, scanUrl });
};

exports.qrPng = async (req, res) => {
  const userId = getOwnerId(req);
  const storeId = Number(req.params.storeId);

  const store = await dbGet("SELECT id, public_id FROM stores WHERE id = ? AND user_id = ?", [
    storeId,
    userId
  ]);
  if (!store) return res.status(404).send("Store not found.");

  const scanUrl = `${getBaseUrl(req)}/e/scan/${store.public_id}?src=qr`;
  const png = await toPngBuffer(scanUrl);

  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "no-store");
  res.send(png);
};

exports.edit = async (req, res) => {
  const userId = getOwnerId(req);
  const storeId = Number(req.params.storeId);

  const store = await dbGet(
    "SELECT id, name, public_id, logo_path, open_time, close_time, grace_enabled, grace_minutes FROM stores WHERE id = ? AND user_id = ?",
    [storeId, userId]
  );
  if (!store) return res.status(404).send("Store not found.");

  const userRow = await dbGet("SELECT plan FROM users WHERE id = ?", [userId]);
  const plan = userRow?.plan || "free";

  res.renderPage("owner/stores/edit", {
    title: "Store Settings",
    store,
    plan,
    message: req.query.msg || null,
    error: null
  });
};

exports.update = async (req, res) => {
  try {
    const userId = getOwnerId(req);
    const storeId = Number(req.params.storeId);

    const open_time = String(req.body.open_time || "").trim();
    const close_time = String(req.body.close_time || "").trim();
    const grace_enabled = req.body.grace_enabled ? 1 : 0;

    await dbRun(
      "UPDATE stores SET open_time = ?, close_time = ?, grace_enabled = ? WHERE id = ? AND user_id = ?",
      [open_time || null, close_time || null, grace_enabled, storeId, userId]
    );

    return res.redirect(`/owner/stores/${storeId}/edit?msg=` + encodeURIComponent("Store times saved."));
  } catch (err) {
    console.error(err);
    return res.status(500).send("Server error");
  }
};

exports.updateLogo = async (req, res) => {
  try {
    const userId = getOwnerId(req);
    const storeId = Number(req.params.storeId);

    if (!req.file || !req.file.filename) {
      return res.redirect(`/owner/stores/${storeId}/edit?msg=` + encodeURIComponent("No file uploaded."));
    }

    const store = await dbGet("SELECT id, logo_path FROM stores WHERE id = ? AND user_id = ?", [
      storeId,
      userId
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

    await dbRun("UPDATE stores SET logo_path = ? WHERE id = ? AND user_id = ?", [
      newLogoPath,
      storeId,
      userId
    ]);

    return res.redirect(`/owner/stores/${storeId}/edit?msg=` + encodeURIComponent("Logo updated."));
  } catch (err) {
    console.error(err);
    return res.status(500).send("Server error");
  }
};

exports.destroy = async (req, res) => {
  try {
    const userId = getOwnerId(req);
    const storeId = Number(req.params.storeId);

    const store = await dbGet("SELECT id, logo_path FROM stores WHERE id = ? AND user_id = ?", [
      storeId,
      userId
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
    await dbRun("DELETE FROM stores WHERE id = ? AND user_id = ?", [storeId, userId]);

    res.redirect("/owner/dashboard");
  } catch (err) {
    console.error(err);
    return res.status(500).send("Server error");
  }
};

exports.rotateQr = async (req, res) => {
  const userId = getOwnerId(req);
  const storeId = Number(req.params.storeId);

  const store = await dbGet("SELECT id FROM stores WHERE id = ? AND user_id = ?", [
    storeId,
    userId
  ]);
  if (!store) return res.status(404).send("Store not found.");

  const newPublicId = nanoid(10);

  await dbRun("UPDATE stores SET public_id = ? WHERE id = ? AND user_id = ?", [
    newPublicId,
    storeId,
    userId
  ]);

  res.redirect(`/owner/stores/${storeId}/edit?msg=` + encodeURIComponent("QR rotated. Print the new QR now."));
};

exports.testQrDownload = async (req, res) => {
  const userId = getOwnerId(req);
  const stores = await dbAll(
    "SELECT id, name FROM stores WHERE user_id = ? ORDER BY id DESC",
    [userId]
  );
  return res.renderPage("owner/stores/test_qr_download", {
    title: "Test QR Download",
    stores
  });
};

exports.testQrDownloadRawPng = async (req, res) => {
  const userId = getOwnerId(req);
  const storeId = Number(req.params.storeId);

  const store = await dbGet(
    "SELECT id, public_id, name FROM stores WHERE id = ? AND user_id = ?",
    [storeId, userId]
  );
  if (!store) return res.status(404).send("Store not found.");

  const scanUrl = `${getBaseUrl(req)}/e/scan/${store.public_id}?src=qr`;
  const png = await toPngBuffer(scanUrl);

  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Disposition", `attachment; filename="thlengta-raw-qr-${storeId}.png"`);
  return res.send(png);
};

exports.testQrDownloadFramedPng = async (req, res) => {
  const userId = getOwnerId(req);
  const storeId = Number(req.params.storeId);

  const store = await dbGet(
    "SELECT id, public_id, name FROM stores WHERE id = ? AND user_id = ?",
    [storeId, userId]
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
};

exports.debugFrame = async (req, res) => {
  try {
    const p = path.join(process.cwd(), "public", "assets", "img", "qr-frame.png");
    res.send({ ok: true, framePath: p, exists: fs.existsSync(p) });
  } catch (e) {
    res.status(500).send({ ok: false, error: String(e.message || e) });
  }
};
