require("dotenv").config();
const bcrypt = require("bcryptjs");
const { dbGet, dbRun } = require("./db/helpers");

(async () => {
  const email = process.env.SUPERADMIN_EMAIL;
  const pass = process.env.SUPERADMIN_PASSWORD;

  if (!email || !pass) {
    console.log("Set SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD in .env");
    process.exit(1);
  }

  const existing = await dbGet(
    "SELECT id FROM super_admins WHERE email = ?",
    [email.toLowerCase()]
  );

  if (existing) {
    console.log("Super admin exists");
    process.exit(0);
  }

  const hash = await bcrypt.hash(pass, 12);

  await dbRun(
    "INSERT INTO super_admins (email, password_hash) VALUES (?, ?)",
    [email.toLowerCase(), hash]
  );

  console.log("Super admin created");
  process.exit(0);
})();
