const express = require("express");


// require Controllers
const auth = require("../app/controllers/auth.controller");
const users = require("../app/controllers/users.controller");
const ownerSessions = require("../app/controllers/owner/sessions.controller");
const ownerDashboard = require("../app/controllers/owner/dashboard.controller");
const { requireOwner } = require("../app/middleware/auth"); // Import requireOwner
const ownerStores = require("../app/controllers/owner/stores.controller"); // Import ownerStores
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

// Stores (Workplace)
//router.get("/owner/stores/new", requireOwner, ownerStores.new);
router.get("/owner/stores/new", requireOwner, ownerStores.new);
router.get("/owner/stores/new/step-1", requireOwner, ownerStores.new_step1_get);
router.post("/owner/stores/new/step-1", requireOwner, upload.single("logo"), ownerStores.new_step1_post);
router.get("/owner/stores/new/step-2", requireOwner, ownerStores.new_step2_get);
router.post("/owner/stores/new/step-2", requireOwner, ownerStores.new_step2_post);
router.get("/owner/stores/new/step-3", requireOwner, ownerStores.new_step3_get);
router.post("/owner/stores/new/step-3", requireOwner, ownerStores.new_step3_post);
router.get("/owner/stores/new/step-4", requireOwner, ownerStores.new_step4_get);
router.post("/owner/stores/new/finish", requireOwner, ownerStores.create);
router.get("/owner/stores/:storeId", requireOwner, ownerStores.show); // Show QR
router.get("/owner/stores/:storeId/qr.png", requireOwner, ownerStores.qrPng);
router.get("/owner/stores/:storeId/edit", requireOwner, ownerStores.edit); // Settings
router.post("/owner/stores/:storeId/settings", requireOwner, ownerStores.update);
router.post("/owner/stores/:storeId/logo", requireOwner, upload.single("logo"), ownerStores.updateLogo);
router.post("/owner/stores/:storeId/delete", requireOwner, ownerStores.destroy);
router.post("/owner/stores/:storeId/qr/rotate", requireOwner, ownerStores.rotateQr);

// Test QR Download routes
router.get("/owner/test_qr_download", requireOwner, ownerStores.testQrDownload);
router.get("/owner/test_qr_download/raw/:storeId.png", requireOwner, ownerStores.testQrDownloadRawPng);
router.get("/owner/test_qr_download/framed/:storeId.png", requireOwner, ownerStores.testQrDownloadFramedPng);
router.get("/owner/test_qr_download/debug_frame", requireOwner, ownerStores.debugFrame);

// Admin Employees
router.get("/owner/stores/:storeId/employees", requireOwner, ownerEmployees.index);
router.get("/owner/stores/:storeId/employees/new", requireOwner, ownerEmployees.new);
router.post("/owner/stores/:storeId/employees", requireOwner, ownerEmployees.create); // POST to root collection
router.post("/owner/stores/:storeId/employees/:employeeId/toggle", requireOwner, ownerEmployees.updateStatus);
router.post("/owner/stores/:storeId/employees/:employeeId/device/reset", requireOwner, ownerEmployees.resetDevice);
router.post("/owner/stores/:storeId/employees/:employeeId/delete", requireOwner, ownerEmployees.destroy);

// Managers
router.get("/owner/stores/:storeId/managers", requireOwner, ownerManagers.index);
router.get("/owner/stores/:storeId/managers/new", requireOwner, ownerManagers.new);
router.post("/owner/stores/:storeId/managers", requireOwner, ownerManagers.create); // POST to root collection
router.post("/owner/stores/:storeId/managers/:managerId/toggle", requireOwner, ownerManagers.updateStatus);
router.post("/owner/stores/:storeId/managers/:managerId/remove", requireOwner, ownerManagers.destroy);

// Logs

router.get("/owner/stores/:storeId/logs", requireOwner, ownerLogs.index);
router.get("/owner/stores/:storeId/logs.csv", requireOwner, ownerLogs.downloadDayCsv);
router.get("/owner/stores/:storeId/logs_month.csv", requireOwner, ownerLogs.downloadMonthCsv);

// Upgrades

router.get("/owner/upgrade", requireOwner, ownerUpgrades.new);
router.post("/owner/upgrade", requireOwner, ownerUpgrades.create);

// Employee Scans

router.get("/e/scan/:storePublicId", employeeScans.index);

// Employee Device Approvals

router.post("/e/scan/:storePublicId/device/approve", employeeDeviceApprovals.create);

// Employee Choices (Break / Resume / Checkout)

router.post("/e/scan/:storePublicId/choice", employeeChoices.create);
router.post("/e/scan/:storePublicId/action", employeeChoices.create);

// Manager Dashboard

router.get("/manager/dashboard", requireManager, managerDashboard.index);

// Manager Store QR

router.get("/manager/store/:storeId/qr", requireManager, managerQrs.show);
router.get("/manager/store/:storeId/qr.png", requireManager, managerQrs.png);

// Manager Logs

router.get("/manager/store/:storeId/logs", requireManager, managerLogs.index);
router.get("/manager/store/:storeId/logs.csv", requireManager, managerLogs.downloadDayCsv);

// Manager Employees

router.get("/manager/store/:storeId/employees", requireManager, managerEmployees.index);
router.get("/manager/store/:storeId/employees/new", requireManager, managerEmployees.new);
router.post("/manager/store/:storeId/employees", requireManager, managerEmployees.create);
router.post("/manager/store/:storeId/employees/:employeeId/toggle", requireManager, managerEmployees.updateStatus);

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
