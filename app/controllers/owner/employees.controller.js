const bcrypt = require("bcryptjs");
const { dbGet, dbRun, dbAll } = require("../../../db/helpers");
const { getOwnerId } = require("../../middleware/auth");

// Lists all employees for a given workplace (index action)
exports.index = async (req, res) => {
  const userId = getOwnerId(req);
  const workplaceId = Number(req.params.workplaceId);

  const workplace = await dbGet("SELECT id, name FROM workplaces WHERE id = ? AND user_id = ?", [
    workplaceId,
    userId
  ]);
  if (!workplace) return res.status(404).send("Workplace not found.");

  const employees = await dbAll(
    `
    SELECT
      e.id,
      e.email,
      e.is_active,
      e.created_at,
      CASE
        WHEN EXISTS (SELECT 1 FROM employee_device_fps f WHERE f.employee_id = e.id)
        THEN 1 ELSE 0
      END AS device_registered
    FROM employees e
    WHERE e.workplace_id = ?
    ORDER BY e.id DESC
    `,
    [workplaceId]
  );

  res.renderPage("owner/employees/index", {
    title: "Employees",
    workplace,
    employees,
    msg: req.query.msg || null
  });
};

// Displays the form for adding a new employee (new action)
exports.new = async (req, res) => {
  const userId = getOwnerId(req);
  const workplaceId = Number(req.params.workplaceId);

  const workplace = await dbGet("SELECT id, name FROM workplaces WHERE id = ? AND user_id = ?", [
    workplaceId,
    userId
  ]);
  if (!workplace) return res.status(404).send("Workplace not found.");

  res.renderPage("owner/employees/new", {
    title: "Add Employee",
    workplace,
    error: null
  });
};

// Handles the creation of a new employee (create action)
exports.create = async (req, res) => {
  try {
    const userId = getOwnerId(req);
    const workplaceId = Number(req.params.workplaceId);

    const workplace = await dbGet("SELECT id, name FROM workplaces WHERE id = ? AND user_id = ?", [
      workplaceId,
      userId
    ]);
    if (!workplace) return res.status(404).send("Workplace not found.");

    const email = String(req.body.email || "").trim().toLowerCase();

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return res.renderPage("owner/employees/new", {
        title: "Add Employee",
        workplace,
        error: "Enter a valid email."
      });
    }

    const existing = await dbGet("SELECT id FROM employees WHERE workplace_id = ? AND email = ?", [
      workplaceId,
      email
    ]);
    if (existing) {
      return res.renderPage("owner/employees/new", {
        title: "Add Employee",
        workplace,
        error: "Employee already exists for this workplace."
      });
    }

    const pin_hash = await bcrypt.hash("0000", 12);

    await dbRun("INSERT INTO employees (workplace_id, email, pin_hash, is_active) VALUES (?, ?, ?, 1)", [
      workplaceId,
      email,
      pin_hash
    ]);

    return res.redirect(
      `/owner/workplaces/${workplaceId}?tab=employees&msg=` +
        encodeURIComponent("Employee added. They can check in using their account.")
    );
  } catch (err) {
    console.error(err);
    return res.status(500).send("Server error");
  }
};

// Toggles employee active status (custom update action)
exports.updateStatus = async (req, res) => {
  try {
    const userId = getOwnerId(req);
    const workplaceId = Number(req.params.workplaceId);
    const employeeId = Number(req.params.employeeId);

    const workplace = await dbGet("SELECT id FROM workplaces WHERE id = ? AND user_id = ?", [
      workplaceId,
      userId
    ]);
    if (!workplace) return res.status(404).send("Workplace not found.");

    const emp = await dbGet("SELECT id, is_active FROM employees WHERE id = ? AND workplace_id = ?", [
      employeeId,
      workplaceId
    ]);
    if (!emp) return res.status(404).send("Employee not found.");

    const newVal = emp.is_active ? 0 : 1;

    await dbRun("UPDATE employees SET is_active = ? WHERE id = ? AND workplace_id = ?", [
      newVal,
      employeeId,
      workplaceId
    ]);

    return res.redirect(`/owner/workplaces/${workplaceId}/employees`);
  } catch (err) {
    console.error(err);
    return res.status(500).send("Server error");
  }
};

// Resets employee device (custom update action)
exports.resetDevice = async (req, res) => {
  const userId = getOwnerId(req);
  const workplaceId = Number(req.params.workplaceId);
  const employeeId = Number(req.params.employeeId);

  const workplace = await dbGet("SELECT id FROM workplaces WHERE id = ? AND user_id = ?", [
    workplaceId,
    userId
  ]);
  if (!workplace) return res.status(404).send("Workplace not found.");

  const emp = await dbGet("SELECT id FROM employees WHERE id = ? AND workplace_id = ?", [
    employeeId,
    workplaceId
  ]);
  if (!emp) return res.status(404).send("Employee not found.");

  await dbRun("DELETE FROM employee_devices WHERE employee_id = ?", [employeeId]);
  await dbRun("DELETE FROM employee_device_fps WHERE employee_id = ?", [employeeId]);

  return res.redirect(
    `/owner/workplaces/${workplaceId}/employees?msg=` +
      encodeURIComponent("Device reset. Employee can check in with a new device.")
  );
};

// Deletes an employee (destroy action)
exports.destroy = async (req, res) => {
  try {
    const userId = getOwnerId(req);
    const workplaceId = Number(req.params.workplaceId);
    const employeeId = Number(req.params.employeeId);

    const workplace = await dbGet("SELECT id FROM workplaces WHERE id = ? AND user_id = ?", [
      workplaceId,
      userId
    ]);
    if (!workplace) return res.status(404).send("Workplace not found.");

    const emp = await dbGet("SELECT id, email FROM employees WHERE id = ? AND workplace_id = ?", [
      employeeId,
      workplaceId
    ]);
    if (!emp) return res.status(404).send("Employee not found.");

    await dbRun("DELETE FROM employee_devices WHERE employee_id = ?", [employeeId]);
    await dbRun("DELETE FROM attendance_logs WHERE employee_id = ? AND workplace_id = ?", [
      employeeId,
      workplaceId
    ]);
    await dbRun("DELETE FROM employees WHERE id = ? AND workplace_id = ?", [employeeId, workplaceId]);

    return res.redirect(
      `/owner/workplaces/${workplaceId}/employees?msg=` + encodeURIComponent(`Deleted employee ${emp.email}.`)
    );
  } catch (err) {
    console.error(err);
    return res.status(500).send("Server error");
  }
};
