import bcrypt from 'bcryptjs';

/**
 * Login user (owner)
 */
export async function loginUser(db, email, password) {
  const user = db.query('SELECT * FROM users WHERE email = ? AND status = ?')
    .get(email, 'active');

  if (!user) {
    throw new Error('Invalid email or password');
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    throw new Error('Invalid email or password');
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    plan: user.plan,
    role: 'owner',
  };
}

/**
 * Login manager
 */
export async function loginManager(db, email, password) {
  const manager = db.query('SELECT * FROM managers WHERE email = ? AND is_active = 1')
    .get(email);

  if (!manager) {
    throw new Error('Invalid email or password');
  }

  const valid = await bcrypt.compare(password, manager.password_hash);
  if (!valid) {
    throw new Error('Invalid email or password');
  }

  // Get assigned stores
  const stores = db.query(
    `SELECT s.* FROM stores s
     JOIN manager_stores ms ON ms.store_id = s.id
     WHERE ms.manager_id = ?`
  ).all(manager.id);

  return {
    id: manager.id,
    email: manager.email,
    name: manager.name,
    role: 'manager',
    stores: stores.map(s => ({ id: s.id, name: s.name })),
  };
}

/**
 * Verify employee PIN (stateless, no session)
 */
export async function verifyEmployeePin(db, storeId, email, pin) {
  const employee = db.query(
    'SELECT * FROM employees WHERE store_id = ? AND email = ? AND is_active = 1'
  ).get(storeId, email);

  if (!employee) {
    throw new Error('Employee not found');
  }

  const valid = await bcrypt.compare(pin, employee.pin_hash);
  if (!valid) {
    throw new Error('Invalid PIN');
  }

  return {
    id: employee.id,
    email: employee.email,
    name: employee.name,
    storeId: employee.store_id,
  };
}

/**
 * Logout (destroy session)
 */
export function logout(req, res, redirectTo = '/') {
  req.session.destroy((err) => {
    if (err) {
      console.error('[Session] Logout error:', err);
    }
    res.clearCookie('thlengta_session');
    res.redirect(redirectTo);
  });
}

/**
 * Update session user data (after profile edit, plan upgrade, etc.)
 */
export async function refreshSessionUser(db, req) {
  if (!req.session?.user) return;

  const userId = req.session.user.id;
  const role = req.session.user.role;

  if (role === 'owner') {
    const user = db.query('SELECT * FROM users WHERE id = ?').get(userId);
    if (user) {
      req.session.user = {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        plan: user.plan,
        role: 'owner',
      };
    }
  } else if (role === 'manager') {
    const manager = db.query('SELECT * FROM managers WHERE id = ?').get(userId);
    if (manager) {
      const stores = db.query(
        `SELECT s.* FROM stores s
         JOIN manager_stores ms ON ms.store_id = s.id
         WHERE ms.manager_id = ?`
      ).all(manager.id);

      req.session.user = {
        id: manager.id,
        email: manager.email,
        name: manager.name,
        role: 'manager',
        stores: stores.map(s => ({ id: s.id, name: s.name })),
      };
    }
  }
}
