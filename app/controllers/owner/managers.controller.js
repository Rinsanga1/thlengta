const bcrypt = require("bcryptjs");
const { dbGet, dbRun, dbAll } = require("../../../db/helpers");
const { pickAlertTypeFromQuery } = require("../../utils/ui.utils");
const { getOwnerId } = require("../../middleware/auth");

exports.index = async (req, res) => {
  const userId = getOwnerId(req);
  const workplaceId = Number(req.params.workplaceId);

  const workplace = await dbGet("SELECT id, name FROM workplaces WHERE id = ? AND user_id = ?", [
    workplaceId,
    userId
  ]);
  if (!workplace) return res.status(404).send("Workplace not found.");

  const user = await dbGet("SELECT id, plan FROM users WHERE id = ?", [userId]);
  const plan = String(user?.plan || "").toLowerCase();

  if (plan !== "enterprise") {
    return res.renderPage("owner/managers/index", {
      title: "Managers",
      workplace,
      managers: [],
      enterpriseOnly: true,
      msg: "Managers are available only on Enterprise plan. Upgrade to gain this useful feature!",
      alertType: "error"
    });
  }

  const managers = await dbAll(
    `SELECT
      m.id,
      m.email,
      m.is_active,
      m.created_at
    FROM manager_workplaces mw
    JOIN managers m ON m.id = mw.manager_id
    WHERE mw.workplace_id = ?
      AND m.user_id = ?
    ORDER BY m.id DESC`,
    [workplaceId, userId]
  );

  const msg = req.query.msg ? String(req.query.msg) : null;
  const alertType = pickAlertTypeFromQuery(req);

  return res.renderPage("owner/managers/index", {
    title: "Managers",
    workplace,
    managers,
    enterpriseOnly: false,
    msg,
    alertType
  });
};

exports.new = async (req, res) => {
  const userId = getOwnerId(req);
  const workplaceId = Number(req.params.workplaceId);

  const workplace = await dbGet("SELECT id, name FROM workplaces WHERE id = ? AND user_id = ?", [
    workplaceId,
    userId
  ]);
  if (!workplace) return res.status(404).send("Workplace not found.");

  const user = await dbGet("SELECT id, plan FROM users WHERE id = ?", [userId]);
  const plan = String(user?.plan || "").toLowerCase();
  if (plan !== "enterprise") {
    return res.renderPage("owner/managers/new", {
      title: "Add Manager",
      workplace,
      error: "Managers are available only on Enterprise plan.",
      enterpriseOnly: true
    });
  }

  return res.renderPage("owner/managers/new", {
    title: "Add Manager",
    workplace,
    error: null,
    enterpriseOnly: false
  });
};

exports.create = async (req, res) => {
  try {
    const userId = getOwnerId(req);
    const workplaceId = Number(req.params.workplaceId);

    const workplace = await dbGet("SELECT id, name FROM workplaces WHERE id = ? AND user_id = ?", [
      workplaceId,
      userId
    ]);
    if (!workplace) return res.status(404).send("Workplace not found.");

    const user = await dbGet("SELECT id, plan FROM users WHERE id = ?", [userId]);
    const plan = String(user?.plan || "").toLowerCase();
    if (plan !== "enterprise") {
      return res.renderPage("owner/managers/new", {
        title: "Add Manager",
        workplace,
        error: "Managers are available only on Enterprise plan.",
        enterpriseOnly: true
      });
    }

    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return res.renderPage("owner/managers/new", {
        title: "Add Manager",
        workplace,
        error: "Enter a valid email.",
        enterpriseOnly: false
      });
    }

    let manager = await dbGet("SELECT id, user_id, email FROM managers WHERE email = ?", [email]);

    if (manager && Number(manager.user_id) !== Number(userId)) {
      return res.renderPage("owner/managers/new", {
        title: "Add Manager",
        workplace,
        error: "This email is already used by another company. Use a different email.",
        enterpriseOnly: false
      });
    }

    if (!manager) {
      if (!password || password.length < 8) {
        return res.renderPage("owner/managers/new", {
          title: "Add Manager",
          workplace,
          error: "Password must be at least 8 characters.",
          enterpriseOnly: false
        });
      }

      const password_hash = await bcrypt.hash(password, 12);

      const result = await dbRun(
        "INSERT INTO managers (user_id, email, password_hash, is_active) VALUES (?, ?, ?, 1)",
        [userId, email, password_hash]
      );

      manager = { id: result.lastID, user_id: userId, email };
    }

    const existsMap = await dbGet(
      "SELECT id FROM manager_workplaces WHERE manager_id = ? AND workplace_id = ?",
      [manager.id, workplaceId]
    );

    if (!existsMap) {
      await dbRun("INSERT INTO manager_workplaces (manager_id, workplace_id) VALUES (?, ?)", [
        manager.id,
        workplaceId
      ]);
    }

    return res.redirect(
      `/owner/workplaces/${workplaceId}/managers?type=success&msg=` +
        encodeURIComponent("Manager assigned to this workplace.")
    );
  } catch (err) {
    console.error(err);
    return res.status(500).send("Server error");
  }
};

exports.updateStatus = async (req, res) => {
  try {
    const userId = getOwnerId(req);
    const workplaceId = Number(req.params.workplaceId);
    const managerId = Number(req.params.managerId);

    const workplace = await dbGet("SELECT id FROM workplaces WHERE id = ? AND user_id = ?", [
      workplaceId,
      userId
    ]);
    if (!workplace) return res.status(404).send("Workplace not found.");

    const mgr = await dbGet("SELECT id, is_active FROM managers WHERE id = ? AND user_id = ?", [
      managerId,
      userId
    ]);
    if (!mgr) return res.status(404).send("Manager not found.");

    const newVal = mgr.is_active ? 0 : 1;
    await dbRun("UPDATE managers SET is_active = ? WHERE id = ? AND user_id = ?", [
      newVal,
      managerId,
      userId
    ]);

    return res.redirect(
      `/owner/workplaces/${workplaceId}/managers?type=success&msg=` +
        encodeURIComponent("Manager status updated.")
    );
  } catch (err) {
    console.error(err);
    return res.status(500).send("Server error");
  }
};

exports.destroy = async (req, res) => {
  try {
    const userId = getOwnerId(req);
    const workplaceId = Number(req.params.workplaceId);
    const managerId = Number(req.params.managerId);

    const workplace = await dbGet("SELECT id FROM workplaces WHERE id = ? AND user_id = ?", [
      workplaceId,
      userId
    ]);
    if (!workplace) return res.status(404).send("Workplace not found.");

    const mgr = await dbGet("SELECT id FROM managers WHERE id = ? AND user_id = ?", [
      managerId,
      userId
    ]);
    if (!mgr) return res.status(404).send("Manager not found.");

    await dbRun("DELETE FROM manager_workplaces WHERE manager_id = ? AND workplace_id = ?", [
      managerId,
      workplaceId
    ]);

    return res.redirect(
      `/owner/workplaces/${workplaceId}/managers?type=success&msg=` +
        encodeURIComponent("Manager removed from this workplace.")
    );
  } catch (err) {
    console.error(err);
    return res.status(500).send("Server error");
  }
};
