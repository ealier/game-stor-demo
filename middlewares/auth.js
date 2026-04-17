function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Недостаточно прав' });
  }
  next();
}

function attachUserToLocals(req, res, next) {
  res.locals.user = req.session.user || null;
  next();
}

module.exports = {
  requireAuth,
  requireAdmin,
  attachUserToLocals,
};

