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

async function canAddWorkplace(userId) {
  const user = await dbGet("SELECT plan FROM users WHERE id = ?", [userId]);
  if (!user) {
    return { allowed: false, reason: "User not found" };
  }

  const limits = await getPlanLimits(user.plan);
  if (!limits) {
    return { allowed: false, reason: "Invalid plan" };
  }

  const current = await dbGet("SELECT COUNT(*) as count FROM workplaces WHERE user_id = ?", [userId]);

  if (limits.max_workplaces !== -1 && current.count >= limits.max_workplaces) {
    return {
      allowed: false,
      reason: `Plan limit: ${user.plan} allows ${limits.max_workplaces} workplace(s). Please upgrade.`
    };
  }

  return { allowed: true };
}

async function canAddEmployee(workplaceId) {
  const workplace = await dbGet("SELECT user_id FROM workplaces WHERE id = ?", [workplaceId]);
  if (!workplace) {
    return { allowed: false, reason: "Workplace not found" };
  }

  const user = await dbGet("SELECT plan FROM users WHERE id = ?", [workplace.user_id]);
  if (!user) {
    return { allowed: false, reason: "User not found" };
  }

  const limits = await getPlanLimits(user.plan);
  if (!limits) {
    return { allowed: false, reason: "Invalid plan" };
  }

  const current = await dbGet(
    "SELECT COUNT(*) as count FROM employees WHERE workplace_id = ? AND is_active = 1",
    [workplaceId]
  );

  if (limits.max_employees_per_workplace !== -1 && current.count >= limits.max_employees_per_workplace) {
    return {
      allowed: false,
      reason: `Plan limit: ${user.plan} allows ${limits.max_employees_per_workplace} employees per workplace. Please upgrade.`
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

async function getWorkplaceEmployeeCount(workplaceId) {
  return await dbGet(
    "SELECT * FROM workplace_employee_counts WHERE workplace_id = ?",
    [workplaceId]
  );
}

module.exports = {
  getPlanLimits,
  clearPlanLimitsCache,
  canAddWorkplace,
  canAddEmployee,
  canAddManager,
  canDownloadReports,
  getUserPlanUsage,
  getWorkplaceEmployeeCount,
};
