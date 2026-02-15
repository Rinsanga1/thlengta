const { dbGet, dbAll } = require("../../db/helpers");

exports.index = async (req, res) => {
  const users = await dbAll(
    "SELECT id, email, name, phone, plan, status, created_at FROM users ORDER BY id DESC",
    []
  );

  const stats = await dbAll(
    `SELECT
      s.user_id AS user_id,
      COUNT(DISTINCT s.id) AS store_count,
      COUNT(DISTINCT e.id) AS employee_count
    FROM stores s
    LEFT JOIN employees e ON e.store_id = s.id
    GROUP BY s.user_id
    `,
    []
  );

  const storeNames = await dbAll(
    `SELECT user_id, GROUP_CONCAT(name, ', ') AS store_names
    FROM stores
    GROUP BY user_id
    `,
    []
  );

  const statMap = new Map(stats.map((r) => [r.user_id, r]));
  const nameMap = new Map(storeNames.map((r) => [r.user_id, r.store_names || ""]));

  const rows = users.map((u) => {
    const st = statMap.get(u.id) || { store_count: 0, employee_count: 0 };
    const stores = nameMap.get(u.id) || "";
    return {
      ...u,
      store_count: st.store_count,
      employee_count: st.employee_count,
      store_names: stores
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
