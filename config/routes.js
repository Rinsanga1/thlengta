const express = require("express");

// require Controllers

const auth = require("../app/controllers/auth.controller");
const adminSessions = require("../app/controllers/admin/sessions.controller");
const adminDashboard = require("../app/controllers/admin/dashboard.controller");
const { requireAdmin } = require("../app/middleware/auth"); // Import requireAdmin
const adminStores = require("../app/controllers/admin/stores.controller"); // Import adminStores
const adminEmployees = require("../app/controllers/admin/employees.controller"); // Import adminEmployees
const adminManagers = require("../app/controllers/admin/managers.controller"); // Import adminManagers
const adminLogs = require("../app/controllers/admin/logs.controller"); // Import adminLogs
const adminUpgrades = require("../app/controllers/admin/upgrades.controller"); // Import adminUpgrades
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
const superadminSessions = require("../app/controllers/superadmin/sessions.controller"); // Import superadminSessions
const superadminDashboard = require("../app/controllers/superadmin/dashboard.controller"); // Import superadminDashboard
const superadminAdmins = require("../app/controllers/superadmin/admins.controller"); // Import superadminAdmins
const superadminUpgradeRequests = require("../app/controllers/superadmin/upgradeRequests.controller"); // Import superadminUpgradeRequests
const upload = require("../app/middleware/upload"); // Import upload middleware
const home = require("../app/controllers/home.controller");

const router = express.Router();

// Home
router.get("/", home.index);
router.get("/login", auth.redirect);
router.get("/register", auth.new); // New: Display registration form
router.post("/register", auth.create); // New: Handle registration submission
router.get("/register/submitted", auth.submitted); // Renamed: Registration submitted page

// Sessions

router.get("/admin/login", adminSessions.new);
router.post("/admin/login", adminSessions.create);
router.get("/admin/logout", adminSessions.destroy);

// Dashboard

router.get("/admin/dashboard", requireAdmin, adminDashboard.index);
router.get("/admin", adminDashboard.gateway);

// Stores (Workplace)

router.get("/admin/stores/new", requireAdmin, adminStores.new);
router.get("/admin/stores/new/step-1", requireAdmin, adminStores.new_step1_get);
router.post("/admin/stores/new/step-1", requireAdmin, upload.single("logo"), adminStores.new_step1_post);
router.get("/admin/stores/new/step-2", requireAdmin, adminStores.new_step2_get);
router.post("/admin/stores/new/step-2", requireAdmin, adminStores.new_step2_post);
router.get("/admin/stores/new/step-3", requireAdmin, adminStores.new_step3_get);
router.post("/admin/stores/new/step-3", requireAdmin, adminStores.new_step3_post);
router.get("/admin/stores/new/step-4", requireAdmin, adminStores.new_step4_get);
router.post("/admin/stores/new/finish", requireAdmin, adminStores.create);
router.get("/admin/stores/:storeId", requireAdmin, adminStores.show); // Show QR
router.get("/admin/stores/:storeId/qr.png", requireAdmin, adminStores.qrPng);
router.get("/admin/stores/:storeId/edit", requireAdmin, adminStores.edit); // Settings
router.post("/admin/stores/:storeId/settings", requireAdmin, adminStores.update);
router.post("/admin/stores/:storeId/logo", requireAdmin, upload.single("logo"), adminStores.updateLogo);
router.post("/admin/stores/:storeId/delete", requireAdmin, adminStores.destroy);
router.post("/admin/stores/:storeId/qr/rotate", requireAdmin, adminStores.rotateQr);

// Test QR Download routes

router.get("/admin/test_qr_download", requireAdmin, adminStores.testQrDownload);
router.get("/admin/test_qr_download/raw/:storeId.png", requireAdmin, adminStores.testQrDownloadRawPng);
router.get("/admin/test_qr_download/framed/:storeId.png", requireAdmin, adminStores.testQrDownloadFramedPng);
router.get("/admin/test_qr_download/debug_frame", requireAdmin, adminStores.debugFrame);

// Admin Employees

router.get("/admin/stores/:storeId/employees", requireAdmin, adminEmployees.index);
router.get("/admin/stores/:storeId/employees/new", requireAdmin, adminEmployees.new);
router.post("/admin/stores/:storeId/employees", requireAdmin, adminEmployees.create); // POST to root collection
router.post("/admin/stores/:storeId/employees/:employeeId/toggle", requireAdmin, adminEmployees.updateStatus);
router.post("/admin/stores/:storeId/employees/:employeeId/device/reset", requireAdmin, adminEmployees.resetDevice);
router.post("/admin/stores/:storeId/employees/:employeeId/delete", requireAdmin, adminEmployees.destroy);

// Managers

router.get("/admin/stores/:storeId/managers", requireAdmin, adminManagers.index);
router.get("/admin/stores/:storeId/managers/new", requireAdmin, adminManagers.new);
router.post("/admin/stores/:storeId/managers", requireAdmin, adminManagers.create); // POST to root collection
router.post("/admin/stores/:storeId/managers/:managerId/toggle", requireAdmin, adminManagers.updateStatus);
router.post("/admin/stores/:storeId/managers/:managerId/remove", requireAdmin, adminManagers.destroy);

// Logs

router.get("/admin/stores/:storeId/logs", requireAdmin, adminLogs.index);
router.get("/admin/stores/:storeId/logs.csv", requireAdmin, adminLogs.downloadDayCsv);
router.get("/admin/stores/:storeId/logs_month.csv", requireAdmin, adminLogs.downloadMonthCsv);

// Upgrades

router.get("/admin/upgrade", requireAdmin, adminUpgrades.new);
router.post("/admin/upgrade", requireAdmin, adminUpgrades.create);

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

router.get("/superadmin/login", superadminSessions.new);
router.post("/superadmin/login", superadminSessions.create);
router.post("/superadmin/logout", requireSuperAdmin, superadminSessions.destroy);

// Superadmin Dashboard

router.get("/superadmin", superadminDashboard.gateway);
router.get("/superadmin/dashboard", requireSuperAdmin, superadminDashboard.index);

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
