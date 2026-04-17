const { all, get, run } = require('../db/db');

async function listGames({
  genreId,
  platform,
  minPrice,
  maxPrice,
  search,
  sort,
  limit = 12,
  offset = 0,
}) {
  const conditions = [];
  const params = [];

  if (genreId) {
    conditions.push('g.genre_id = ?');
    params.push(genreId);
  }
  if (platform) {
    conditions.push('LOWER(g.platform) LIKE LOWER(?)');
    params.push(`%${platform}%`);
  }
  if (minPrice) {
    conditions.push('g.price >= ?');
    params.push(minPrice);
  }
  if (maxPrice) {
    conditions.push('g.price <= ?');
    params.push(maxPrice);
  }
  if (search) {
    conditions.push(
      '(LOWER(g.title) LIKE LOWER(?) OR LOWER(g.description) LIKE LOWER(?))'
    );
    params.push(`%${search}%`, `%${search}%`);
  }

  let orderBy = 'g.id DESC';
  if (sort === 'price_asc') orderBy = 'g.price ASC';
  if (sort === 'price_desc') orderBy = 'g.price DESC';
  if (sort === 'title') orderBy = 'g.title ASC';

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const baseSelect = `
    FROM games g
    LEFT JOIN genres ge ON ge.id = g.genre_id
    ${where}
  `;

  const items = await all(
    `
      SELECT g.*, ge.name as genre_name
      ${baseSelect}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `,
    [...params, limit, offset]
  );

  const totalRow = await get(
    `
      SELECT COUNT(*) as c
      ${baseSelect}
    `,
    params
  );

  const total = totalRow ? totalRow.c : 0;

  return { items, total };
}

async function findById(id) {
  return get(
    `
      SELECT g.*, ge.name as genre_name
      FROM games g
      LEFT JOIN genres ge ON ge.id = g.genre_id
      WHERE g.id = ?
    `,
    [id]
  );
}

async function createGame(data) {
  const info = await run(
    `
    INSERT INTO games (title, description, price, genre_id, platform, release_date, image_url, system_requirements)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `,
    [
      data.title,
      data.description,
      data.price,
      data.genre_id,
      data.platform,
      data.release_date,
      data.image_url,
      data.system_requirements,
    ]
  );
  return findById(info.lastID);
}

async function updateGame(id, data) {
  await run(
    `
    UPDATE games
    SET title = ?,
        description = ?,
        price = ?,
        genre_id = ?,
        platform = ?,
        release_date = ?,
        image_url = ?,
        system_requirements = ?
    WHERE id = ?
  `,
    [
      data.title,
      data.description,
      data.price,
      data.genre_id,
      data.platform,
      data.release_date,
      data.image_url,
      data.system_requirements,
      id,
    ]
  );
  return findById(id);
}

async function deleteGame(id) {
  await run('DELETE FROM games WHERE id = ?', [id]);
}

module.exports = {
  listGames,
  findById,
  createGame,
  updateGame,
  deleteGame,
};

