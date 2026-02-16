const { dbGet, dbRun, dbAll } = require("../../../db/helpers");
const { getOwnerId } = require("../../middleware/auth");

const ITEMS_PER_PAGE = 10;

exports.index = async (req, res) => {
  console.log("dashboard ran");
  const userId = getOwnerId(req);

  if (!userId) {
    return res.redirect("/users/signin");
  }

  const user = await dbGet("SELECT id, email, plan FROM users WHERE id = ?", [userId]);

  if (!user) {
    req.session.destroy();
    return res.redirect("/users/signin");
  }

  const page = Math.max(1, Number(req.query.page) || 1);
  const offset = (page - 1) * ITEMS_PER_PAGE;

  const countResult = await dbGet("SELECT COUNT(*) as total FROM workplaces WHERE user_id = ?", [userId]);
  const totalItems = countResult?.total || 0;
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

  const workplaces = await dbAll(
    "SELECT id, name, public_id FROM workplaces WHERE user_id = ? ORDER BY id DESC LIMIT ? OFFSET ?",
    [userId, ITEMS_PER_PAGE, offset]
  );

  return res.renderPage("owner/dashboard/index", {
    title: "Dashboard",
    admin: user,
    workplaces,
    pendingUpgrade: null,
    page,
    totalPages,
    totalItems
  });
};


exports.gateway = (req, res) => {
  const userId = getOwnerId(req);

  if (userId) {
    return res.redirect("/owner/dashboard");
  }

  if (req.session?.managerId && req.session?.managerUserId) {
    return res.redirect("/manager/dashboard");
  }

  return res.redirect("/users/signin");
};
