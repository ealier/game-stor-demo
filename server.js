const path = require('path');
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const morgan = require('morgan');
const cors = require('cors');

const authRoutes = require('./routes/authRoutes');
const gameRoutes = require('./routes/gameRoutes');
const cartRoutes = require('./routes/cartRoutes');
const orderRoutes = require('./routes/orderRoutes');
const adminRoutes = require('./routes/adminRoutes');

const { attachUserToLocals } = require('./middlewares/auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    store: new SQLiteStore({
      db: 'sessions.sqlite',
      dir: path.join(__dirname, 'db'),
    }),
    secret: process.env.SESSION_SECRET || 'super-secret-game-store',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24,
    },
  })
);

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(attachUserToLocals);

app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/games', gameRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/admin', adminRoutes);

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(err.status || 500).json({
    error: 'Internal server error',
    message: err.message || 'Unexpected error',
  });
});

app.listen(PORT, () => {
  console.log(`🎮 Game Store server running on http://localhost:${PORT}`);
});

