const express = require("express");


// require Controllers
const auth = require("../app/controllers/auth.controller");
const users = require("../app/controllers/users.controller");
const ownerSessions = require("../app/controllers/owner/sessions.controller");
const ownerDashboard = require("../app/controllers/owner/dashboard.controller");
const { requireOwner } = require("../app/middleware/auth"); // Import requireOwner
const ownerWorkplaces = require("../app/controllers/owner/workplaces.controller"); // Import ownerWorkplaces
const ownerEmployees = require("../app/controllers/owner/employees.controller"); // Import ownerEmployees
const ownerManagers = require("../app/controllers/owner/managers.controller"); // Import ownerManagers
const ownerLogs = require("../app/controllers/owner/logs.controller"); // Import ownerLogs
const ownerUpgrades = require("../app/controllers/owner/upgrades.controller"); // Import ownerUpgrades
const employeeScans = require("../app/controllers/employee/scans.controller"); // Import employeeScans
const employeeDeviceApprovals = require("../app/controllers/employee/deviceApprovals.controller"); // Import employeeDeviceApprovals
const employeeChoices = require("../app/controllers/employee/choices.controller"); // Import employeeChoices
const managerDashboard = require("../app/controllers/manager/dashboard.controller"); // Import managerDashboard
const managerQrs = require("../app/controllers/manager/qrs.controller"); // Import managerQrs
const managerLogs = require("../app/controllers/manager/logs.controller"); // Import managerLogs
const managerEmployees = require("../app/controllers/manager/employees.controller"); // Import managerEmployees
const managerSessions = require("../app/controllers/manager/sessions.controller"); // Import managerSessions
const { requireManager } = require("../app/middleware/auth"); // Import requireManager
const { requireSuperAdmin } = require("../app/middleware/superadminAuth"); // Import requireSuperAdmin
const superownerSessions = require("../app/controllers/superadmin/sessions.controller"); // Import superownerSessions
const superownerDashboard = require("../app/controllers/superadmin/dashboard.controller"); // Import superownerDashboard
const superadminAdmins = require("../app/controllers/superadmin/admins.controller"); // Import superadminAdmins
const superadminUpgradeRequests = require("../app/controllers/superadmin/upgradeRequests.controller"); // Import superadminUpgradeRequests
const upload = require("../app/middleware/upload"); // Import upload middleware
const home = require("../app/controllers/home.controller");
const contact = require("../app/controllers/contact.controller");
const checkin = require("../app/controllers/checkin.controller"); // Import checkin

const router = express.Router();

// Home
router.get("/", home.index);
router.post("/contact", contact.create);

// Plan-specific registration routes (must be before generic /register)
router.get("/register/free", auth.registerFree);
router.post("/register/free", auth.registerFreeSubmit);

router.get("/register/:plan", (req, res, next) => {
  req.query.plan = req.params.plan;
  auth.new(req, res, next);
});

// Generic registration route
router.get("/register", auth.new);
router.post("/register", auth.create);
router.get("/register/submitted", auth.submitted);

// Checkout route - for Plus, Pro, Enterprise plans
router.get("/checkout/:plan", auth.checkout);
router.post("/checkout/:plan", auth.checkoutSubmit);

// User Sessions (Sign In)
router.get("/users/signin", users.new);
router.post("/users/signin", users.create);
router.get("/users/signout", users.confirm);
router.post("/users/signout", users.destroy);

// Sessions
router.get("/owner/login", ownerSessions.new);
router.post("/owner/login", ownerSessions.create);
router.get("/owner/logout", ownerSessions.destroy);

// Dashboard
router.get("/owner/dashboard", requireOwner, ownerDashboard.index);
router.get("/owner", ownerDashboard.gateway);

// Workplaces
router.get("/owner/workplaces/new", requireOwner, ownerWorkplaces.new);
router.post("/owner/workplaces", requireOwner, upload.single("logo"), ownerWorkplaces.create);
// Unified workplace dashboard (with tabs)
router.get("/owner/workplaces/:workplaceId", requireOwner, ownerWorkplaces.dashboard);
router.get("/owner/workplaces/:workplaceId/edit", requireOwner, ownerWorkplaces.editRedirect); // Legacy redirect
router.get("/owner/workplaces/:workplaceId/qr", requireOwner, ownerWorkplaces.editRedirect); // Legacy redirect
router.get("/owner/workplaces/:workplaceId/qr.png", requireOwner, ownerWorkplaces.qrPng);
router.post("/owner/workplaces/:workplaceId/settings", requireOwner, upload.single("logo"), ownerWorkplaces.update);
router.post("/owner/workplaces/:workplaceId/logo", requireOwner, upload.single("logo"), ownerWorkplaces.updateLogo);
router.post("/owner/workplaces/:workplaceId/delete", requireOwner, ownerWorkplaces.destroy);
router.post("/owner/workplaces/:workplaceId/qr/rotate", requireOwner, ownerWorkplaces.rotateQr);

// Test QR Download routes
router.get("/owner/test_qr_download", requireOwner, ownerWorkplaces.testQrDownload);
router.get("/owner/test_qr_download/raw/:workplaceId.png", requireOwner, ownerWorkplaces.testQrDownloadRawPng);
router.get("/owner/test_qr_download/framed/:workplaceId.png", requireOwner, ownerWorkplaces.testQrDownloadFramedPng);
router.get("/owner/test_qr_download/debug_frame", requireOwner, ownerWorkplaces.debugFrame);

// Admin Employees
router.get("/owner/workplaces/:workplaceId/employees/new", requireOwner, ownerEmployees.new);
router.post("/owner/workplaces/:workplaceId/employees", requireOwner, ownerEmployees.create);
router.post("/owner/workplaces/:workplaceId/employees/:employeeId/update", requireOwner, ownerEmployees.update);
router.post("/owner/workplaces/:workplaceId/employees/:employeeId/toggle", requireOwner, ownerEmployees.updateStatus);
router.post("/owner/workplaces/:workplaceId/employees/:employeeId/device/reset", requireOwner, ownerEmployees.resetDevice);
router.post("/owner/workplaces/:workplaceId/employees/:employeeId/delete", requireOwner, ownerEmployees.destroy);

// Managers
router.get("/owner/workplaces/:workplaceId/managers", requireOwner, ownerManagers.index);
router.get("/owner/workplaces/:workplaceId/managers/new", requireOwner, ownerManagers.new);
router.post("/owner/workplaces/:workplaceId/managers", requireOwner, ownerManagers.create);
router.post("/owner/workplaces/:workplaceId/managers/:managerId/toggle", requireOwner, ownerManagers.updateStatus);
router.post("/owner/workplaces/:workplaceId/managers/:managerId/remove", requireOwner, ownerManagers.destroy);

// Logs
router.get("/owner/workplaces/:workplaceId/logs", requireOwner, ownerLogs.index);
router.get("/owner/workplaces/:workplaceId/logs.csv", requireOwner, ownerLogs.downloadDayCsv);
router.get("/owner/workplaces/:workplaceId/logs_month.csv", requireOwner, ownerLogs.downloadMonthCsv);
router.get("/owner/workplaces/:workplaceId/logs_year.csv", requireOwner, ownerLogs.downloadYearCsv);

// Upgrades
router.get("/owner/upgrade", requireOwner, ownerUpgrades.new);
router.post("/owner/upgrade", requireOwner, ownerUpgrades.create);

// Employee Scans
router.get("/e/scan/:workplacePublicId", employeeScans.index);

// Check-in routes for logged-in users
router.get("/checkin", checkin.requireCheckinUser, checkin.index);
router.post("/checkin/validate", checkin.requireCheckinUser, checkin.validate);
router.post("/checkin", checkin.requireCheckinUser, checkin.create);

// Employee Device Approvals
router.post("/e/scan/:workplacePublicId/device/approve", employeeDeviceApprovals.create);

// Employee Choices (Break / Resume / Checkout)
router.post("/e/scan/:workplacePublicId/choice", employeeChoices.create);
router.post("/e/scan/:workplacePublicId/action", employeeChoices.create);

// Manager Dashboard
router.get("/manager/dashboard", requireManager, managerDashboard.index);

// Manager Workplace QR
router.get("/manager/workplace/:workplaceId/qr", requireManager, managerQrs.show);
router.get("/manager/workplace/:workplaceId/qr.png", requireManager, managerQrs.png);

// Manager Logs
router.get("/manager/workplace/:workplaceId/logs", requireManager, managerLogs.index);
router.get("/manager/workplace/:workplaceId/logs.csv", requireManager, managerLogs.downloadDayCsv);

// Manager Employees
router.get("/manager/workplace/:workplaceId/employees", requireManager, managerEmployees.index);
router.get("/manager/workplace/:workplaceId/employees/new", requireManager, managerEmployees.new);
router.post("/manager/workplace/:workplaceId/employees", requireManager, managerEmployees.create);
router.post("/manager/workplace/:workplaceId/employees/:employeeId/toggle", requireManager, managerEmployees.updateStatus);

// Manager Logout
router.get("/manager/logout", managerSessions.destroy);

// Superadmin Sessions
router.get("/superadmin/login", superownerSessions.new);
router.post("/superadmin/login", superownerSessions.create);
router.post("/superadmin/logout", requireSuperAdmin, superownerSessions.destroy);

// Superadmin Dashboard
router.get("/superadmin", superownerDashboard.gateway);
router.get("/superadmin/dashboard", requireSuperAdmin, superownerDashboard.index);

// Superadmin Admin Management
router.get("/superadmin/admins/:adminId/edit", requireSuperAdmin, superadminAdmins.edit);
router.post("/superadmin/admins/:adminId/edit", requireSuperAdmin, superadminAdmins.update);
router.post("/superadmin/admins/:adminId/approve", requireSuperAdmin, superadminAdmins.approve);
router.post("/superadmin/admins/:adminId/reject", requireSuperAdmin, superadminAdmins.reject);
router.post("/superadmin/admins/:adminId/disable", requireSuperAdmin, superadminAdmins.disable);
router.post("/superadmin/admins/:adminId/renew", requireSuperAdmin, superadminAdmins.renew);
router.post("/superadmin/admins/:adminId/delete", requireSuperAdmin, superadminAdmins.destroy);

// Superadmin Upgrade Requests
router.get("/superadmin/upgrade-requests", requireSuperAdmin, superadminUpgradeRequests.index);
router.post("/superadmin/upgrade-requests/:id/approve", requireSuperAdmin, superadminUpgradeRequests.approve);
router.post("/superadmin/upgrade-requests/:id/reject", requireSuperAdmin, superadminUpgradeRequests.reject);

module.exports = router;
