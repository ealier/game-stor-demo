const { all } = require('../db/db');

async function getAllGenres() {
  return all('SELECT * FROM genres ORDER BY name');
}

module.exports = {
  getAllGenres,
};

