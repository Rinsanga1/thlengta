const { dbGet, dbRun } = require("../../db/helpers");
const { sendMail } = require("../../utils/mailer");
const { normalizePlan, getUpgradeOptions } = require("../../utils/plan.utils");
const { getOwnerId } = require("../../middleware/auth");

exports.new = async (req, res) => {
  const userId = getOwnerId(req);

  const user = await dbGet("SELECT id, email, plan FROM users WHERE id = ?", [userId]);
  const plan = user?.plan || "free";

  const options = getUpgradeOptions(plan);

  const pendingUpgrade = await dbGet(
    "SELECT id, from_plan, to_plan, status, created_at FROM upgrade_requests WHERE user_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1",
    [userId]
  );

  return res.renderPage("owner/upgrades/new", {
    title: "Upgrade Plan",
    admin: user,
    options,
    pendingUpgrade,
    error: null,
    message: null
  });
};

exports.create = async (req, res) => {
  const userId = getOwnerId(req);

  const user = await dbGet("SELECT id, email, plan FROM users WHERE id = ?", [userId]);
  const plan = user?.plan || "free";

  const options = getUpgradeOptions(plan);
  const toPlan = normalizePlan(req.body.to_plan);

  const pendingUpgrade = await dbGet(
    "SELECT id FROM upgrade_requests WHERE user_id = ? AND status = 'pending' LIMIT 1",
    [userId]
  );

  if (pendingUpgrade) {
    return res.renderPage("owner/upgrades/new", {
      title: "Upgrade Plan",
      admin: user,
      options,
      pendingUpgrade,
      error: "You already have a pending upgrade request. Please wait for approval.",
      message: null
    });
  }

  if (!options.includes(toPlan)) {
    return res.renderPage("owner/upgrades/new", {
      title: "Upgrade Plan",
      admin: user,
      options,
      pendingUpgrade: null,
      error: "Invalid upgrade option.",
      message: null
    });
  }

  await dbRun(
    "INSERT INTO upgrade_requests (user_id, from_plan, to_plan, status) VALUES (?, ?, ?, 'pending')",
    [userId, normalizePlan(plan), toPlan]
  );

  try {
    await sendMail({
      to: process.env.SUPERADMIN_EMAIL,
      subject: "Thlengta upgrade request",
      text:
        `User requested upgrade.

 User ID: ${userId}
 User Email: ${user.email}
 From: ${normalizePlan(plan)}
 To: ${toPlan}
 Time: ${new Date().toISOString()}
 `
    });
  } catch (e) {
    console.error("Failed to email superadmin about upgrade:", e.message);
  }

  return res.renderPage("owner/upgrades/new", {
    title: "Upgrade Plan",
    admin: user,
    options,
    pendingUpgrade: {
      from_plan: normalizePlan(plan),
      to_plan: toPlan,
      status: "pending",
      created_at: new Date().toISOString()
    },
    error: null,
    message: "Upgrade requested"
  });
};
