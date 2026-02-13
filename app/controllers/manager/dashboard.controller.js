const { dbGet, dbAll } = require("../../db/helpers");
const { getManagerStoreOrNull } = require("../../utils/manager.utils");

// Displays the manager dashboard
exports.index = async (req, res) => {
  try {
    const managerId = req.session.managerId;
    const adminId = req.session.managerAdminId;

    const manager = await dbGet(
      "SELECT id, admin_id, email, is_active FROM managers WHERE id = ? AND admin_id = ?",
      [managerId, adminId]
    );

    if (!manager || !manager.is_active) {
      req.session.destroy(() => {});
      return res.redirect("/admin/login");
    }

    const admin = await dbGet("SELECT id, email, plan FROM admins WHERE id = ?", [adminId]);

    const stores = await dbAll(
      `
      SELECT
        s.id,
        s.name,
        s.public_id,
        s.lat,
        s.lng,
        s.radius_m
      FROM stores s
      INNER JOIN manager_stores ms ON ms.store_id = s.id
      WHERE ms.manager_id = ?
        AND s.admin_id = ?
      ORDER BY s.id DESC
      `,
      [managerId, adminId]
    );

    return res.renderPage("manager/dashboard/index", { // Renamed view
      title: "Manager Dashboard",
      manager,
      admin,
      stores
    });
  } catch (err) {
    console.error("Manager dashboard error:", err);
    return res.status(500).send("Server error");
  }
};
