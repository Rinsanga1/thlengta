const { dbGet, dbAll } = require("../../../db/helpers");
const { getManagerWorkplaceOrNull } = require("../../utils/manager.utils");

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

    const workplaces = await dbAll(
      `SELECT
        w.id,
        w.name,
        w.public_id,
        w.lat,
        w.lng,
        w.radius_m
      FROM workplaces w
      INNER JOIN manager_workplaces mw ON mw.workplace_id = w.id
      WHERE mw.manager_id = ?
        AND w.user_id = ?
      ORDER BY w.id DESC`,
      [managerId, userId]
    );

    return res.renderPage("manager/dashboard/index", {
      title: "Manager Dashboard",
      manager,
      user,
      workplaces
    });
  } catch (err) {
    console.error("Manager dashboard error:", err);
    return res.status(500).send("Server error");
  }
};
