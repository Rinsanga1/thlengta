const { dbGet, dbAll } = require("../../../db/helpers");
const { getManagerStoreOrNull } = require("../../utils/manager.utils");

exports.index = async (req, res) => {
  try {
    const managerId = req.session.managerId;
    const userId = req.session.managerUserId;

    const manager = await dbGet(
      "SELECT id, user_id, email, is_active FROM managers WHERE id = ? AND user_id = ?",
      [managerId, userId]
    );

    if (!manager || !manager.is_active) {
      req.session.destroy(() => {});
      return res.redirect("/owner/login");
    }

    const user = await dbGet("SELECT id, email, plan FROM users WHERE id = ?", [userId]);

    const stores = await dbAll(
      `SELECT
        s.id,
        s.name,
        s.public_id,
        s.lat,
        s.lng,
        s.radius_m
      FROM stores s
      INNER JOIN manager_stores ms ON ms.store_id = s.id
      WHERE ms.manager_id = ?
        AND s.user_id = ?
      ORDER BY s.id DESC`,
      [managerId, userId]
    );

    return res.renderPage("manager/dashboard/index", {
      title: "Manager Dashboard",
      manager,
      user,
      stores
    });
  } catch (err) {
    console.error("Manager dashboard error:", err);
    return res.status(500).send("Server error");
  }
};
