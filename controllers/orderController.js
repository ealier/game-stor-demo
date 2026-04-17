const { createOrder, getOrdersByUser } = require('../models/orderModel');
const {
  createOrderThreads,
  createThreadMessage,
  getChatThreadsByUser,
  getThreadByIdForUser,
  getThreadMessagesForUser,
  markSpecialistRequested,
  getSpecialistThreads,
  getThreadMessagesForAdmin,
  resolveSpecialistRequest,
} = require('../models/messageModel');

const FAQ_ITEMS = [
  {
    key: 'where_code',
    question: 'Куда вставлять этот код?',
    answer: 'Откройте Steam -> Игры -> Активировать в Steam и вставьте код в поле активации.',
  },
  {
    key: 'code_not_working',
    question: 'Код не активируется, что делать?',
    answer: 'Проверьте раскладку и символы. Если ошибка остается, нажмите "Позвать специалиста" в этом чате.',
  },
  {
    key: 'code_region',
    question: 'Есть ли региональные ограничения?',
    answer: 'Да, у некоторых ключей есть регион. Если регион не подходит, напишите в этот чат - поможем с заменой.',
  },
  {
    key: 'when_delivery',
    question: 'Когда приходит код после оплаты?',
    answer: 'Обычно в течение 10-15 секунд после подтверждения оплаты.',
  },
  {
    key: 'refund',
    question: 'Можно ли вернуть покупку?',
    answer: 'Возврат возможен, если код еще не активирован. Напишите нам в чат для проверки заказа.',
  },
  {
    key: 'multibuy',
    question: 'Если купил несколько игр, где их коды?',
    answer: 'Для каждой купленной игры создается отдельный чат. Код приходит в чат конкретной игры.',
  },
  {
    key: 'specialist',
    question: 'Как связаться с живым специалистом?',
    answer: 'Нажмите кнопку "Позвать специалиста" - мы подключим оператора к этому чату.',
  },
];

function randomChunk(len) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < len; i += 1) {
    const index = Math.floor(Math.random() * chars.length);
    out += chars[index];
  }
  return out;
}

function generateSteamGiftCode() {
  return `${randomChunk(5)}-${randomChunk(5)}-${randomChunk(5)}`;
}

function scheduleGiftCodeDelivery(userId, orderId, threads = []) {
  const delayMs = 10000 + Math.floor(Math.random() * 5001);
  setTimeout(async () => {
    try {
      for (const thread of threads) {
        const code = generateSteamGiftCode();
        await createThreadMessage(
          thread.thread_id,
          userId,
          'system',
          `Оплата заказа #${orderId} подтверждена. Вот ваш подарочный Steam-код:`,
          code
        );
        await createThreadMessage(
          thread.thread_id,
          userId,
          'system',
          'Спасибо за покупку! Если у вас остались вопросы, пишите в этот чат.'
        );
      }
    } catch (error) {
      console.error('Failed to deliver gift code message:', error);
    }
  }, delayMs);
}

function detectFaqAnswer(input) {
  const text = String(input || '').toLowerCase();
  if (!text) return null;
  const checks = [
    { keys: ['куда', 'встав', 'код'], faqKey: 'where_code' },
    { keys: ['не актив', 'код'], faqKey: 'code_not_working' },
    { keys: ['регион', 'огранич'], faqKey: 'code_region' },
    { keys: ['когда', 'прид', 'код'], faqKey: 'when_delivery' },
    { keys: ['возврат', 'вернуть'], faqKey: 'refund' },
    { keys: ['несколько', 'игр', 'коды'], faqKey: 'multibuy' },
    { keys: ['специалист', 'оператор'], faqKey: 'specialist' },
  ];
  const match = checks.find((item) => item.keys.every((k) => text.includes(k)));
  return match ? FAQ_ITEMS.find((f) => f.key === match.faqKey) : null;
}

function detectGeneralBotAnswer(input) {
  const text = String(input || '').toLowerCase().trim();
  if (!text) return null;

  const patterns = [
    {
      keys: ['как дела'],
      answer: 'Спасибо, все в порядке. Готов помочь с активацией кода, оплатой и любыми вопросами по заказу.',
    },
    {
      keys: ['привет'],
      answer: 'Привет! Я бот поддержки Dandan. Могу помочь с кодом, Steam и заказом.',
    },
    {
      keys: ['здравств'],
      answer: 'Здравствуйте! Чем помочь по этому заказу?',
    },
    {
      keys: ['где скачать', 'steam'],
      answer: 'Steam можно скачать на официальном сайте: https://store.steampowered.com/about/. После установки войдите в аккаунт и активируйте код.',
    },
    {
      keys: ['скачать', 'steam'],
      answer: 'Официальная загрузка Steam: https://store.steampowered.com/about/. Рекомендуем скачивать только оттуда.',
    },
    {
      keys: ['как активировать', 'steam'],
      answer: 'В Steam нажмите "Игры" -> "Активировать в Steam..." и введите код из этого чата.',
    },
    {
      keys: ['не приходит код'],
      answer: 'Обычно код приходит за 10-15 секунд. Если прошло больше минуты, обновите чат и напишите сюда — проверим вручную.',
    },
    {
      keys: ['спасибо'],
      answer: 'Пожалуйста! Если появятся вопросы по активации или заказу — я на связи.',
    },
    {
      keys: ['пока'],
      answer: 'Хорошего дня и приятной игры! Если что — возвращайтесь в чат.',
    },
  ];

  const found = patterns.find((p) => p.keys.every((k) => text.includes(k)));
  if (found) return found.answer;

  const needsSpecialist = [
    'не помогло',
    'не понял',
    'непонятно',
    'оператор',
    'человек',
    'живой',
    'поддержк',
    'специалист',
    'бесполезно',
    'не работает вообще',
  ].some((k) => text.includes(k));

  if (needsSpecialist) {
    return 'Понял вас. Чтобы быстрее решить вопрос, могу подключить живого специалиста. Нажмите кнопку "Позвать специалиста" в этом чате.';
  }

  return 'Я понял ваш вопрос. Могу помочь с установкой Steam, активацией кода, оплатой и доступом к игре. Уточните, пожалуйста, что именно не получается, и я подскажу шаги.';
}

function isOffTopicQuestion(input) {
  const text = String(input || '').toLowerCase();
  const supportKeywords = [
    'код',
    'steam',
    'заказ',
    'оплат',
    'игр',
    'актив',
    'возврат',
    'сайт',
    'чат',
    'специалист',
    'ключ',
  ];
  return !supportKeywords.some((k) => text.includes(k));
}

async function askDeepSeek({ userText, gameTitle }) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return null;
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
  const offTopicSuffix = isOffTopicQuestion(userText)
    ? '\n\nЕсть ли у вас вопросы по сайту?\nЕсть ли у вас вопросы по вашему заказу?'
    : '';
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.6,
      messages: [
        {
          role: 'system',
          content:
            'Ты дружелюбный русскоязычный помощник магазина цифровых игр. Отвечай коротко, понятно, без токсичности, без выдуманных фактов. Если вопрос связан с покупкой/активацией/Steam, дай практичные шаги.',
        },
        {
          role: 'user',
          content: `Игра в текущем чате: ${gameTitle || 'не указана'}.\nВопрос пользователя: ${userText}\nОтветь пользователю по делу.${offTopicSuffix ? ` В конце ответа добавь дословно:${offTopicSuffix}` : ''}`,
        },
      ],
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  return content ? String(content).trim() : null;
}

async function createOrderController(req, res, next) {
  try {
    const cart = req.session.cart || [];
    if (!cart.length) {
      return res.status(400).json({ error: 'Корзина пуста' });
    }

    const items = cart.map((i) => ({
      gameId: i.gameId,
      quantity: i.quantity,
      price: i.price,
    }));

    const recipient = {
      recipient_name: req.body.recipient_name,
      recipient_phone: req.body.recipient_phone,
      payment_method: req.body.payment_method,
      sbp_bank: req.body.sbp_bank,
    };

    const order = await createOrder(req.session.user.id, items, recipient);
    const threads = await createOrderThreads(req.session.user.id, order);
    scheduleGiftCodeDelivery(req.session.user.id, order.id, threads);
    req.session.cart = [];
    res.json({ order });
  } catch (err) {
    next(err);
  }
}

async function getMyOrders(req, res, next) {
  try {
    const orders = await getOrdersByUser(req.session.user.id);
    res.json({ orders });
  } catch (err) {
    next(err);
  }
}

async function getChatThreads(req, res, next) {
  try {
    const threads = await getChatThreadsByUser(req.session.user.id);
    res.json({ threads });
  } catch (err) {
    next(err);
  }
}

async function getChatThreadMessages(req, res, next) {
  try {
    const threadId = Number(req.params.threadId);
    if (!threadId) {
      return res.status(400).json({ error: 'Некорректный чат' });
    }
    const data = await getThreadMessagesForUser(req.session.user.id, threadId);
    if (!data) {
      return res.status(404).json({ error: 'Чат не найден' });
    }
    res.json(data);
  } catch (err) {
    next(err);
  }
}

async function sendThreadMessage(req, res, next) {
  try {
    const threadId = Number(req.params.threadId);
    if (!threadId) {
      return res.status(400).json({ error: 'Некорректный чат' });
    }
    const thread = await getThreadByIdForUser(req.session.user.id, threadId);
    if (!thread) {
      return res.status(404).json({ error: 'Чат не найден' });
    }
    const text = String(req.body?.message || '').trim();
    const quickKey = String(req.body?.quickKey || '').trim();
    if (!text) {
      return res.status(400).json({ error: 'Сообщение не может быть пустым' });
    }
    if (text.length > 500) {
      return res.status(400).json({ error: 'Сообщение слишком длинное' });
    }
    await createThreadMessage(threadId, req.session.user.id, 'user', text, null, quickKey || null);

    if (Number(thread.specialist_requested) === 1) {
      const data = await getThreadMessagesForUser(req.session.user.id, threadId);
      return res.status(201).json(data);
    }

    const quickMatch = quickKey
      ? FAQ_ITEMS.find((f) => f.key === quickKey)
      : detectFaqAnswer(text);
    if (quickMatch) {
      await createThreadMessage(threadId, req.session.user.id, 'bot', quickMatch.answer, null, quickMatch.key);
    } else {
      const aiAnswer = await askDeepSeek({ userText: text, gameTitle: thread.game_title });
      const fallbackAnswer = aiAnswer || detectGeneralBotAnswer(text);
      await createThreadMessage(threadId, req.session.user.id, 'bot', fallbackAnswer, null, null);
    }

    const data = await getThreadMessagesForUser(req.session.user.id, threadId);
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
}

async function callSpecialist(req, res, next) {
  try {
    const threadId = Number(req.params.threadId);
    if (!threadId) {
      return res.status(400).json({ error: 'Некорректный чат' });
    }
    const marked = await markSpecialistRequested(req.session.user.id, threadId);
    if (!marked) {
      return res.status(404).json({ error: 'Чат не найден' });
    }
    await createThreadMessage(
      threadId,
      req.session.user.id,
      'system',
      'Запрос принят. Специалист подключится к чату в ближайшее время.'
    );
    const data = await getThreadMessagesForUser(req.session.user.id, threadId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

async function getFaq(req, res, next) {
  try {
    res.json({ items: FAQ_ITEMS.map(({ key, question, answer }) => ({ key, question, answer })) });
  } catch (err) {
    next(err);
  }
}

async function getSpecialistChats(req, res, next) {
  try {
    const threads = await getSpecialistThreads();
    res.json({ threads });
  } catch (err) {
    next(err);
  }
}

async function getSpecialistChatMessages(req, res, next) {
  try {
    const threadId = Number(req.params.threadId);
    if (!threadId) {
      return res.status(400).json({ error: 'Некорректный чат' });
    }
    const data = await getThreadMessagesForAdmin(threadId);
    if (!data) {
      return res.status(404).json({ error: 'Чат не найден' });
    }
    res.json(data);
  } catch (err) {
    next(err);
  }
}

async function sendSpecialistMessage(req, res, next) {
  try {
    const threadId = Number(req.params.threadId);
    if (!threadId) {
      return res.status(400).json({ error: 'Некорректный чат' });
    }
    const text = String(req.body?.message || '').trim();
    if (!text) {
      return res.status(400).json({ error: 'Сообщение не может быть пустым' });
    }
    const data = await getThreadMessagesForAdmin(threadId);
    if (!data) {
      return res.status(404).json({ error: 'Чат не найден' });
    }
    await createThreadMessage(threadId, data.thread.user_id, 'admin', text, null, null);
    const updated = await getThreadMessagesForAdmin(threadId);
    res.status(201).json(updated);
  } catch (err) {
    next(err);
  }
}

async function resolveSpecialistChat(req, res, next) {
  try {
    const threadId = Number(req.params.threadId);
    if (!threadId) {
      return res.status(400).json({ error: 'Некорректный чат' });
    }
    const data = await getThreadMessagesForAdmin(threadId);
    if (!data) {
      return res.status(404).json({ error: 'Чат не найден' });
    }
    await resolveSpecialistRequest(threadId);
    await createThreadMessage(
      threadId,
      data.thread.user_id,
      'system',
      'Проблема отмечена как решенная. При необходимости вы можете снова позвать специалиста.'
    );
    const updated = await getThreadMessagesForAdmin(threadId);
    res.json(updated);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createOrder: createOrderController,
  getMyOrders,
  getChatThreads,
  getChatThreadMessages,
  sendThreadMessage,
  callSpecialist,
  getFaq,
  getSpecialistChats,
  getSpecialistChatMessages,
  sendSpecialistMessage,
  resolveSpecialistChat,
};

