const bcrypt = require('bcryptjs');
const { db, run, get, all, transaction } = require('./db');

async function init() {
  await run(
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS genres (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      price REAL NOT NULL,
      genre_id INTEGER NOT NULL,
      platform TEXT NOT NULL,
      release_date TEXT,
      image_url TEXT,
      system_requirements TEXT,
      FOREIGN KEY (genre_id) REFERENCES genres(id) ON DELETE RESTRICT
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      total REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      game_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      price REAL NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE RESTRICT
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS user_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      message_text TEXT NOT NULL,
      gift_code TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS chat_threads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      order_id INTEGER NOT NULL,
      game_id INTEGER NOT NULL,
      game_title TEXT NOT NULL,
      specialist_requested INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE RESTRICT
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      thread_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      sender_type TEXT NOT NULL,
      message_text TEXT NOT NULL,
      gift_code TEXT,
      quick_key TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`
  );

  // Миграция: добавляем поля получателя и оплаты в заказы
  for (const col of ['recipient_name', 'recipient_phone', 'delivery_address', 'payment_method', 'sbp_bank']) {
    try {
      await run(`ALTER TABLE orders ADD COLUMN ${col} TEXT`);
    } catch {
      /* колонка уже существует */
    }
  }

  const genreRow = await get('SELECT COUNT(*) as c FROM genres');
  if (!genreRow || genreRow.c === 0) {
    const genres = ['Action', 'RPG', 'Indie', 'Shooter', 'Adventure', 'Strategy'];
    for (const g of genres) {
      await run('INSERT INTO genres (name) VALUES (?)', [g]);
    }
  }

  const adminRow = await get(
    "SELECT COUNT(*) as c FROM users WHERE role = 'admin'"
  );
  if (!adminRow || adminRow.c === 0) {
    const passwordHash = bcrypt.hashSync('admin', 10);
    await run(
      'INSERT INTO users (email, password_hash, role, name) VALUES (?, ?, ?, ?)',
      ['admin@example.com', passwordHash, 'admin', 'Admin']
    );
  }

  const gamesRow = await get('SELECT COUNT(*) as c FROM games');
  if (!gamesRow || gamesRow.c === 0) {
    const genres = await all('SELECT id, name FROM genres');
    const getGenreId = (name) =>
      genres.find((g) => g.name.toLowerCase() === name.toLowerCase())?.id ||
      genres[0].id;

    const demoGames = [
      {
        title: 'The Witcher 3: Wild Hunt',
        description:
          'Классическая RPG в открытом мире по саге о ведьмаке Геральте, с упором на сюжет и выборы игрока.',
        price: 29.99,
        genre_id: getGenreId('RPG'),
        platform: 'PC, PS4, PS5, Xbox',
        release_date: '2015-05-19',
        image_url: '/images/games/the-witcher-3-wild-hunt.jpg',
        system_requirements:
          'OS: Windows 10; CPU: i5; RAM: 8GB; GPU: GTX 770; Storage: 50GB',
      },
      {
        title: 'Cyberpunk 2077',
        description:
          'Футуристическая RPG в ночном городе Найт‑Сити с нелинейными квестами и глубокими ролевыми системами.',
        price: 59.99,
        genre_id: getGenreId('RPG'),
        platform: 'PC, PS5, Xbox Series',
        release_date: '2020-12-10',
        image_url: '/images/games/cyberpunk-2077.jpg',
        system_requirements:
          'OS: Windows 10; CPU: i7; RAM: 12GB; GPU: GTX 1060; Storage: 70GB',
      },
      {
        title: 'Red Dead Redemption 2',
        description:
          'Кинематографическая история банды Ван дер Линде на закате дикого запада в огромном открытом мире.',
        price: 59.99,
        genre_id: getGenreId('Adventure'),
        platform: 'PC, PS4, Xbox',
        release_date: '2018-10-26',
        image_url: '/images/games/red-dead-redemption-2.jpg',
        system_requirements:
          'OS: Windows 10; CPU: i7; RAM: 12GB; GPU: GTX 1060; Storage: 150GB',
      },
      {
        title: 'Elden Ring',
        description:
          'Экшен‑RPG от FromSoftware в обширном мире Междуземья с высокими испытаниями и свободой исследования.',
        price: 59.99,
        genre_id: getGenreId('RPG'),
        platform: 'PC, PS4, PS5, Xbox',
        release_date: '2022-02-25',
        image_url: '/images/games/elden-ring.jpg',
        system_requirements:
          'OS: Windows 10; CPU: i5; RAM: 12GB; GPU: GTX 1060; Storage: 60GB',
      },
      {
        title: 'God of War (2018)',
        description:
          'Переосмысление серии про Кратоса и его сына Атрея с фокусом на истории и боевой системе от третьего лица.',
        price: 49.99,
        genre_id: getGenreId('Action'),
        platform: 'PC, PS4',
        release_date: '2018-04-20',
        image_url: '/images/games/god-of-war-2018.jpg',
        system_requirements:
          'OS: Windows 10; CPU: i5; RAM: 8GB; GPU: GTX 1060; Storage: 70GB',
      },
      {
        title: 'Horizon Forbidden West',
        description:
          'Приключенческий боевик в постапокалиптическом мире с роботизированной фауной и героиней Элой.',
        price: 69.99,
        genre_id: getGenreId('Adventure'),
        platform: 'PS4, PS5',
        release_date: '2022-02-18',
        image_url: '/images/games/horizon-forbidden-west.jpg',
        system_requirements:
          'Платформы: PlayStation 4 / PlayStation 5',
      },
      {
        title: 'Grand Theft Auto V',
        description:
          'Открытый мир Лос‑Сантоса и окрестностей с тремя протагонистами и богатым набором активностей.',
        price: 29.99,
        genre_id: getGenreId('Action'),
        platform: 'PC, PS4, PS5, Xbox',
        release_date: '2013-09-17',
        image_url: '/images/games/grand-theft-auto-v.jpg',
        system_requirements:
          'OS: Windows 10; CPU: i5; RAM: 8GB; GPU: GTX 660; Storage: 90GB',
      },
      {
        title: 'Assassin\'s Creed Valhalla',
        description:
          'Ролевая экшен‑игра о викинге Эйворе, который основывает поселение в Англии IX века.',
        price: 59.99,
        genre_id: getGenreId('RPG'),
        platform: 'PC, PS4, PS5, Xbox',
        release_date: '2020-11-10',
        image_url: '/images/games/assassins-creed-valhalla.jpg',
        system_requirements:
          'OS: Windows 10; CPU: i7; RAM: 8GB; GPU: GTX 1080; Storage: 80GB',
      },
      {
        title: 'Resident Evil 4 (Remake)',
        description:
          'Современная переосмысленная версия классического хоррора с Леоном Кеннеди и спасением дочери президента.',
        price: 59.99,
        genre_id: getGenreId('Action'),
        platform: 'PC, PS4, PS5, Xbox',
        release_date: '2023-03-24',
        image_url: '/images/games/resident-evil-4-remake.jpg',
        system_requirements:
          'OS: Windows 10; CPU: i7; RAM: 16GB; GPU: GTX 1070; Storage: 60GB',
      },
      {
        title: 'Call of Duty: Modern Warfare II',
        description:
          'Динамичный шутер от первого лица с кинематографичной кампанией и многопользовательскими режимами.',
        price: 69.99,
        genre_id: getGenreId('Shooter'),
        platform: 'PC, PS4, PS5, Xbox',
        release_date: '2022-10-28',
        image_url: '/images/games/call-of-duty-modern-warfare-ii.jpg',
        system_requirements:
          'OS: Windows 10; CPU: i7; RAM: 16GB; GPU: GTX 1060; Storage: 90GB',
      },
      {
        title: 'Counter-Strike 2',
        description:
          'Командный соревновательный шутер 5х5 с акцентом на точную стрельбу и командную тактику.',
        price: 0.0,
        genre_id: getGenreId('Shooter'),
        platform: 'PC',
        release_date: '2023-09-27',
        image_url: '/images/games/counter-strike-2.jpg',
        system_requirements:
          'OS: Windows 10; CPU: i5; RAM: 8GB; GPU: GTX 1060; Storage: 60GB',
      },
      {
        title: 'Minecraft',
        description:
          'Песочница с генерацией миров, строительством и выживанием, позволяющая создавать практически всё что угодно.',
        price: 26.95,
        genre_id: getGenreId('Indie'),
        platform: 'PC, Consoles, Mobile',
        release_date: '2011-11-18',
        image_url: '/images/games/minecraft.jpg',
        system_requirements:
          'OS: Windows 10; CPU: i3; RAM: 4GB; GPU: Intel HD; Storage: 4GB',
      },
      {
        title: 'Stardew Valley',
        description:
          'Фермерский симулятор с RPG‑элементами, исследованием шахт и отношениями с жителями деревни.',
        price: 14.99,
        genre_id: getGenreId('Indie'),
        platform: 'PC, Consoles, Mobile',
        release_date: '2016-02-26',
        image_url: '/images/games/stardew-valley.jpg',
        system_requirements:
          'OS: Windows 7; CPU: i2; RAM: 2GB; GPU: Intel HD; Storage: 1GB',
      },
      {
        title: 'Hades',
        description:
          'Roguelike‑экшен от Supergiant Games, где вы играете за сына Аида и пытаетесь выбраться из подземного мира.',
        price: 24.99,
        genre_id: getGenreId('Indie'),
        platform: 'PC, PS4, PS5, Switch, Xbox',
        release_date: '2020-09-17',
        image_url: '/images/games/hades.jpg',
        system_requirements:
          'OS: Windows 7; CPU: i3; RAM: 4GB; GPU: Intel HD; Storage: 15GB',
      },
      {
        title: 'Cities: Skylines II',
        description:
          'Продвинутая градостроительная стратегия, позволяющая создавать и управлять современными мегаполисами.',
        price: 49.99,
        genre_id: getGenreId('Strategy'),
        platform: 'PC, PS5, Xbox Series',
        release_date: '2023-10-24',
        image_url: '/images/games/cities-skylines-ii.jpg',
        system_requirements:
          'OS: Windows 10; CPU: i7; RAM: 16GB; GPU: RTX 2080; Storage: 50GB',
      },
      {
        title: 'Civilization VI',
        description:
          'Пошаговая стратегия, где вы проводите цивилизацию от каменного века до космической эры.',
        price: 29.99,
        genre_id: getGenreId('Strategy'),
        platform: 'PC, Consoles',
        release_date: '2016-10-21',
        image_url: '/images/games/civilization-vi.jpg',
        system_requirements:
          'OS: Windows 7; CPU: i3; RAM: 4GB; GPU: Intel HD; Storage: 12GB',
      },
      {
        title: 'League of Legends',
        description:
          'Командная MOBA‑игра 5х5, где каждая команда защищает свою базу и старается уничтожить вражеский нексус.',
        price: 0.0,
        genre_id: getGenreId('Strategy'),
        platform: 'PC',
        release_date: '2009-10-27',
        image_url: '/images/games/league-of-legends.jpg',
        system_requirements:
          'OS: Windows 10; CPU: i3; RAM: 4GB; GPU: Intel HD; Storage: 16GB',
      },
      {
        title: 'The Last of Us Part I',
        description:
          'Эмоциональная история Джоэла и Элли в постапокалиптическом мире, сочетающая стелс и экшен.',
        price: 69.99,
        genre_id: getGenreId('Adventure'),
        platform: 'PC, PS5',
        release_date: '2022-09-02',
        image_url: '/images/games/the-last-of-us-part-i.jpg',
        system_requirements:
          'OS: Windows 10; CPU: i7; RAM: 16GB; GPU: RTX 2070; Storage: 100GB',
      },
      {
        title: 'Ghost of Tsushima',
        description:
          'Приключенческий экшен о самурае Дзине Сакае на острове Цусима во время монгольского нашествия.',
        price: 59.99,
        genre_id: getGenreId('Adventure'),
        platform: 'PS4, PS5',
        release_date: '2020-07-17',
        image_url: '/images/games/ghost-of-tsushima.jpg',
        system_requirements:
          'Платформы: PlayStation 4 / PlayStation 5',
      },
      {
        title: 'DOOM Eternal',
        description:
          'Быстрый шутер от первого лица, где вы сражаетесь с легионами демонов в ярком и динамичном геймплее.',
        price: 39.99,
        genre_id: getGenreId('Shooter'),
        platform: 'PC, PS4, PS5, Xbox',
        release_date: '2020-03-20',
        image_url: '/images/games/doom-eternal.jpg',
        system_requirements:
          'OS: Windows 10; CPU: i5; RAM: 8GB; GPU: GTX 970; Storage: 50GB',
      },
    ];

    await transaction(async () => {
      for (const g of demoGames) {
        await run(
          `INSERT INTO games (title, description, price, genre_id, platform, release_date, image_url, system_requirements)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            g.title,
            g.description,
            g.price,
            g.genre_id,
            g.platform,
            g.release_date,
            g.image_url,
            g.system_requirements,
          ]
        );
      }
    });
  }

  console.log('Database initialized with demo data.');
}

init()
  .then(() => {
    db.close();
  })
  .catch((err) => {
    console.error(err);
    db.close();
    process.exit(1);
  });

