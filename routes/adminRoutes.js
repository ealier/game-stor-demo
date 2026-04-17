const express = require('express');
const multer = require('multer');
const path = require('path');
const {
  createGame,
  updateGame,
  deleteGame,
} = require('../controllers/adminController');
const { requireAdmin } = require('../middlewares/auth');

const router = express.Router();

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '..', 'public', 'uploads'));
  },
  filename: function (req, file, cb) {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, unique + ext);
  },
});

const upload = multer({ storage });

router.post('/games', requireAdmin, upload.single('image'), createGame);
router.put('/games/:id', requireAdmin, upload.single('image'), updateGame);
router.delete('/games/:id', requireAdmin, deleteGame);

module.exports = router;

