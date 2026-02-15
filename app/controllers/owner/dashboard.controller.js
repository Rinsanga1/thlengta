const { dbGet, dbAll } = require("../../../db/helpers");
const { getOwnerId } = require("../../middleware/auth");


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

  const stores = await dbAll("SELECT id, name, public_id FROM stores WHERE user_id = ?", [userId]);

  return res.renderPage("owner/dashboard/index", {
    title: "Dashboard",
    admin: user,
    stores,
    pendingUpgrade: null
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
