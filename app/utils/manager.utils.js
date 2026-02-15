const { dbGet } = require("../../db/helpers");

async function getManagerStoreOrNull(managerId, userId, storeId) {
  return dbGet(
    `
    SELECT
      s.id,
      s.user_id,
      s.name,
      s.public_id,
      s.lat,
      s.lng,
      s.radius_m,
      s.open_time,
      s.grace_enabled,
      s.grace_minutes
    FROM stores s
    INNER JOIN manager_stores ms ON ms.store_id = s.id
    WHERE ms.manager_id = ?
      AND s.user_id = ?
      AND s.id = ?
    `,
    [managerId, userId, storeId]
  );
}

module.exports = {
  getManagerStoreOrNull,
};
