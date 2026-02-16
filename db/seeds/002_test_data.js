const bcrypt = require("bcryptjs");
const { dbRun, dbGet } = require("../helpers");
const { nanoid } = require("nanoid");

async function seedTestData() {
  console.log("Seeding test data...");

  try {
    // Check if user already exists
    const existingUser = await dbGet("SELECT id FROM users WHERE email = ?", [
      "owner@email.com",
    ]);

    if (existingUser) {
      console.log("Test user already exists. Skipping seed.");
      return;
    }

    // Create user with enterprise plan
    const passwordHash = await bcrypt.hash("owner@123", 12);
    const userResult = await dbRun(
      "INSERT INTO users (email, password_hash, name, plan, status) VALUES (?, ?, ?, ?, ?)",
      ["owner@email.com", passwordHash, "Test Owner", "enterprise", "active"]
    );

    const userId = userResult.lastID;
    console.log(`Created user: owner@email.com (ID: ${userId})`);

    // Create 20 workplaces
    const workplaces = [];
    for (let i = 1; i <= 20; i++) {
      const publicId = nanoid(10);
      const lat = 23.7 + Math.random() * 0.1; // Random lat around Mizoram
      const lng = 92.7 + Math.random() * 0.1; // Random lng around Mizoram

      const result = await dbRun(
        `INSERT INTO workplaces 
         (user_id, name, public_id, lat, lng, radius_m, open_time, close_time, grace_enabled, grace_minutes) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          `Workplace ${i}`,
          publicId,
          lat,
          lng,
          100,
          "09:00",
          "18:00",
          1,
          10,
        ]
      );

      workplaces.push({ id: result.lastID, name: `Workplace ${i}` });
    }

    console.log(`Created ${workplaces.length} workplaces`);

    // Create 100 employees per workplace (2000 total)
    let totalEmployees = 0;
    for (const workplace of workplaces) {
      for (let j = 1; j <= 100; j++) {
        const email = `employee${workplace.id}_${j}@test.com`;
        const pinHash = await bcrypt.hash(String(1000 + j), 12); // PINs: 1001, 1002, etc.

        await dbRun(
          "INSERT INTO employees (workplace_id, email, pin_hash, is_active) VALUES (?, ?, ?, 1)",
          [workplace.id, email, pinHash]
        );

        totalEmployees++;
      }

      if (workplace.id % 5 === 0) {
        console.log(
          `Created employees for workplace ${workplace.id}... (${totalEmployees} total so far)`
        );
      }
    }

    console.log(`\nSeed completed successfully!`);
    console.log(`User: owner@email.com / owner@123`);
    console.log(`Plan: Enterprise`);
    console.log(`Workplaces: ${workplaces.length}`);
    console.log(`Employees: ${totalEmployees} (100 per workplace)`);
  } catch (err) {
    console.error("Seed failed:", err.message);
    throw err;
  }
}

// Run seed if executed directly
if (require.main === module) {
  seedTestData().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { seedTestData };
