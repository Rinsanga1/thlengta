const { dbRun } = require("./helpers");

function seedPlanLimits() {
  const seeds = [
    ["free", 1, 2, 0, 0, 0, 0],
    ["plus", 1, 10, 0, 1, 0, 59900],
    ["pro", 20, 200, 1, 1, 1, 99900],
    ["enterprise", -1, -1, 1, 1, 1, 2999900]
  ];

  for (const seed of seeds) {
    try {
      dbRun(
        "INSERT OR IGNORE INTO plan_limits (plan, max_stores, max_employees_per_store, can_add_managers, can_download_reports, has_priority_support, price_monthly) VALUES (?, ?, ?, ?, ?, ?, ?)",
        seed
      );
    } catch (err) {
      console.error("Failed to seed plan_limits:", err.message);
    }
  }
  
  console.log("Seeded plan_limits");
}

const command = process.argv[2] || "all";

if (command === "all" || command === "plan_limits") {
  seedPlanLimits();
}

console.log("Seeding complete");
