const bcrypt = require('bcryptjs');
const { findByEmail, createUser, getUserWithOrders, updateProfile } = require('../models/userModel');

async function register(req, res, next) {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Заполните все поля' });
    }

    const existing = await findByEmail(email);
    if (existing) {
      return res.status(400).json({ error: 'Пользователь с таким email уже существует' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Пароль должен быть не короче 6 символов' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await createUser({ email, passwordHash, name });

    req.session.user = { id: user.id, email: user.email, role: user.role, name: user.name };

    res.json({ user: req.session.user });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Введите email и пароль' });
    }
    const user = await findByEmail(email);
    if (!user) {
      return res.status(400).json({ error: 'Неверный email или пароль' });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(400).json({ error: 'Неверный email или пароль' });
    }

    req.session.user = { id: user.id, email: user.email, role: user.role, name: user.name };

    res.json({ user: req.session.user });
  } catch (err) {
    next(err);
  }
}

function logout(req, res, next) {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
}

function me(req, res) {
  res.json({ user: req.session.user || null });
}

async function profile(req, res, next) {
  try {
    const data = await getUserWithOrders(req.session.user.id);
    if (!data) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    res.json(data);
  } catch (err) {
    next(err);
  }
}

async function updateProfileController(req, res, next) {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Имя не может быть пустым' });
    }
    const updated = await updateProfile(req.session.user.id, { name });
    req.session.user.name = updated.name;
    res.json({ user: req.session.user });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  register,
  login,
  logout,
  me,
  profile,
  updateProfile: updateProfileController,
};

