const { dbGet } = require("./helpers");

const planLimitsCache = new Map();

async function getPlanLimits(plan) {
  if (planLimitsCache.has(plan)) {
    return planLimitsCache.get(plan);
  }
  const limits = await dbGet("SELECT * FROM plan_limits WHERE plan = ?", [plan]);
  if (limits) {
    planLimitsCache.set(plan, limits);
  }
  return limits;
}

function clearPlanLimitsCache() {
  planLimitsCache.clear();
}

async function canAddStore(userId) {
  const user = await dbGet("SELECT plan FROM users WHERE id = ?", [userId]);
  if (!user) {
    return { allowed: false, reason: "User not found" };
  }

  const limits = await getPlanLimits(user.plan);
  if (!limits) {
    return { allowed: false, reason: "Invalid plan" };
  }

  const current = await dbGet("SELECT COUNT(*) as count FROM stores WHERE user_id = ?", [userId]);

  if (limits.max_stores !== -1 && current.count >= limits.max_stores) {
    return {
      allowed: false,
      reason: `Plan limit: ${user.plan} allows ${limits.max_stores} store(s). Please upgrade.`
    };
  }

  return { allowed: true };
}

async function canAddEmployee(storeId) {
  const store = await dbGet("SELECT user_id FROM stores WHERE id = ?", [storeId]);
  if (!store) {
    return { allowed: false, reason: "Store not found" };
  }

  const user = await dbGet("SELECT plan FROM users WHERE id = ?", [store.user_id]);
  if (!user) {
    return { allowed: false, reason: "User not found" };
  }

  const limits = await getPlanLimits(user.plan);
  if (!limits) {
    return { allowed: false, reason: "Invalid plan" };
  }

  const current = await dbGet(
    "SELECT COUNT(*) as count FROM employees WHERE store_id = ? AND is_active = 1",
    [storeId]
  );

  if (limits.max_employees_per_store !== -1 && current.count >= limits.max_employees_per_store) {
    return {
      allowed: false,
      reason: `Plan limit: ${user.plan} allows ${limits.max_employees_per_store} employees per store. Please upgrade.`
    };
  }

  return { allowed: true };
}

async function canAddManager(userId) {
  const user = await dbGet("SELECT plan FROM users WHERE id = ?", [userId]);
  if (!user) {
    return { allowed: false, reason: "User not found" };
  }

  const limits = await getPlanLimits(user.plan);
  if (!limits) {
    return { allowed: false, reason: "Invalid plan" };
  }

  if (!limits.can_add_managers) {
    return {
      allowed: false,
      reason: "Managers are only available on Pro and Enterprise plans. Please upgrade."
    };
  }

  return { allowed: true };
}

async function canDownloadReports(userId) {
  const user = await dbGet("SELECT plan FROM users WHERE id = ?", [userId]);
  if (!user) {
    return { allowed: false, reason: "User not found" };
  }

  const limits = await getPlanLimits(user.plan);
  if (!limits || !limits.can_download_reports) {
    return {
      allowed: false,
      reason: "Report downloads are only available on Plus, Pro and Enterprise plans."
    };
  }

  return { allowed: true };
}

async function getUserPlanUsage(userId) {
  return await dbGet("SELECT * FROM user_plan_usage WHERE user_id = ?", [userId]);
}

async function getStoreEmployeeCount(storeId) {
  return await dbGet(
    "SELECT * FROM store_employee_counts WHERE store_id = ?",
    [storeId]
  );
}

module.exports = {
  getPlanLimits,
  clearPlanLimitsCache,
  canAddStore,
  canAddEmployee,
  canAddManager,
  canDownloadReports,
  getUserPlanUsage,
  getStoreEmployeeCount,
};
