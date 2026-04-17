const { run, get, all, transaction } = require('../db/db');

async function createOrder(userId, items, recipient = {}) {
  const total = items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );
  const { recipient_name, recipient_phone, payment_method, sbp_bank } = recipient;

  const orderId = await transaction(async () => {
    const info = await run(
      `INSERT INTO orders (user_id, total, status, recipient_name, recipient_phone, payment_method, sbp_bank)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, total, 'new', recipient_name || null, recipient_phone || null, payment_method || null, sbp_bank || null]
    );
    const newOrderId = info.lastID;
    for (const i of items) {
      await run(
        'INSERT INTO order_items (order_id, game_id, quantity, price) VALUES (?, ?, ?, ?)',
        [newOrderId, i.gameId, i.quantity, i.price]
      );
    }
    return newOrderId;
  });

  return getOrderById(orderId);
}

async function getOrderById(id) {
  const order = await get('SELECT * FROM orders WHERE id = ?', [id]);
  if (!order) return null;

  const items = await all(
    `
      SELECT oi.*, g.title, g.image_url
      FROM order_items oi
      JOIN games g ON g.id = oi.game_id
      WHERE oi.order_id = ?
    `,
    [id]
  );

  return { ...order, items };
}

async function getOrdersByUser(userId) {
  return all(
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
}

module.exports = {
  createOrder,
  getOrderById,
  getOrdersByUser,
};

