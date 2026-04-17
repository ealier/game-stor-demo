const path = require('path');
const fs = require('fs');
const { createGame, updateGame, deleteGame, findById } = require('../models/gameModel');

function handleImageUpload(req, existingImageUrl) {
  if (req.file) {
    return '/uploads/' + req.file.filename;
  }
  return existingImageUrl || null;
}

async function createGameController(req, res, next) {
  try {
    const {
      title,
      description,
      price,
      genre_id,
      platform,
      release_date,
      system_requirements,
      image_url,
    } = req.body;

    if (!title || !description || !price || !genre_id || !platform) {
      return res.status(400).json({ error: 'Заполните обязательные поля' });
    }

    const imgUrl = handleImageUpload(req, image_url);

    const game = await createGame({
      title,
      description,
      price: parseFloat(price),
      genre_id: parseInt(genre_id, 10),
      platform,
      release_date,
      system_requirements,
      image_url: imgUrl,
    });

    res.status(201).json(game);
  } catch (err) {
    next(err);
  }
}

async function updateGameController(req, res, next) {
  try {
    const existing = await findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Игра не найдена' });
    }

    const {
      title,
      description,
      price,
      genre_id,
      platform,
      release_date,
      system_requirements,
      image_url,
    } = req.body;

    const imgUrl = handleImageUpload(req, image_url || existing.image_url);

    const game = await updateGame(req.params.id, {
      title: title || existing.title,
      description: description || existing.description,
      price: price ? parseFloat(price) : existing.price,
      genre_id: genre_id ? parseInt(genre_id, 10) : existing.genre_id,
      platform: platform || existing.platform,
      release_date: release_date || existing.release_date,
      system_requirements: system_requirements || existing.system_requirements,
      image_url: imgUrl,
    });

    res.json(game);
  } catch (err) {
    next(err);
  }
}

async function deleteGameController(req, res, next) {
  try {
    const existing = await findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Игра не найдена' });
    }

    if (existing.image_url && existing.image_url.startsWith('/uploads/')) {
      const filePath = path.join(
        __dirname,
        '..',
        'public',
        existing.image_url
      );
      fs.unlink(filePath, () => {});
    }

    await deleteGame(req.params.id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createGame: createGameController,
  updateGame: updateGameController,
  deleteGame: deleteGameController,
};

