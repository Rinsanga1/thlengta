const { dbGet, dbAll, dbRun } = require("../../db/helpers");

// Lists pending upgrade requests
exports.index = async (req, res) => {
  const rows = await dbAll(
    `
    SELECT
      ur.id,
      ur.admin_id,
      ur.from_plan,
      ur.to_plan,
      ur.status,
      ur.created_at,
      a.email AS admin_email
    FROM upgrade_requests ur
    JOIN admins a ON a.id = ur.admin_id
    WHERE ur.status = 'pending'
    ORDER BY ur.id DESC
    `
  );

  res.renderPage("superadmin/upgrade_requests/index", { // Renamed view
    title: "Upgrade Requests",
    rows,
    msg: req.query.msg || null,
    error: null
  });
};

// Approves an upgrade request
exports.approve = async (req, res) => {
  const superadminId = req.session.superAdminId;
  const id = Number(req.params.id);

  const reqRow = await dbGet(
    `SELECT id, admin_id, to_plan, status FROM upgrade_requests WHERE id = ?`,
    [id]
  );

  if (!reqRow || reqRow.status !== "pending") {
    return res.redirect(
      "/superadmin/upgrade-requests?msg=" +
        encodeURIComponent("Request not found or already handled.")
    );
  }

  await dbRun(`UPDATE admins SET plan = ? WHERE id = ?`, [String(reqRow.to_plan), reqRow.admin_id]);

  await dbRun(
    `
    UPDATE upgrade_requests
    SET status = 'approved',
        resolved_at = CURRENT_TIMESTAMP,
        resolved_by_superadmin_id = ?
    WHERE id = ?
    `,
    [superadminId, id]
  );

  return res.redirect("/superadmin/upgrade-requests?msg=" + encodeURIComponent("Approved and plan updated."));
};

// Rejects an upgrade request
exports.reject = async (req, res) => {
  const superadminId = req.session.superAdminId;
  const id = Number(req.params.id);
  const note = String(req.body.note || "").trim().slice(0, 300);

  const reqRow = await dbGet(`SELECT id, status FROM upgrade_requests WHERE id = ?`, [id]);

  if (!reqRow || reqRow.status !== "pending") {
    return res.redirect(
      "/superadmin/upgrade-requests?msg=" +
        encodeURIComponent("Request not found or already handled.")
    );
  }

  await dbRun(
    `
    UPDATE upgrade_requests
    SET status = 'rejected',
        resolved_at = CURRENT_TIMESTAMP,
        resolved_by_superadmin_id = ?,
        note = ?
    WHERE id = ?
    `,
    [superadminId, note || null, id]
  );

  return res.redirect("/superadmin/upgrade-requests?msg=" + encodeURIComponent("Rejected."));
};
