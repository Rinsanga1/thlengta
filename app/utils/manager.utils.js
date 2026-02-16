const { dbGet } = require("../../db/helpers");

async function getManagerWorkplaceOrNull(managerId, userId, workplaceId) {
  return dbGet(
    `
    SELECT
      w.id,
      w.user_id,
      w.name,
      w.public_id,
      w.lat,
      w.lng,
      w.radius_m,
      w.open_time,
      w.grace_enabled,
      w.grace_minutes
    FROM workplaces w
    INNER JOIN manager_workplaces mw ON mw.workplace_id = w.id
    WHERE mw.manager_id = ?
      AND w.user_id = ?
      AND w.id = ?
    `,
    [managerId, userId, workplaceId]
  );
}

module.exports = {
  getManagerWorkplaceOrNull,
};
