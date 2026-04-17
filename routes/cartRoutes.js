const express = require('express');
const {
  getCart,
  addToCart,
  removeFromCart,
  updateCartItem,
} = require('../controllers/cartController');
const { requireAuth } = require('../middlewares/auth');

const router = express.Router();

router.get('/', requireAuth, getCart);
router.post('/', requireAuth, addToCart);
router.delete('/:gameId', requireAuth, removeFromCart);
router.put('/:gameId', requireAuth, updateCartItem);

module.exports = router;

