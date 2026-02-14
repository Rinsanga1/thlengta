const { dbGet, dbAll } = require("../../db/helpers");


// Displays the admin dashboard (index)
exports.index = async (req, res) => {
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

  res.renderPage("owner/dashboard/index", { // Renamed view
    title: "Admin Dashboard",
    admin,
    stores,
    pendingUpgrade
  });
};


// Handles the root /admin path, redirecting based on session status
exports.gateway = (req, res) => {
  if (req.session?.adminId) {
    return res.redirect("/owner/dashboard");
  }

  if (req.session?.managerId && req.session?.managerAdminId) {
    return res.redirect("/manager/dashboard");
  }

  return res.redirect("/owner/login");
};
