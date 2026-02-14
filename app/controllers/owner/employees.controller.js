const bcrypt = require("bcryptjs");
const { dbGet, dbRun, dbAll } = require("../../db/helpers");

// Lists all employees for a given store (index action)
exports.index = async (req, res) => {
  const adminId = req.session.adminId;
  const storeId = Number(req.params.storeId);

  const store = await dbGet("SELECT id, name FROM stores WHERE id = ? AND admin_id = ?", [
    storeId,
    adminId
  ]);
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

  res.renderPage("owner/employees/index", { // Renamed view
    title: "Employees",
    store,
    employees,
    msg: req.query.msg || null
  });
};

// Displays the form for adding a new employee (new action)
exports.new = async (req, res) => {
  const adminId = req.session.adminId;
  const storeId = Number(req.params.storeId);

  const store = await dbGet("SELECT id, name FROM stores WHERE id = ? AND admin_id = ?", [
    storeId,
    adminId
  ]);
  if (!store) return res.status(404).send("Store not found.");

  res.renderPage("owner/employees/new", { // Renamed view
    title: "Add Employee",
    store,
    error: null
  });
};

// Handles the creation of a new employee (create action)
exports.create = async (req, res) => {
  try {
    const adminId = req.session.adminId;
    const storeId = Number(req.params.storeId);

    const store = await dbGet("SELECT id, name FROM stores WHERE id = ? AND admin_id = ?", [
      storeId,
      adminId
    ]);
    if (!store) return res.status(404).send("Store not found.");

    const email = String(req.body.email || "").trim().toLowerCase();
    const pin = String(req.body.pin || "").trim();

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return res.renderPage("owner/employees/new", {
        title: "Add Employee",
        store,
        error: "Enter a valid email."
      });
    }

    if (!/^\d{4,8}$/.test(pin)) {
      return res.renderPage("owner/employees/new", {
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
      return res.renderPage("owner/employees/new", {
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
      `/owner/stores/${storeId}/employees?msg=` +
        encodeURIComponent("Employee added. They can login with email + PIN.")
    );
  } catch (err) {
    console.error(err);
    return res.status(500).send("Server error");
  }
};

// Toggles employee active status (custom update action)
exports.updateStatus = async (req, res) => {
  try {
    const adminId = req.session.adminId;
    const storeId = Number(req.params.storeId);
    const employeeId = Number(req.params.employeeId);

    const store = await dbGet("SELECT id FROM stores WHERE id = ? AND admin_id = ?", [
      storeId,
      adminId
    ]);
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

    return res.redirect(`/owner/stores/${storeId}/employees`);
  } catch (err) {
    console.error(err);
    return res.status(500).send("Server error");
  }
};

// Resets employee device (custom update action)
exports.resetDevice = async (req, res) => {
  const adminId = req.session.adminId;
  const storeId = Number(req.params.storeId);
  const employeeId = Number(req.params.employeeId);

  const store = await dbGet("SELECT id FROM stores WHERE id = ? AND admin_id = ?", [
    storeId,
    adminId
  ]);
  if (!store) return res.status(404).send("Store not found.");

  const emp = await dbGet("SELECT id FROM employees WHERE id = ? AND store_id = ?", [
    employeeId,
    storeId
  ]);
  if (!emp) return res.status(404).send("Employee not found.");

  await dbRun("DELETE FROM employee_devices WHERE employee_id = ?", [employeeId]);

  return res.redirect(
    `/owner/stores/${storeId}/employees?msg=` +
      encodeURIComponent("Device reset. Employee can login again with email + PIN.")
  );
};

// Deletes an employee (destroy action)
exports.destroy = async (req, res) => {
  try {
    const adminId = req.session.adminId;
    const storeId = Number(req.params.storeId);
    const employeeId = Number(req.params.employeeId);

    const store = await dbGet("SELECT id FROM stores WHERE id = ? AND admin_id = ?", [
      storeId,
      adminId
    ]);
    if (!store) return res.status(404).send("Store not found.");

    const emp = await dbGet("SELECT id, email FROM employees WHERE id = ? AND store_id = ?", [
      employeeId,
      storeId
    ]);
    if (!emp) return res.status(404).send("Employee not found.");

    await dbRun("DELETE FROM employee_devices WHERE employee_id = ?", [employeeId]);
    await dbRun("DELETE FROM attendance_logs WHERE employee_id = ? AND store_id = ?", [
      employeeId,
      storeId
    ]);
    await dbRun("DELETE FROM employees WHERE id = ? AND store_id = ?", [employeeId, storeId]);

    return res.redirect(
      `/owner/stores/${storeId}/employees?msg=` + encodeURIComponent(`Deleted employee ${emp.email}.`)
    );
  } catch (err) {
    console.error(err);
    return res.status(500).send("Server error");
  }
};
