const express = require('express');
const {
  createOrder,
  getMyOrders,
  getChatThreads,
  getChatThreadMessages,
  sendThreadMessage,
  callSpecialist,
  getFaq,
  getSpecialistChats,
  getSpecialistChatMessages,
  sendSpecialistMessage,
  resolveSpecialistChat,
} = require('../controllers/orderController');
const { requireAuth, requireAdmin } = require('../middlewares/auth');

const router = express.Router();

router.post('/', requireAuth, createOrder);
router.get('/me', requireAuth, getMyOrders);
router.get('/chat/threads', requireAuth, getChatThreads);
router.get('/chat/threads/:threadId/messages', requireAuth, getChatThreadMessages);
router.post('/chat/threads/:threadId/messages', requireAuth, sendThreadMessage);
router.post('/chat/threads/:threadId/call-specialist', requireAuth, callSpecialist);
router.get('/chat/faq', requireAuth, getFaq);
router.get('/chat/admin/specialist-threads', requireAdmin, getSpecialistChats);
router.get('/chat/admin/specialist-threads/:threadId/messages', requireAdmin, getSpecialistChatMessages);
router.post('/chat/admin/specialist-threads/:threadId/messages', requireAdmin, sendSpecialistMessage);
router.post('/chat/admin/specialist-threads/:threadId/resolve', requireAdmin, resolveSpecialistChat);

module.exports = router;

