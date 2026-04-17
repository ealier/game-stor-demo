const express = require('express');
const {
  register,
  login,
  logout,
  me,
  profile,
  updateProfile,
} = require('../controllers/authController');
const { requireAuth } = require('../middlewares/auth');

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/logout', logout);
router.get('/me', me);
router.get('/profile', requireAuth, profile);
router.put('/profile', requireAuth, updateProfile);

module.exports = router;

