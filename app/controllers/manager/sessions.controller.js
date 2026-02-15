const { dbRun } = require("../../db/helpers");

exports.destroy = async (req, res) => {
  try {
    const managerId = req.session?.managerId || null;

    if (!req.session) return res.redirect("/owner/login");
    req.session.destroy(() => res.redirect("/owner/login"));
  } catch (e) {
    console.error("[MANAGER LOGOUT]", e);
    if (req.session) {
      req.session.destroy(() => res.redirect("/owner/login"));
    } else {
      res.redirect("/owner/login");
    }
  }
};
