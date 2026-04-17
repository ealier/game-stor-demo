const { get, all, run } = require('../db/db');

async function findByEmail(email) {
  return get('SELECT * FROM users WHERE email = ?', [email]);
}

async function findById(id) {
  return get('SELECT * FROM users WHERE id = ?', [id]);
}

async function createUser({ email, passwordHash, name, role = 'user' }) {
  const info = await run(
    'INSERT INTO users (email, password_hash, role, name) VALUES (?, ?, ?, ?)',
    [email, passwordHash, role, name]
  );
  return findById(info.lastID);
}

async function getUserWithOrders(userId) {
  const user = await findById(userId);
  if (!user) return null;

  const orders = await all(
    `
      SELECT o.*, COUNT(oi.id) as items_count
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE o.user_id = ?
      GROUP BY o.id
      ORDER BY o.created_at DESC
    `,
    [userId]
  );

  return { user, orders };
}

async function updateProfile(userId, { name }) {
  await run('UPDATE users SET name = ? WHERE id = ?', [name, userId]);
  return findById(userId);
}

module.exports = {
  findByEmail,
  findById,
  createUser,
  getUserWithOrders,
  updateProfile,
};

