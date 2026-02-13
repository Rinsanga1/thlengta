const { dbGet, dbAll } = require("../../db/helpers");

// Displays the superadmin dashboard (index action)
exports.index = async (req, res) => {
  const admins = await dbAll(
    "SELECT id, email, name, phone, address, status, expires_at, created_at, plan, requested_plan FROM admins ORDER BY id DESC",
    []
  );

  const stats = await dbAll(
    `
    SELECT
      s.admin_id AS admin_id,
      COUNT(DISTINCT s.id) AS store_count,
      COUNT(DISTINCT e.id) AS employee_count
    FROM stores s
    LEFT JOIN employees e ON e.store_id = s.id
    GROUP BY s.admin_id
    `,
    []
  );

  const storeNames = await dbAll(
    `
    SELECT admin_id, GROUP_CONCAT(name, ', ') AS store_names
    FROM stores
    GROUP BY admin_id
    `,
    []
  );

  const statMap = new Map(stats.map((r) => [r.admin_id, r]));
  const nameMap = new Map(storeNames.map((r) => [r.admin_id, r.store_names || ""]));

  const now = new Date();

  const rows = admins.map((a) => {
    const st = statMap.get(a.id) || { store_count: 0, employee_count: 0 };
    const stores = nameMap.get(a.id) || "";
    let expired = false;
    if (a.expires_at) expired = new Date(a.expires_at) < now;
    return {
      ...a,
      store_count: st.store_count,
      employee_count: st.employee_count,
      store_names: stores,
      expired
    };
  });

  res.renderPage("superadmin/dashboard/index", { // Renamed view
    title: "Super Admin Dashboard",
    admins: rows,
    msg: req.query.msg || null
  });
};

// Handles the root /superadmin path, redirecting to dashboard
exports.gateway = (req, res) => {
  res.redirect("/superadmin/dashboard");
};
