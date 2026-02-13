function normalizePlan(p) {
  return String(p || "").trim().toLowerCase();
}

function getUpgradeOptions(currentPlan) {
  const plan = normalizePlan(currentPlan);
  if (plan === "standard") return ["pro", "enterprise"];
  if (plan === "pro") return ["enterprise"];
  return [];
}

module.exports = {
  normalizePlan,
  getUpgradeOptions,
};
