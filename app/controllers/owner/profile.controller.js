const bcrypt = require("bcryptjs");
const { dbGet, dbRun } = require("../../../db/helpers");
const { getOwnerId } = require("../../middleware/auth");

// GET /owner/profile - Show profile page
exports.show = async (req, res) => {
  try {
    const userId = getOwnerId(req);
    
    const user = await dbGet(
      "SELECT id, email, name, phone, plan, status, created_at FROM users WHERE id = ?",
      [userId]
    );
    
    if (!user) {
      return res.status(404).send("User not found.");
    }

    // Get workplace count
    const workplaceCount = await dbGet(
      "SELECT COUNT(*) as count FROM workplaces WHERE user_id = ?",
      [userId]
    );

    // Get employee count across all workplaces
    const employeeCount = await dbGet(
      `SELECT COUNT(*) as count FROM employees e 
       JOIN workplaces w ON w.id = e.workplace_id 
       WHERE w.user_id = ?`,
      [userId]
    );

    res.renderPage("owner/profile/show", {
      title: "Profile",
      user,
      stats: {
        workplaces: workplaceCount?.count || 0,
        employees: employeeCount?.count || 0
      },
      msg: req.query.msg || null,
      error: req.query.error || null
    });
  } catch (err) {
    console.error("Profile show error:", err);
    return res.status(500).send("Server error");
  }
};

// POST /owner/profile - Update profile
exports.update = async (req, res) => {
  try {
    const userId = getOwnerId(req);
    
    const name = String(req.body.name || "").trim();
    const phone = String(req.body.phone || "").trim();
    
    // Validate
    if (!name) {
      return res.redirect("/owner/profile?error=" + encodeURIComponent("Name is required."));
    }
    
    await dbRun(
      "UPDATE users SET name = ?, phone = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [name, phone || null, userId]
    );
    
    return res.redirect("/owner/profile?msg=" + encodeURIComponent("Profile updated successfully."));
  } catch (err) {
    console.error("Profile update error:", err);
    return res.redirect("/owner/profile?error=" + encodeURIComponent("Failed to update profile."));
  }
};

// GET /owner/settings - Show settings page
exports.settings = async (req, res) => {
  try {
    const userId = getOwnerId(req);
    
    const user = await dbGet(
      "SELECT id, email, plan FROM users WHERE id = ?",
      [userId]
    );
    
    if (!user) {
      return res.status(404).send("User not found.");
    }

    res.renderPage("owner/settings/show", {
      title: "Settings",
      user,
      msg: req.query.msg || null,
      error: req.query.error || null
    });
  } catch (err) {
    console.error("Settings show error:", err);
    return res.status(500).send("Server error");
  }
};

// POST /owner/settings/password - Change password
exports.changePassword = async (req, res) => {
  try {
    const userId = getOwnerId(req);
    
    const currentPassword = String(req.body.current_password || "");
    const newPassword = String(req.body.new_password || "");
    const confirmPassword = String(req.body.confirm_password || "");
    
    // Validate
    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.redirect("/owner/settings?error=" + encodeURIComponent("All password fields are required."));
    }
    
    if (newPassword !== confirmPassword) {
      return res.redirect("/owner/settings?error=" + encodeURIComponent("New passwords do not match."));
    }
    
    if (newPassword.length < 6) {
      return res.redirect("/owner/settings?error=" + encodeURIComponent("Password must be at least 6 characters."));
    }
    
    // Verify current password
    const user = await dbGet("SELECT password_hash FROM users WHERE id = ?", [userId]);
    if (!user) {
      return res.redirect("/owner/settings?error=" + encodeURIComponent("User not found."));
    }
    
    const isValid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isValid) {
      return res.redirect("/owner/settings?error=" + encodeURIComponent("Current password is incorrect."));
    }
    
    // Update password
    const newHash = await bcrypt.hash(newPassword, 12);
    await dbRun(
      "UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [newHash, userId]
    );
    
    return res.redirect("/owner/settings?msg=" + encodeURIComponent("Password changed successfully."));
  } catch (err) {
    console.error("Password change error:", err);
    return res.redirect("/owner/settings?error=" + encodeURIComponent("Failed to change password."));
  }
};
