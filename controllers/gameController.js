const { listGames, findById } = require('../models/gameModel');
const { getAllGenres } = require('../models/genreModel');

async function getGames(req, res, next) {
  try {
    const {
      genreId,
      platform,
      minPrice,
      maxPrice,
      search,
      sort,
      page = 1,
      limit = 12,
    } = req.query;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = Math.min(parseInt(limit, 10) || 12, 48);
    const offset = (pageNum - 1) * limitNum;

    const { items, total } = await listGames({
      genreId,
      platform,
      minPrice,
      maxPrice,
      search,
      sort,
      limit: limitNum,
      offset,
    });

    const genres = await getAllGenres();

    res.json({
      items,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
      genres,
    });
  } catch (err) {
    next(err);
  }
}

async function getGameById(req, res, next) {
  try {
    const game = await findById(req.params.id);
    if (!game) {
      return res.status(404).json({ error: 'Игра не найдена' });
    }
    res.json(game);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getGames,
  getGameById,
};

