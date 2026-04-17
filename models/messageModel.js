const { run, get, all, transaction } = require('../db/db');

let tableReadyPromise = null;

function ensureMessagesTable() {
  if (!tableReadyPromise) {
    tableReadyPromise = Promise.all([
      run(
        `CREATE TABLE IF NOT EXISTS chat_threads (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          order_id INTEGER NOT NULL,
          game_id INTEGER NOT NULL,
          game_title TEXT NOT NULL,
          specialist_requested INTEGER NOT NULL DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
          FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE RESTRICT
        )`
      ),
      run(
        `CREATE TABLE IF NOT EXISTS chat_messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          thread_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          sender_type TEXT NOT NULL,
          message_text TEXT NOT NULL,
          gift_code TEXT,
          quick_key TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`
      ),
    ]);
  }
  return tableReadyPromise;
}

async function createThreadForOrderItem(userId, orderId, gameId, gameTitle) {
  await ensureMessagesTable();
  const existing = await get(
    `SELECT id FROM chat_threads WHERE user_id = ? AND order_id = ? AND game_id = ?`,
    [userId, orderId, gameId]
  );
  if (existing) return existing.id;
  const info = await run(
    `INSERT INTO chat_threads (user_id, order_id, game_id, game_title)
     VALUES (?, ?, ?, ?)`,
    [userId, orderId, gameId, gameTitle]
  );
  return info.lastID;
}

async function createOrderThreads(userId, order) {
  await ensureMessagesTable();
  const items = Array.isArray(order?.items) ? order.items : [];
  return transaction(async () => {
    const created = [];
    for (const item of items) {
      const threadId = await createThreadForOrderItem(
        userId,
        order.id,
        item.game_id || item.gameId,
        item.title || `Игра #${item.game_id || item.gameId}`
      );
      created.push({
        thread_id: threadId,
        game_id: item.game_id || item.gameId,
        game_title: item.title || `Игра #${item.game_id || item.gameId}`,
      });
    }
    return created;
  });
}

async function createThreadMessage(threadId, userId, senderType, messageText, giftCode = null, quickKey = null) {
  await ensureMessagesTable();
  const info = await run(
    `INSERT INTO chat_messages (thread_id, user_id, sender_type, message_text, gift_code, quick_key)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [threadId, userId, senderType, messageText, giftCode, quickKey]
  );
  return info.lastID;
}

async function getChatThreadsByUser(userId) {
  await ensureMessagesTable();
  return all(
    `SELECT
       t.id,
       t.order_id,
       t.game_id,
       t.game_title,
       t.specialist_requested,
       MAX(m.id) AS last_message_id,
       MAX(m.created_at) AS last_message_at,
       COALESCE(
         (
           SELECT m2.message_text
           FROM chat_messages m2
           WHERE m2.thread_id = t.id
           ORDER BY m2.id DESC
           LIMIT 1
         ),
         ''
       ) AS last_message_text
     FROM chat_threads t
     LEFT JOIN chat_messages m ON m.thread_id = t.id
     WHERE t.user_id = ?
     GROUP BY t.id
     ORDER BY last_message_id DESC, t.id DESC`,
    [userId]
  );
}

async function getThreadByIdForUser(userId, threadId) {
  await ensureMessagesTable();
  return get(
    `SELECT id, order_id, game_id, game_title, specialist_requested
     FROM chat_threads
     WHERE id = ? AND user_id = ?`,
    [threadId, userId]
  );
}

async function getThreadMessagesForUser(userId, threadId) {
  await ensureMessagesTable();
  const thread = await getThreadByIdForUser(userId, threadId);
  if (!thread) return null;
  const messages = await all(
    `SELECT id, thread_id, sender_type, message_text, gift_code, quick_key, created_at
     FROM chat_messages
     WHERE thread_id = ?
     ORDER BY id DESC`,
    [threadId]
  );
  return { thread, messages };
}

async function markSpecialistRequested(userId, threadId) {
  await ensureMessagesTable();
  const thread = await getThreadByIdForUser(userId, threadId);
  if (!thread) return false;
  await run(
    `UPDATE chat_threads
     SET specialist_requested = 1
     WHERE id = ? AND user_id = ?`,
    [threadId, userId]
  );
  return true;
}

async function getSpecialistThreads() {
  await ensureMessagesTable();
  return all(
    `SELECT
       t.id,
       t.user_id,
       u.name AS user_name,
       u.email AS user_email,
       t.order_id,
       t.game_id,
       t.game_title,
       t.specialist_requested,
       MAX(m.id) AS last_message_id,
       MAX(m.created_at) AS last_message_at,
       COALESCE(
         (
           SELECT m2.message_text
           FROM chat_messages m2
           WHERE m2.thread_id = t.id
           ORDER BY m2.id DESC
           LIMIT 1
         ),
         ''
       ) AS last_message_text
     FROM chat_threads t
     JOIN users u ON u.id = t.user_id
     LEFT JOIN chat_messages m ON m.thread_id = t.id
     WHERE EXISTS (
       SELECT 1
       FROM chat_messages cm
       WHERE cm.thread_id = t.id
         AND cm.sender_type IN ('user', 'admin', 'bot', 'system')
     )
     GROUP BY t.id
     ORDER BY t.specialist_requested DESC, last_message_id DESC, t.id DESC`
  );
}

async function getThreadMessagesForAdmin(threadId) {
  await ensureMessagesTable();
  const thread = await get(
    `SELECT
       t.id,
       t.user_id,
       u.name AS user_name,
       u.email AS user_email,
       t.order_id,
       t.game_id,
       t.game_title,
       t.specialist_requested
     FROM chat_threads t
     JOIN users u ON u.id = t.user_id
     WHERE t.id = ?`,
    [threadId]
  );
  if (!thread) return null;
  const messages = await all(
    `SELECT id, thread_id, sender_type, message_text, gift_code, quick_key, created_at
     FROM chat_messages
     WHERE thread_id = ?
     ORDER BY id DESC`,
    [threadId]
  );
  return { thread, messages };
}

async function resolveSpecialistRequest(threadId) {
  await ensureMessagesTable();
  const info = await run(
    `UPDATE chat_threads
     SET specialist_requested = 0
     WHERE id = ?`,
    [threadId]
  );
  return info.changes > 0;
}

module.exports = {
  createOrderThreads,
  createThreadMessage,
  getChatThreadsByUser,
  getThreadByIdForUser,
  getThreadMessagesForUser,
  markSpecialistRequested,
  getSpecialistThreads,
  getThreadMessagesForAdmin,
  resolveSpecialistRequest,
};

