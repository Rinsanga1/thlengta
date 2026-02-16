const { dbGet, dbAll } = require("../../../db/helpers");

exports.index = async (req, res) => {
  const users = await dbAll(
    "SELECT id, email, name, phone, plan, status, created_at FROM users ORDER BY id DESC",
    []
  );

  const stats = await dbAll(
    `SELECT
      w.user_id AS user_id,
      COUNT(DISTINCT w.id) AS workplace_count,
      COUNT(DISTINCT e.id) AS employee_count
    FROM workplaces w
    LEFT JOIN employees e ON e.workplace_id = w.id
    GROUP BY w.user_id
    `,
    []
  );

  const workplaceNames = await dbAll(
    `SELECT user_id, GROUP_CONCAT(name, ', ') AS workplace_names
    FROM workplaces
    GROUP BY user_id
    `,
    []
  );

  const statMap = new Map(stats.map((r) => [r.user_id, r]));
  const nameMap = new Map(workplaceNames.map((r) => [r.user_id, r.workplace_names || ""]));

  const rows = users.map((u) => {
    const st = statMap.get(u.id) || { workplace_count: 0, employee_count: 0 };
    const workplaces = nameMap.get(u.id) || "";
    return {
      ...u,
      workplace_count: st.workplace_count,
      employee_count: st.employee_count,
      workplace_names: workplaces
    };
  });

  res.renderPage("superadmin/dashboard/index", {
    title: "Super Admin Dashboard",
    users: rows,
    msg: req.query.msg || null
  });
};

exports.gateway = (req, res) => {
  res.redirect("/superadmin/dashboard");
};
