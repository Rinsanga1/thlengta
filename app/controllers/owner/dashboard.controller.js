const { dbGet, dbAll } = require("../../db/helpers");
const { getOwnerId, getOwnerType } = require("../../middleware/auth");


exports.index = async (req, res) => {
  const ownerId = getOwnerId(req);
  const ownerType = getOwnerType(req);

  if (!ownerId) {
    return res.redirect("/users/signin");
  }

  let admin;
  if (ownerType === "user") {
    admin = await dbGet("SELECT id, email, plan FROM users WHERE id = ?", [ownerId]);
  } else {
    admin = await dbGet("SELECT id, email, plan FROM admins WHERE id = ?", [ownerId]);
  }

  if (!admin) {
    req.session.destroy();
    return res.redirect("/users/signin");
  }

  const stores = await dbAll("SELECT id, name, public_id FROM stores WHERE admin_id = ?", [ownerId]);

  const pendingUpgrade = await dbGet(
    `SELECT id, from_plan, to_plan, status, created_at
     FROM upgrade_requests
     WHERE admin_id = ? AND status = 'pending'
     ORDER BY id DESC
     LIMIT 1`,
    [ownerId]
  );

  return res.renderPage("owner/dashboard/index", {
    title: ownerType === "user" ? "Dashboard" : "Admin Dashboard",
    admin,
    stores,
    pendingUpgrade
  });
};


exports.gateway = (req, res) => {
  const ownerId = getOwnerId(req);

  if (ownerId) {
    return res.redirect("/owner/dashboard");
  }

  if (req.session?.managerId && req.session?.managerAdminId) {
    return res.redirect("/manager/dashboard");
  }

  return res.redirect("/users/signin");
};
