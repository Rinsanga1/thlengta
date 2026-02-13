exports.normalizePlan = (input) => {
  const plan = String(input || "standard").trim().toLowerCase();
  const allowed = ["standard", "pro", "enterprise"];
  return allowed.includes(plan) ? plan : "standard";
};


// IMPORTANT (future-ready):
// Keep emails globally unique across all account types (admins + managers)
// so password reset + email OTP can work reliably later.
exports.emailAlreadyUsed = async (email) => {
  const e = String(email || "").trim().toLowerCase();
  if (!e) return false;

  const existingAdmin = await dbGet("SELECT id FROM admins WHERE email = ?", [e]);
  if (existingAdmin) return true;

  // Managers table will exist once you apply the schema update.
  // If the table doesn't exist yet, this query would error.
  // So we guard it with a safe try/catch.
  try {
    const existingManager = await dbGet("SELECT id FROM managers WHERE email = ?", [e]);
    if (existingManager) return true;
  } catch (err) {
    // If managers table isn't created yet, ignore here.
    // This keeps current production safe while you roll out DB changes.
  }

  return false;
}

