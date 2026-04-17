const { findById } = require('../models/gameModel');

function normalizeCart(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (i) =>
      i &&
      typeof i.gameId === 'number' &&
      Number.isFinite(i.gameId) &&
      i.gameId > 0
  );
}

function getCart(req, res) {
  if (!req.session.cart) {
    req.session.cart = [];
  } else {
    req.session.cart = normalizeCart(req.session.cart);
  }
  res.json({ items: req.session.cart });
}

async function addToCart(req, res, next) {
  try {
    const { gameId, quantity = 1 } = req.body;
    if (!gameId) {
      return res.status(400).json({ error: 'Не указан gameId' });
    }

    const game = await findById(gameId);
    if (!game) {
      return res.status(404).json({ error: 'Игра не найдена' });
    }

    if (!req.session.cart) {
      req.session.cart = [];
    } else {
      req.session.cart = normalizeCart(req.session.cart);
    }

    const existing = req.session.cart.find((i) => i.gameId === game.id);
    if (existing) {
      existing.quantity += quantity;
    } else {
      req.session.cart.push({
        gameId: game.id,
        title: game.title,
        price: game.price,
        image_url: game.image_url,
        quantity,
      });
    }

    res.json({ items: req.session.cart });
  } catch (err) {
    next(err);
  }
}

function removeFromCart(req, res) {
  const gameId = parseInt(req.params.gameId, 10);
  if (!req.session.cart) {
    req.session.cart = [];
  }
  req.session.cart = normalizeCart(
    req.session.cart.filter((i) => i.gameId !== gameId)
  );
  res.json({ items: req.session.cart });
}

function updateCartItem(req, res) {
  const gameId = parseInt(req.params.gameId, 10);
  const { quantity } = req.body;
  if (!req.session.cart) {
    req.session.cart = [];
  }
  req.session.cart = normalizeCart(req.session.cart);
  const item = req.session.cart.find((i) => i.gameId === gameId);
  if (!item) {
    return res.status(404).json({ error: 'Товар в корзине не найден' });
  }
  item.quantity = quantity;
  res.json({ items: req.session.cart });
}

module.exports = {
  getCart,
  addToCart,
  removeFromCart,
  updateCartItem,
};

