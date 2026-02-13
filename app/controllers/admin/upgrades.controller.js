const { dbGet, dbRun } = require("../../db/helpers");
const { sendMail } = require("../../utils/mailer");
const { normalizePlan, getUpgradeOptions } = require("../../utils/plan.utils"); // Our new plan utils

// Displays the form for requesting an upgrade (new action)
exports.new = async (req, res) => {
  const adminId = req.session.adminId;
  const admin = await dbGet("SELECT id, email, plan FROM admins WHERE id = ?", [adminId]);

  const options = getUpgradeOptions(admin?.plan);

  const pendingUpgrade = await dbGet(
    "SELECT id, from_plan, to_plan, status, created_at FROM upgrade_requests WHERE admin_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1",
    [adminId]
  );

  return res.renderPage("admin/upgrades/new", { // Renamed view
    title: "Upgrade Plan",
    admin,
    options,
    pendingUpgrade,
    error: null,
    message: null
  });
};

// Handles the submission of an upgrade request (create action)
exports.create = async (req, res) => {
  const adminId = req.session.adminId;
  const admin = await dbGet("SELECT id, email, plan FROM admins WHERE id = ?", [adminId]);

  const options = getUpgradeOptions(admin?.plan);
  const toPlan = normalizePlan(req.body.to_plan);

  const pendingUpgrade = await dbGet(
    "SELECT id FROM upgrade_requests WHERE admin_id = ? AND status = 'pending' LIMIT 1",
    [adminId]
  );

  if (pendingUpgrade) {
    return res.renderPage("admin/upgrades/new", { // Renamed view
      title: "Upgrade Plan",
      admin,
      options,
      pendingUpgrade,
      error: "You already have a pending upgrade request. Please wait for approval.",
      message: null
    });
  }

  if (!options.includes(toPlan)) {
    return res.renderPage("admin/upgrades/new", { // Renamed view
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
        `Admin requested upgrade.

` +
        `Admin ID: ${adminId}
` +
        `Admin Email: ${admin.email}
` +
        `From: ${normalizePlan(admin.plan)}
` +
        `To: ${toPlan}
` +
        `Time: ${new Date().toISOString()}
`
    });
  } catch (e) {
    console.error("Failed to email superadmin about upgrade:", e.message);
  }

  return res.renderPage("admin/upgrades/new", { // Renamed view
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
};
