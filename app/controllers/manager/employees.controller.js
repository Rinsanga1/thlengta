const bcrypt = require("bcryptjs");
const { dbGet, dbAll, dbRun } = require("../../db/helpers");
const { getManagerStoreOrNull } = require("../../utils/manager.utils");

// Lists employees for a store (manager view)
exports.index = async (req, res) => {
  try {
    const managerId = req.session.managerId;
    const adminId = req.session.managerAdminId;
    const storeId = Number(req.params.storeId);

    const store = await getManagerStoreOrNull(managerId, adminId, storeId);
    if (!store) return res.status(404).send("Store not found.");

    const employees = await dbAll(
      `
      SELECT
        e.id,
        e.email,
        e.is_active,
        e.created_at,
        CASE
          WHEN EXISTS (SELECT 1 FROM employee_devices d WHERE d.employee_id = e.id)
          THEN 1 ELSE 0
        END AS device_registered
      FROM employees e
      WHERE e.store_id = ?
      ORDER BY e.id DESC
      `,
      [storeId]
    );

    return res.renderPage("manager/employees/index", { // Renamed view
      title: "Employees",
      store,
      employees,
      msg: req.query.msg || null
    });
  } catch (err) {
    console.error("Manager employees list error:", err);
    return res.status(500).send("Server error");
  }
};

// Displays form for new employee (manager view)
exports.new = async (req, res) => {
  try {
    const managerId = req.session.managerId;
    const adminId = req.session.managerAdminId;
    const storeId = Number(req.params.storeId);

    const store = await getManagerStoreOrNull(managerId, adminId, storeId);
    if (!store) return res.status(404).send("Store not found.");

    return res.renderPage("manager/employees/new", { // Renamed view
      title: "Add Employee",
      store,
      error: null
    });
  } catch (err) {
    console.error("Manager employee new page error:", err);
    return res.status(500).send("Server error");
  }
};

// Creates new employee (manager view)
exports.create = async (req, res) => {
  try {
    const managerId = req.session.managerId;
    const adminId = req.session.managerAdminId;
    const storeId = Number(req.params.storeId);

    const store = await getManagerStoreOrNull(managerId, adminId, storeId);
    if (!store) return res.status(404).send("Store not found.");

    const email = String(req.body.email || "").trim().toLowerCase();
    const pin = String(req.body.pin || "").trim();

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return res.renderPage("manager/employees/new", { // Renamed view
        title: "Add Employee",
        store,
        error: "Enter a valid email."
      });
    }

    if (!/^\d{4,8}$/.test(pin)) {
      return res.renderPage("manager/employees/new", { // Renamed view
        title: "Add Employee",
        store,
        error: "PIN must be 4 to 8 digits."
      });
    }

    const existing = await dbGet("SELECT id FROM employees WHERE store_id = ? AND email = ?", [
      storeId,
      email
    ]);
    if (existing) {
      return res.renderPage("manager/employees/new", { // Renamed view
        title: "Add Employee",
        store,
        error: "Employee already exists for this store."
      });
    }

    const pin_hash = await bcrypt.hash(pin, 12);

    await dbRun("INSERT INTO employees (store_id, email, pin_hash, is_active) VALUES (?, ?, ?, 1)", [
      storeId,
      email,
      pin_hash
    ]);

    return res.redirect(
      `/manager/stores/${storeId}/employees?msg=` +
        encodeURIComponent("Employee added. They can login with email + PIN.")
    );
  } catch (err) {
    console.error("Manager create employee error:", err);
    return res.status(500).send("Server error");
  }
};

// Toggles employee active status (manager view)
exports.updateStatus = async (req, res) => {
  try {
    const managerId = req.session.managerId;
    const adminId = req.session.managerAdminId;
    const storeId = Number(req.params.storeId);
    const employeeId = Number(req.params.employeeId);

    const store = await getManagerStoreOrNull(managerId, adminId, storeId);
    if (!store) return res.status(404).send("Store not found.");

    const emp = await dbGet("SELECT id, is_active FROM employees WHERE id = ? AND store_id = ?", [
      employeeId,
      storeId
    ]);
    if (!emp) return res.status(404).send("Employee not found.");

    const newVal = emp.is_active ? 0 : 1;

    await dbRun("UPDATE employees SET is_active = ? WHERE id = ? AND store_id = ?", [
      newVal,
      employeeId,
      storeId
    ]);

    return res.redirect(`/manager/stores/${storeId}/employees`);
  } catch (err) {
    console.error("Manager toggle employee error:", err);
    return res.status(500).send("Server error");
  }
};

// Resets employee device lock (manager view)
exports.resetDevice = async (req, res) => {
  try {
    const managerId = req.session.managerId;
    const adminId = req.session.managerAdminId;
    const storeId = Number(req.params.storeId);
    const employeeId = Number(req.params.employeeId);

    const store = await getManagerStoreOrNull(managerId, adminId, storeId);
    if (!store) return res.status(404).send("Store not found.");

    const emp = await dbGet("SELECT id FROM employees WHERE id = ? AND store_id = ?", [
      employeeId,
      storeId
    ]);
    if (!emp) return res.status(404).send("Employee not found.");

    await dbRun("DELETE FROM employee_devices WHERE employee_id = ?", [employeeId]);

    return res.redirect(
      `/manager/stores/${storeId}/employees?msg=` +
        encodeURIComponent("Device reset. Employee can login again with email + PIN.")
    );
  } catch (err) {
    console.error("Manager reset device error:", err);
    return res.status(500).send("Server error");
  }
};
