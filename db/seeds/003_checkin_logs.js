const { dbRun, dbGet, dbAll } = require("../helpers");

async function seedCheckinLogs() {
  console.log("Seeding check-in logs...");

  try {
    // Get some employees to create logs for
    const employees = await dbAll(
      "SELECT id, workplace_id FROM employees LIMIT 50"
    );

    if (!employees.length) {
      console.log("No employees found. Run 002_test_data.js first.");
      return;
    }

    console.log(`Found ${employees.length} employees, creating logs...`);

    // Create logs for each employee
    const now = new Date();
    let logsCreated = 0;

    for (let i = 0; i < employees.length; i++) {
      const emp = employees[i];

      // Generate random times over the past 7 days
      for (let day = 0; day < 7; day++) {
        const date = new Date(now);
        date.setDate(date.getDate() - day);

        // Random check-in time between 8:45 AM and 9:15 AM
        const checkinHour = 8 + Math.floor(Math.random() * 2);
        const checkinMin = 45 + Math.floor(Math.random() * 30);
        const checkinDate = new Date(date);
        checkinDate.setHours(checkinHour, checkinMin, 0, 0);

        // Check-in
        await dbRun(
          `INSERT INTO attendance_logs 
           (workplace_id, employee_id, event_type, device_verified, location_verified, lat, lng, created_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            emp.workplace_id,
            emp.id,
            "checkin",
            1,
            1,
            23.7 + Math.random() * 0.01,
            92.7 + Math.random() * 0.01,
            checkinDate.toISOString(),
          ]
        );
        logsCreated++;

        // Random check-out time between 5:30 PM and 6:15 PM
        const checkoutHour = 17 + Math.floor(Math.random() * 2);
        const checkoutMin = 30 + Math.floor(Math.random() * 45);
        const checkoutDate = new Date(date);
        checkoutDate.setHours(checkoutHour, checkoutMin, 0, 0);

        // Check-out
        await dbRun(
          `INSERT INTO attendance_logs 
           (workplace_id, employee_id, event_type, device_verified, location_verified, lat, lng, created_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            emp.workplace_id,
            emp.id,
            "checkout",
            1,
            1,
            23.7 + Math.random() * 0.01,
            92.7 + Math.random() * 0.01,
            checkoutDate.toISOString(),
          ]
        );
        logsCreated++;

        // Sometimes add break starts/ends
        if (Math.random() > 0.5) {
          const breakStartDate = new Date(date);
          breakStartDate.setHours(12, 30 + Math.floor(Math.random() * 20), 0, 0);

          await dbRun(
            `INSERT INTO attendance_logs 
             (workplace_id, employee_id, event_type, device_verified, location_verified, lat, lng, created_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              emp.workplace_id,
              emp.id,
              "break_start",
              1,
              1,
              23.7 + Math.random() * 0.01,
              92.7 + Math.random() * 0.01,
              breakStartDate.toISOString(),
            ]
          );
          logsCreated++;

          const breakEndDate = new Date(date);
          breakEndDate.setHours(13, 0 + Math.floor(Math.random() * 20), 0, 0);

          await dbRun(
            `INSERT INTO attendance_logs 
             (workplace_id, employee_id, event_type, device_verified, location_verified, lat, lng, created_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              emp.workplace_id,
              emp.id,
              "break_end",
              1,
              1,
              23.7 + Math.random() * 0.01,
              92.7 + Math.random() * 0.01,
              breakEndDate.toISOString(),
            ]
          );
          logsCreated++;
        }
      }

      if ((i + 1) % 10 === 0) {
        console.log(`Created logs for ${i + 1} employees...`);
      }
    }

    console.log(`\nSeed completed successfully!`);
    console.log(`Created ${logsCreated} check-in logs for ${employees.length} employees`);
    console.log(`Logs include: check-in, check-out, and break_start/break_end events`);
    console.log(`Date range: Past 7 days`);
  } catch (err) {
    console.error("Seed failed:", err.message);
    throw err;
  }
}

// Run seed if executed directly
if (require.main === module) {
  seedCheckinLogs().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { seedCheckinLogs };
