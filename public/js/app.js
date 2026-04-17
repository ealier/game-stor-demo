const API_BASE = '';

const state = {
  user: null,
  cartLocal: JSON.parse(localStorage.getItem('cart') || '[]'),
  chatMessages: [],
  chatThreads: [],
  chatSelectedThreadId: null,
  chatFaqItems: [],
  chatPollTimer: null,
  liveChatPollTimer: null,
  waitingGiftUntil: 0,
  chatUnreadCount: 0,
  adminSupportThreads: [],
  adminSupportSelectedThreadId: null,
  adminSupportMessages: [],
  adminSupportUserFilter: '',
  adminSupportSearch: '',
  catalogPage: 1,
  catalogFilters: {
    genreId: '',
    platform: '',
    search: '',
    sort: '',
  },
  genres: [],
  adminEditGame: null,
};

function $(selector) {
  return document.querySelector(selector);
}
function $all(selector) {
  return Array.from(document.querySelectorAll(selector));
}

function showToast(message) {
  const toast = $('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove('toast-hide', 'hidden');
  toast.classList.add('toast-show');
  setTimeout(() => {
    toast.classList.add('toast-hide');
    setTimeout(() => {
      toast.classList.add('hidden');
      toast.classList.remove('toast-show', 'toast-hide');
    }, 200);
  }, 2000);
}

const USD_TO_RUB_RATE = 81.3;

function formatPrice(value) {
  const usdAmount = Number(value || 0);
  const rubAmount = usdAmount * USD_TO_RUB_RATE;
  return `${new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(rubAmount)} ₽`;
}

async function api(path, options = {}) {
  const res = await fetch(API_BASE + path, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });
  const isJson = res.headers
    .get('content-type')
    ?.includes('application/json');
  const data = isJson ? await res.json() : null;
  if (!res.ok) {
    throw new Error(data?.error || 'Ошибка запроса');
  }
  return data;
}

function getRouteFromHash() {
  const hash = (window.location.hash || '').replace(/^#/, '');
  if (!hash) return { route: 'home' };
  if (hash.startsWith('game/')) {
    const id = parseInt(hash.slice(5), 10);
    return { route: 'game', id: isNaN(id) ? null : id };
  }
  const valid = ['home', 'catalog', 'cart', 'account', 'chat', 'support', 'login', 'register', 'checkout'];
  return valid.includes(hash) ? { route: hash } : { route: 'home' };
}

function applyRoute(route, id) {
  $all('.page-section').forEach((el) => el.classList.add('hidden'));
  const pageEl = $(`#page-${route}`);
  if (pageEl) pageEl.classList.remove('hidden');
  $all('.nav-link').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.route === route);
  });
  if (route === 'catalog') loadCatalog();
  if (route === 'cart') renderCart();
  if (route === 'account') loadAccount();
  if (route === 'chat') loadChatPage();
  if (route === 'support') loadSupportPage();
  if (route === 'checkout') loadCheckoutPage();
  setupLiveChatPolling(route);
}

function setRoute(route, id) {
  if (route === 'account' && !state.user) {
    route = 'login';
  }
  if (route === 'chat' && !state.user) {
    route = 'login';
  }
  if (route === 'support' && (!state.user || state.user.role !== 'admin')) {
    route = 'login';
  }
  if (route === 'login' && state.user) {
    route = 'account';
  }
  if (route === 'checkout' && !state.user) {
    route = 'login';
  }
  const hash = route === 'game' && id ? `game/${id}` : route;
  if (window.location.hash !== '#' + hash) {
    window.location.hash = hash;
  }
  applyRoute(route, id);
}

function syncCartCount() {
  const count = state.user
    ? (state.serverCart?.reduce((sum, i) => sum + i.quantity, 0) || 0)
    : state.cartLocal.reduce((sum, i) => sum + i.quantity, 0);
  const el = $('#cartCount');
  if (el) el.textContent = count;
}

function getChatSeenStorageKey() {
  if (!state.user) return null;
  const userKey = state.user.id ?? state.user.email;
  if (!userKey) return null;
  return `chat_last_seen_${String(userKey)}`;
}

function getSeenMap() {
  const key = getChatSeenStorageKey();
  if (!key) return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function markChatAsRead() {
  if (!state.user || !state.chatSelectedThreadId || !state.chatMessages.length) return;
  const key = getChatSeenStorageKey();
  if (!key) return;
  const seen = getSeenMap();
  seen[String(state.chatSelectedThreadId)] = Number(state.chatMessages[0].id || 0);
  localStorage.setItem(key, JSON.stringify(seen));
  updateChatUnreadCount();
  updateChatUI();
}

function updateChatUnreadCount() {
  const seen = getSeenMap();
  state.chatUnreadCount = (state.chatThreads || []).reduce((sum, thread) => {
    const lastSeen = Number(seen[String(thread.id)] || 0);
    const lastId = Number(thread.last_message_id || 0);
    return sum + (lastId > lastSeen ? 1 : 0);
  }, 0);
}

function updateChatUI() {
  const chatNav = $('#chatNav');
  const fab = $('#chatFab');
  const badge = $('#chatFabBadge');
  const hasUser = Boolean(state.user);
  if (chatNav) chatNav.classList.toggle('hidden', !hasUser);
  if (fab) {
    const showFab = hasUser && state.chatUnreadCount > 0;
    fab.classList.toggle('hidden', !showFab);
  }
  if (badge) {
    const unread = state.chatUnreadCount;
    badge.textContent = unread > 99 ? '99+' : String(unread);
    badge.classList.toggle('hidden', unread <= 0);
  }
}

function renderAdminSupportThreads() {
  const box = $('#adminSupportThreads');
  if (!box) return;
  if (!state.user || state.user.role !== 'admin') return;
  const searchValue = state.adminSupportSearch.trim().toLowerCase();
  const filtered = state.adminSupportThreads.filter((t) => {
    const userIdOk = !state.adminSupportUserFilter || String(t.user_id) === String(state.adminSupportUserFilter);
    if (!userIdOk) return false;
    if (!searchValue) return true;
    const haystack = `${t.user_name || ''} ${t.user_email || ''}`.toLowerCase();
    return haystack.includes(searchValue);
  });
  if (!filtered.length) {
    box.innerHTML = '<p class="text-xs text-neutral-500">Чаты не найдены по текущему фильтру.</p>';
    return;
  }
  box.innerHTML = filtered
    .map((t) => {
      const isActive = Number(t.id) === Number(state.adminSupportSelectedThreadId);
      const inProgress = Number(t.specialist_requested) === 1;
      const statusBadge = inProgress
        ? '<span class="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">В работе</span>'
        : '<span class="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Решено</span>';
      return `
        <button type="button" data-admin-thread="${t.id}" class="w-full text-left p-2.5 rounded-xl border ${isActive ? 'border-neutral-900 bg-neutral-100' : 'border-neutral-200 bg-white'}">
          <div class="flex items-center justify-between gap-2">
            <p class="text-xs font-semibold text-neutral-900 line-clamp-1">${t.game_title}</p>
            ${statusBadge}
          </div>
          <p class="text-[11px] text-neutral-500 mt-1 line-clamp-1">${t.user_name || 'Пользователь'} · ${t.user_email}</p>
          <p class="text-[11px] text-neutral-500 line-clamp-2">${t.last_message_text || ''}</p>
        </button>
      `;
    })
    .join('');
}

function renderAdminSupportUsers() {
  const select = $('#adminSupportUserSelect');
  if (!select) return;
  const uniqueUsers = [];
  const seen = new Set();
  for (const t of state.adminSupportThreads) {
    const key = String(t.user_id);
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueUsers.push({ id: t.user_id, name: t.user_name || 'Пользователь', email: t.user_email || '' });
  }
  select.innerHTML =
    '<option value="">Все пользователи</option>' +
    uniqueUsers
      .map((u) => `<option value="${u.id}">${u.name} (${u.email})</option>`)
      .join('');
  if (state.adminSupportUserFilter) {
    select.value = String(state.adminSupportUserFilter);
  }
}

function renderAdminSupportMessages() {
  const box = $('#adminSupportMessages');
  const title = $('#adminSupportTitle');
  const resolveBtn = $('#adminSupportResolveBtn');
  const thread = state.adminSupportThreads.find((t) => Number(t.id) === Number(state.adminSupportSelectedThreadId));
  if (title) {
    title.textContent = thread
      ? `${thread.game_title} · ${thread.user_name || 'Пользователь'} (${thread.user_email || ''})`
      : 'Выберите чат слева';
  }
  if (resolveBtn) {
    resolveBtn.disabled = !thread || Number(thread.specialist_requested) !== 1;
  }
  if (!box) return;
  if (!state.adminSupportSelectedThreadId) {
    box.innerHTML = '<p class="text-xs text-neutral-500">Выберите чат из списка слева.</p>';
    return;
  }
  if (!state.adminSupportMessages.length) {
    box.innerHTML = '<p class="text-xs text-neutral-500">Сообщений пока нет.</p>';
    return;
  }
  box.innerHTML = [...state.adminSupportMessages]
    .reverse()
    .map((m) => {
      const role = m.sender_type || 'system';
      const roleLabel = role === 'admin' ? 'Специалист' : role === 'user' ? 'Пользователь' : 'Система';
      return `
        <div class="p-2 rounded-lg border border-neutral-200 ${role === 'admin' ? 'bg-emerald-50' : 'bg-white'}">
          <p class="text-[11px] text-neutral-500">${roleLabel} · ${new Date(m.created_at).toLocaleString('ru-RU')}</p>
          <p class="text-xs text-neutral-800 mt-1">${m.message_text || ''}</p>
        </div>
      `;
    })
    .join('');
  box.scrollTop = box.scrollHeight;
}

async function loadSupportPage() {
  if (!state.user || state.user.role !== 'admin') {
    setRoute('login');
    return;
  }
  await fetchAdminSupportThreads();
  await fetchAdminSupportMessages();
  renderAdminSupportThreads();
  renderAdminSupportMessages();
}

function renderChatMessages() {
  const box = $('#chatMessages');
  if (!box) return;
  if (!state.user) {
    box.innerHTML = '<p class="text-xs text-neutral-500">Чат доступен только авторизованным пользователям.</p>';
    return;
  }
  if (!state.chatSelectedThreadId) {
    box.innerHTML = '<p class="text-xs text-neutral-500">Выберите чат по игре слева.</p>';
    return;
  }
  const messages = state.chatMessages || [];
  if (!messages.length) {
    box.innerHTML = '<p class="text-xs text-neutral-500">В этом чате пока нет сообщений.</p>';
    return;
  }
  box.innerHTML = [...messages]
    .reverse()
    .map((msg) => {
      const code = msg.code || msg.gift_code || '';
      const text = msg.text || msg.message_text || '';
      const timeRaw = msg.time || msg.created_at || '';
      const timeText = timeRaw ? new Date(timeRaw).toLocaleString('ru-RU') : '';
      const sender = msg.sender_type || 'system';
      const isSystem = sender !== 'user';
      const isSupport = sender === 'admin';
      const cardClass = isSystem
        ? 'bg-neutral-100 border border-neutral-200'
        : 'bg-white border border-neutral-200 ml-6';
      const supportBadge = isSupport
        ? '<span class="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Поддержка</span>'
        : '';
      const codeBlock = code
        ? `
          <div class="mt-2 flex items-center gap-2 flex-wrap">
            <code class="px-2 py-1 rounded-md bg-neutral-100 border border-neutral-200 text-[11px] font-semibold tracking-wide">${code}</code>
            <button class="secondary-btn text-[11px]" data-chat-copy="${msg.id}" data-chat-code="${code}">
              Скопировать код
            </button>
          </div>
        `
        : '';
      return `
        <div class="p-3 rounded-xl text-xs ${cardClass}">
          <div class="flex items-center gap-2">
            <p class="text-[11px] text-neutral-500">${timeText}</p>
            ${supportBadge}
          </div>
          <p class="text-neutral-800 mt-1">${text}</p>
          ${codeBlock}
        </div>
      `;
    })
    .join('');
  box.scrollTop = box.scrollHeight;
}

function renderChatThreads() {
  const list = $('#chatThreadsList');
  if (!list) return;
  if (!state.chatThreads.length) {
    list.innerHTML = '<p class="text-xs text-neutral-500 p-2">Чатов пока нет. Оформите заказ, и чат появится автоматически.</p>';
    return;
  }
  const seen = getSeenMap();
  list.innerHTML = state.chatThreads
    .map((thread) => {
      const isActive = Number(thread.id) === Number(state.chatSelectedThreadId);
      const unread = Number(thread.last_message_id || 0) > Number(seen[String(thread.id)] || 0);
      const inProgress = Number(thread.specialist_requested) === 1;
      const statusBadge = inProgress
        ? '<span class="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">В работе</span>'
        : '<span class="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Решено</span>';
      return `
        <button type="button" data-chat-thread="${thread.id}" class="w-full text-left p-3 rounded-xl border ${isActive ? 'border-neutral-900 bg-neutral-100' : 'border-neutral-200 bg-white hover:bg-neutral-50'}">
          <div class="flex items-center justify-between gap-2">
            <p class="text-xs font-semibold text-neutral-900 line-clamp-1">${thread.game_title}</p>
            <div class="flex items-center gap-2">
              ${statusBadge}
              ${unread ? '<span class="inline-flex h-2.5 w-2.5 rounded-full bg-rose-500"></span>' : ''}
            </div>
          </div>
          <p class="text-[11px] text-neutral-500 mt-1 line-clamp-2">${thread.last_message_text || 'Сообщений пока нет'}</p>
        </button>
      `;
    })
    .join('');
}

function renderFaqButtons() {
  const box = $('#chatQuickFaq');
  if (!box) return;
  if (!state.chatSelectedThreadId || !state.chatFaqItems.length) {
    box.innerHTML = '';
    return;
  }
  box.innerHTML = state.chatFaqItems
    .map((item) => `<button type="button" class="secondary-btn text-[11px]" data-chat-faq="${item.key}" data-chat-question="${item.question}">${item.question}</button>`)
    .join('');
}

function updateChatHeader() {
  const title = $('#chatCurrentTitle');
  const callBtn = $('#chatCallSpecialistBtn');
  const thread = state.chatThreads.find((t) => Number(t.id) === Number(state.chatSelectedThreadId));
  if (title) {
    title.textContent = thread ? `${thread.game_title} (заказ #${thread.order_id})` : 'Выберите чат слева';
  }
  if (callBtn) {
    callBtn.disabled = !thread;
    if (thread && Number(thread.specialist_requested) === 1) {
      callBtn.textContent = 'Ожидается специалист';
      callBtn.disabled = true;
    } else {
      callBtn.textContent = 'Позвать специалиста';
    }
  }
}

async function fetchChatThreads() {
  if (!state.user) {
    state.chatThreads = [];
    state.chatMessages = [];
    state.chatSelectedThreadId = null;
    state.chatUnreadCount = 0;
    updateChatUI();
    renderChatThreads();
    updateChatHeader();
    renderFaqButtons();
    renderChatMessages();
    return;
  }
  try {
    const { threads } = await api('/api/orders/chat/threads');
    state.chatThreads = Array.isArray(threads) ? threads : [];
    if (!state.chatSelectedThreadId && state.chatThreads.length) {
      state.chatSelectedThreadId = state.chatThreads[0].id;
    }
    if (state.chatSelectedThreadId && !state.chatThreads.some((t) => Number(t.id) === Number(state.chatSelectedThreadId))) {
      state.chatSelectedThreadId = state.chatThreads[0]?.id || null;
    }
    updateChatUnreadCount();
    updateChatUI();
    renderChatThreads();
    updateChatHeader();
  } catch {
    state.chatThreads = [];
    state.chatMessages = [];
    state.chatSelectedThreadId = null;
    state.chatUnreadCount = 0;
    updateChatUI();
    renderChatThreads();
    updateChatHeader();
    renderChatMessages();
  }
}

async function fetchChatMessages() {
  if (!state.user || !state.chatSelectedThreadId) {
    state.chatMessages = [];
    renderChatMessages();
    return;
  }
  try {
    const { messages } = await api(`/api/orders/chat/threads/${state.chatSelectedThreadId}/messages`);
    state.chatMessages = Array.isArray(messages) ? messages : [];
    renderChatMessages();
  } catch {
    state.chatMessages = [];
    renderChatMessages();
  }
}

async function fetchChatFaq() {
  if (!state.user) return;
  try {
    const { items } = await api('/api/orders/chat/faq');
    state.chatFaqItems = Array.isArray(items) ? items : [];
    renderFaqButtons();
  } catch {
    state.chatFaqItems = [];
    renderFaqButtons();
  }
}

async function sendChatMessage() {
  const input = $('#chatInput');
  if (!input || !state.chatSelectedThreadId) return;
  const text = input.value.trim();
  if (!text) return;
  try {
    const { messages } = await api(`/api/orders/chat/threads/${state.chatSelectedThreadId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ message: text, quickKey: '' }),
    });
    state.chatMessages = Array.isArray(messages) ? messages : [];
    input.value = '';
    renderChatMessages();
    await fetchChatThreads();
  } catch (e) {
    showToast(e.message || 'Не удалось отправить сообщение');
  }
}

async function sendQuickFaqMessage(question, quickKey) {
  if (!state.chatSelectedThreadId) return;
  try {
    const { messages } = await api(`/api/orders/chat/threads/${state.chatSelectedThreadId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ message: question, quickKey }),
    });
    state.chatMessages = Array.isArray(messages) ? messages : [];
    renderChatMessages();
    await fetchChatThreads();
  } catch (e) {
    showToast(e.message || 'Не удалось отправить вопрос');
  }
}

async function callSpecialistInThread() {
  if (!state.chatSelectedThreadId) return;
  try {
    const { messages } = await api(`/api/orders/chat/threads/${state.chatSelectedThreadId}/call-specialist`, {
      method: 'POST',
    });
    state.chatMessages = Array.isArray(messages) ? messages : [];
    renderChatMessages();
    await fetchChatThreads();
    showToast('Специалист вызван');
  } catch (e) {
    showToast(e.message || 'Не удалось вызвать специалиста');
  }
}

async function sendAdminSupportMessage() {
  const input = $('#adminSupportReplyInput');
  if (!input || !state.adminSupportSelectedThreadId) return;
  const text = input.value.trim();
  if (!text) return;
  try {
    const { messages } = await api(`/api/orders/chat/admin/specialist-threads/${state.adminSupportSelectedThreadId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ message: text }),
    });
    state.adminSupportMessages = Array.isArray(messages) ? messages : [];
    input.value = '';
    renderAdminSupportMessages();
    await fetchAdminSupportThreads();
  } catch (e) {
    showToast(e.message || 'Не удалось отправить ответ');
  }
}

async function resolveAdminSupportThread() {
  if (!state.adminSupportSelectedThreadId) return;
  try {
    const { messages } = await api(`/api/orders/chat/admin/specialist-threads/${state.adminSupportSelectedThreadId}/resolve`, {
      method: 'POST',
    });
    state.adminSupportMessages = Array.isArray(messages) ? messages : [];
    await fetchAdminSupportThreads();
    renderAdminSupportMessages();
    showToast('Чат отмечен как решенный');
  } catch (e) {
    showToast(e.message || 'Не удалось завершить чат');
  }
}

async function loadChatPage() {
  if (!state.user) {
    setRoute('login');
    return;
  }
  await fetchChatThreads();
  await fetchChatMessages();
  await fetchChatFaq();
  renderChatThreads();
  updateChatHeader();
  renderFaqButtons();
  markChatAsRead();
  renderChatThreads();
}

async function fetchAdminSupportThreads() {
  if (!state.user || state.user.role !== 'admin') return;
  try {
    const { threads } = await api('/api/orders/chat/admin/specialist-threads');
    state.adminSupportThreads = Array.isArray(threads) ? threads : [];
    if (!state.adminSupportSelectedThreadId && state.adminSupportThreads.length) {
      state.adminSupportSelectedThreadId = state.adminSupportThreads[0].id;
    }
    if (state.adminSupportSelectedThreadId && !state.adminSupportThreads.some((t) => Number(t.id) === Number(state.adminSupportSelectedThreadId))) {
      state.adminSupportSelectedThreadId = state.adminSupportThreads[0]?.id || null;
    }
    renderAdminSupportUsers();
    renderAdminSupportThreads();
  } catch {
    state.adminSupportThreads = [];
    state.adminSupportSelectedThreadId = null;
    renderAdminSupportUsers();
    renderAdminSupportThreads();
  }
}

async function fetchAdminSupportMessages() {
  if (!state.user || state.user.role !== 'admin' || !state.adminSupportSelectedThreadId) {
    state.adminSupportMessages = [];
    renderAdminSupportMessages();
    return;
  }
  try {
    const { messages } = await api(`/api/orders/chat/admin/specialist-threads/${state.adminSupportSelectedThreadId}/messages`);
    state.adminSupportMessages = Array.isArray(messages) ? messages : [];
    renderAdminSupportMessages();
  } catch {
    state.adminSupportMessages = [];
    renderAdminSupportMessages();
  }
}

function stopGiftMessagePolling() {
  if (state.chatPollTimer) {
    clearInterval(state.chatPollTimer);
    state.chatPollTimer = null;
  }
}

function stopLiveChatPolling() {
  if (state.liveChatPollTimer) {
    clearInterval(state.liveChatPollTimer);
    state.liveChatPollTimer = null;
  }
}

function setupLiveChatPolling(route) {
  stopLiveChatPolling();
  if (route === 'chat' && state.user) {
    state.liveChatPollTimer = setInterval(async () => {
      try {
        const activeThreadId = state.chatSelectedThreadId;
        await fetchChatMessages();
        await fetchChatThreads();
        if (
          activeThreadId &&
          state.chatThreads.some((t) => Number(t.id) === Number(activeThreadId))
        ) {
          state.chatSelectedThreadId = activeThreadId;
          await fetchChatMessages();
        }
        markChatAsRead();
        renderChatThreads();
      } catch (e) {
        console.error('Live chat polling error:', e);
      }
    }, 2500);
    return;
  }
  if (route === 'support' && state.user && state.user.role === 'admin') {
    state.liveChatPollTimer = setInterval(async () => {
      try {
        await fetchAdminSupportThreads();
        await fetchAdminSupportMessages();
      } catch (e) {
        console.error('Live support polling error:', e);
      }
    }, 2500);
  }
}

function startGiftMessagePolling() {
  stopGiftMessagePolling();
  if (!state.user) return;
  state.chatPollTimer = setInterval(async () => {
    await fetchChatThreads();
    if (window.location.hash === '#chat') {
      await fetchChatMessages();
      markChatAsRead();
      renderChatThreads();
    }
    if (Date.now() > state.waitingGiftUntil) {
      stopGiftMessagePolling();
    }
  }, 3000);
}

async function loadMe() {
  try {
    const { user } = await api('/api/auth/me');
    state.user = user;
    if (state.user) {
      try {
        const data = await api('/api/cart');
        state.serverCart = data.items || [];
      } catch {
        state.serverCart = [];
      }
    } else {
      state.serverCart = [];
    }
  } catch {
    state.user = null;
    state.serverCart = [];
  }
  state.chatMessages = [];
  state.chatUnreadCount = 0;
  if (state.user) {
    await fetchChatThreads();
  }
  updateAuthUI();
  syncCartCount();
}

function updateAuthUI() {
  const authButton = $('#authButton');
  const accountNav = $('#accountNav');
  const chatNav = $('#chatNav');
  const supportNav = $('#supportNav');
  const heroLoginButton = $('#heroLoginButton');
  if (!authButton) return;
  if (state.user) {
    authButton.textContent = state.user.name || state.user.email;
    if (accountNav) accountNav.classList.remove('hidden');
    if (chatNav) chatNav.classList.remove('hidden');
    if (supportNav) supportNav.classList.toggle('hidden', state.user.role !== 'admin');
    if (heroLoginButton) heroLoginButton.classList.add('hidden');
  } else {
    authButton.textContent = 'Войти';
    if (accountNav) accountNav.classList.add('hidden');
    if (chatNav) chatNav.classList.add('hidden');
    if (supportNav) supportNav.classList.add('hidden');
    if (heroLoginButton) heroLoginButton.classList.remove('hidden');
  }
  updateChatUI();
}

async function loadHome() {
  try {
    const data = await api('/api/games?limit=6&sort=price_desc');
    state.genres = data.genres;
    renderHomePopular(data.items);
    renderHomeGenres(data.genres);
    fillGenreSelects(data.genres);
  } catch (e) {
    console.error(e);
  }
}

function renderHomePopular(games) {
  const box = $('#homePopularGames');
  if (!box) return;
  box.innerHTML = games
    .map(
      (g) => `
      <button data-action="view-game" data-id="${g.id}" class="w-full text-left glass-card p-3 transition flex items-center gap-3">
        <div class="h-14 w-20 rounded-xl overflow-hidden bg-neutral-900 flex-shrink-0">
          <img src="${g.image_url || '/images/placeholder-game.jpg'}" alt="${g.title}" class="h-full w-full object-cover" />
        </div>
        <div class="flex-1">
          <div class="flex items-center justify-between gap-2">
            <p class="text-xs font-semibold text-neutral-900 line-clamp-1">${g.title}</p>
            <span class="price-tag text-xs font-semibold text-neutral-900 whitespace-nowrap">${formatPrice(
              g.price
            )}</span>
          </div>
          <p class="text-[11px] text-neutral-500 line-clamp-2 mt-1">${g.description}</p>
        </div>
      </button>
    `
    )
    .join('');
}

function renderHomeGenres(genres) {
  const box = $('#homeGenres');
  if (!box) return;
  box.innerHTML = genres
    .map(
      (g, idx) => `
      <button
        class="glass-card p-3 text-left group hover:border-neutral-300 hover:bg-neutral-50 transition relative"
        data-route="catalog"
        data-genre-id="${g.id}"
      >
        <div class="relative flex items-center justify-between gap-2">
          <div>
            <p class="text-xs font-semibold text-neutral-800">${g.name}</p>
            <p class="text-[10px] text-neutral-500 mt-0.5">Экшен, атмосфера, квесты</p>
          </div>
          <span class="material-symbols-outlined text-sm text-neutral-500 group-hover:translate-x-0.5 transition">north_east</span>
        </div>
      </button>
    `
    )
    .join('');
}

function updateCatalogFilterUI() {
  const { genreId, platform, sort } = state.catalogFilters;
  const genreLabels = { '': 'Все жанры', ...Object.fromEntries((state.genres || []).map((g) => [String(g.id), g.name])) };
  const platformLabels = { '': 'Все платформы', PC: 'PC', PlayStation: 'PlayStation', Xbox: 'Xbox', Switch: 'Switch' };
  const sortLabels = { '': 'Сортировка', price_asc: 'Цена: по возрастанию', price_desc: 'Цена: по убыванию', title: 'Название' };
  const gTrigger = $('#genreFilterTrigger');
  const pTrigger = $('#platformFilterTrigger');
  const sTrigger = $('#sortFilterTrigger');
  if (gTrigger) gTrigger.querySelector('.catalog-filter-value').textContent = genreLabels[genreId || ''] || 'Все жанры';
  if (pTrigger) pTrigger.querySelector('.catalog-filter-value').textContent = platformLabels[platform || ''] || 'Все платформы';
  if (sTrigger) sTrigger.querySelector('.catalog-filter-value').textContent = sortLabels[sort || ''] || 'Сортировка';
  $all('.catalog-filter-item').forEach((item) => {
    const filter = item.closest('.catalog-filter');
    const value = item.dataset.value || '';
    const isGenre = filter?.dataset.filter === 'genre';
    const isPlatform = filter?.dataset.filter === 'platform';
    const isSort = filter?.dataset.filter === 'sort';
    const selected = (isGenre && (genreId || '') === value) || (isPlatform && (platform || '') === value) || (isSort && (sort || '') === value);
    item.classList.toggle('selected', selected);
  });
}

function fillGenreSelects(genres) {
  const catalogList = $('#genreFilterList');
  const adminSelect = $('#adminGenre');
  if (catalogList) {
    catalogList.innerHTML =
      '<button type="button" class="catalog-filter-item" data-value="">Все жанры</button>' +
      genres.map((g) => `<button type="button" class="catalog-filter-item" data-value="${g.id}">${g.name}</button>`).join('');
  }
  if (adminSelect) {
    adminSelect.innerHTML =
      '<option value="">Жанр</option>' +
      genres.map((g) => `<option value="${g.id}">${g.name}</option>`).join('');
  }
}

async function loadCatalog() {
  const { genreId, platform, search, sort } = state.catalogFilters;
  const params = new URLSearchParams();
  params.set('page', state.catalogPage.toString());
  if (genreId) params.set('genreId', genreId);
  if (platform) params.set('platform', platform);
  if (search) params.set('search', search);
  if (sort) params.set('sort', sort);

  try {
    const data = await api(`/api/games?${params.toString()}`);
    state.genres = data.genres;
    renderCatalogGrid(data.items);
    fillGenreSelects(data.genres);
    updateCatalogFilterUI();
    $('#paginationInfo').textContent = `Страница ${data.page} из ${
      data.pages || 1
    }`;
    $('#prevPage').disabled = data.page <= 1;
    $('#nextPage').disabled = data.page >= data.pages;
  } catch (e) {
    console.error(e);
    showToast('Не удалось загрузить каталог');
  }
}

function renderCatalogGrid(items) {
  const grid = $('#catalogGrid');
  if (!grid) return;
  if (!items.length) {
    grid.innerHTML =
      '<p class="text-xs text-slate-400 col-span-full">Ничего не найдено.</p>';
    return;
  }
  grid.innerHTML = items
    .map(
      (g) => `
      <article class="game-card group flex flex-col overflow-hidden">
        <div class="relative h-40 w-full overflow-hidden">
          <img
            src="${g.image_url || '/images/placeholder-game.jpg'}"
            alt="${g.title}"
            class="h-full w-full object-cover"
          />
          <div class="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-900/20 to-transparent"></div>
          <div class="absolute left-3 bottom-2 flex items-center gap-2">
            <span class="pill pill-genre">${g.genre_name || 'Жанр'}</span>
            <span class="pill pill-platform">${g.platform}</span>
          </div>
        </div>
        <div class="flex-1 flex flex-col p-3.5 space-y-2">
          <h3 class="text-sm font-semibold text-neutral-900 line-clamp-2">${g.title}</h3>
          <p class="text-[11px] text-slate-400 line-clamp-2">${g.description}</p>
          <div class="mt-auto space-y-1">
            <div class="flex items-center justify-between">
              <div class="flex flex-col">
                <span class="text-[11px] text-slate-400">от</span>
                <span class="price-tag text-base font-semibold text-neutral-900 whitespace-nowrap">${formatPrice(
                  g.price
                )}</span>
              </div>
              <div class="flex gap-2">
                <button
                  class="secondary-btn text-[11px]"
                  data-action="view-game"
                  data-id="${g.id}"
                >
                  Подробнее
                </button>
                <button
                  class="primary-btn text-[11px]"
                  data-action="add-cart"
                  data-id="${g.id}"
                >
                  В корзину
                </button>
              </div>
            </div>
            ${
              state.user && state.user.role === 'admin'
                ? `<div class="flex justify-end gap-3 pt-1">
                    <button
                      class="text-[10px] text-slate-300 hover:text-white underline underline-offset-4"
                      data-action="admin-edit"
                      data-id="${g.id}"
                    >
                      Редактировать
                    </button>
                    <button
                      class="text-[10px] text-rose-400 hover:text-rose-200 underline underline-offset-4"
                      data-action="admin-delete"
                      data-id="${g.id}"
                    >
                      Удалить
                    </button>
                  </div>`
                : ''
            }
          </div>
        </div>
      </article>
    `
    )
    .join('');
}

async function loadGame(id) {
  try {
    const game = await api(`/api/games/${id}`);
    renderGameDetail(game);
    setRoute('game', id);
  } catch (e) {
    console.error(e);
    showToast('Игра не найдена');
    setRoute('home');
  }
}

function renderGameDetail(g) {
  const box = $('#gameDetail');
  if (!box) return;
  box.innerHTML = `
    <div class="md:col-span-2 space-y-4">
      <div class="relative overflow-hidden rounded-2xl border border-neutral-200">
        <img
          src="${g.image_url || '/images/placeholder-game.jpg'}"
          alt="${g.title}"
          class="h-64 w-full object-cover"
        />
        <div class="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/60 to-transparent"></div>
        <div class="absolute bottom-3 left-4 flex items-center gap-2 text-[11px]">
          <span class="pill pill-genre">${g.genre_name || 'Жанр'}</span>
          <span class="pill pill-platform">${g.platform}</span>
        </div>
      </div>
      <div class="aspect-video rounded-2xl overflow-hidden border border-neutral-200 bg-black/80">
        <iframe
          class="w-full h-full"
          src="https://www.youtube.com/embed/dQw4w9WgXcQ"
          title="Game trailer"
          frameborder="0"
          allowfullscreen
        ></iframe>
      </div>
    </div>
    <div class="md:col-span-3 flex flex-col space-y-4">
      <div>
        <h1 class="text-2xl font-semibold text-neutral-900">${g.title}</h1>
        <p class="text-xs text-neutral-500 mt-1">
          Жанр: ${g.genre_name || '—'} · Платформа: ${g.platform} · Релиз: ${
    g.release_date || '—'
  }
        </p>
      </div>
      <p class="text-sm text-neutral-700 leading-relaxed">${g.description}</p>
      <div class="glass-card p-4 text-xs text-neutral-700 whitespace-pre-line max-h-40 overflow-y-auto custom-scroll">
        ${g.system_requirements || 'Системные требования будут добавлены позже.'}
      </div>
      <div class="mt-auto flex items-center justify-between">
        <div>
          <div class="text-[11px] text-neutral-500">Цена</div>
          <div class="price-tag text-2xl font-semibold text-neutral-900 whitespace-nowrap">${formatPrice(
            g.price
          )}</div>
        </div>
        <button
          class="primary-btn text-sm"
          data-action="add-cart"
          data-id="${g.id}"
        >
          Добавить в корзину
        </button>
      </div>
    </div>
  `;
}

function getLocalCart() {
  return state.cartLocal;
}

function setLocalCart(cart) {
  state.cartLocal = cart;
  localStorage.setItem('cart', JSON.stringify(cart));
  syncCartCount();
}

async function addToCart(gameId) {
  if (!state.user) {
    const existing = state.cartLocal.find((i) => i.gameId === gameId);
    if (existing) existing.quantity += 1;
    else state.cartLocal.push({ gameId, quantity: 1 });
    setLocalCart([...state.cartLocal]);
    showToast('Игра добавлена в локальную корзину');
    return;
  }
  try {
    const data = await api('/api/cart', {
      method: 'POST',
      body: JSON.stringify({ gameId, quantity: 1 }),
    });
    state.serverCart = data.items;
    syncCartCount();
    showToast('Игра добавлена в корзину');
  } catch (e) {
    console.error(e);
    showToast('Ошибка при добавлении в корзину');
  }
}

async function syncLocalCartToServer() {
  if (!state.user || !state.cartLocal.length) return;
  try {
    for (const item of state.cartLocal) {
      await api('/api/cart', {
        method: 'POST',
        body: JSON.stringify({ gameId: item.gameId, quantity: item.quantity }),
      });
    }
    state.cartLocal = [];
    localStorage.removeItem('cart');
    const data = await api('/api/cart');
    state.serverCart = data.items;
    syncCartCount();
  } catch (e) {
    console.error(e);
  }
}

async function renderCart() {
  const box = $('#cartItems');
  const summaryText = $('#cartSummaryText');
  if (!box) return;

  let items = [];
  if (state.user) {
    try {
      const data = await api('/api/cart');
      items = data.items;
      state.serverCart = items;
    } catch {
      items = [];
    }
  } else {
    const local = getLocalCart();
    for (const item of local) {
      try {
        const game = await api(`/api/games/${item.gameId}`);
        items.push({
          gameId: item.gameId,
          quantity: item.quantity,
          title: game.title,
          price: game.price,
          image_url: game.image_url,
        });
      } catch {}
    }
  }

  if (!items.length) {
    box.innerHTML =
      '<p class="text-xs text-slate-400">Ваша корзина пуста. Добавьте игры из каталога.</p>';
    $('#cartTotal').textContent = '0 ₽';
    if (summaryText) {
      summaryText.textContent = '';
    }
    syncCartCount();
    return;
  }

  let total = 0;
  box.innerHTML = items
    .map((i) => {
      const price = typeof i.price === 'number' ? i.price : 0;
      const sub = price * i.quantity;
      const title = i.title || 'Товар';
      total += sub;
      return `
        <div class="glass-card p-3 flex items-center gap-3">
          <div class="h-16 w-20 rounded-xl overflow-hidden bg-neutral-900 flex-shrink-0">
            <img src="${i.image_url || '/images/placeholder-game.jpg'}" alt="${
        i.title
      }" class="h-full w-full object-cover" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-xs font-semibold text-neutral-900 line-clamp-1">${title}</p>
            <p class="text-[11px] text-neutral-500 mt-0.5">Цена: ${formatPrice(price)}</p>
            <div class="flex items-center gap-2 mt-1">
              <input
                type="number"
                min="1"
                value="${i.quantity}"
                class="input h-7 w-16 text-[11px]"
                data-cart-qty="${i.gameId}"
              />
              <button
                class="text-[11px] text-slate-400 hover:text-neutral-700"
                data-cart-remove="${i.gameId}"
              >
                Удалить
              </button>
            </div>
          </div>
          <div class="text-right">
            <div class="text-[11px] text-neutral-500">Сумма</div>
            <div class="price-tag text-sm font-semibold text-neutral-900 whitespace-nowrap">${formatPrice(
              sub
            )}</div>
          </div>
        </div>
      `;
    })
    .join('');

  $('#cartTotal').textContent = formatPrice(total);
  if (summaryText) {
    summaryText.textContent = `Позиций: ${
      items.length
    } · Локальная корзина: ${state.user ? 'синхронизирована' : 'гостевой режим'}`;
  }
  syncCartCount();
}

function openEditGameModal(game) {
  const modal = $('#editGameModal');
  const form = $('#editGameForm');
  if (!modal || !form) return;
  const idEl = $('#editGameId');
  const titleEl = $('#editTitle');
  const priceEl = $('#editPrice');
  const genreEl = $('#editGenre');
  const platformEl = $('#editPlatform');
  const dateEl = $('#editReleaseDate');
  const descEl = $('#editDescription');
  const reqEl = $('#editRequirements');
  const imageEl = $('#editImage');
  if (idEl) idEl.value = game.id;
  if (titleEl) titleEl.value = game.title || '';
  if (priceEl) priceEl.value = game.price != null ? game.price : '';
  if (platformEl) platformEl.value = game.platform || '';
  if (dateEl && game.release_date) dateEl.value = game.release_date;
  if (descEl) descEl.value = game.description || '';
  if (reqEl) reqEl.value = game.system_requirements || '';
  if (imageEl) imageEl.value = '';
  if (genreEl && state.genres.length) {
    genreEl.innerHTML =
      '<option value="">Жанр</option>' +
      state.genres.map((g) => `<option value="${g.id}">${g.name}</option>`).join('');
    if (game.genre_id) genreEl.value = game.genre_id;
  }
  modal.classList.remove('hidden');
}

function closeEditGameModal() {
  const modal = $('#editGameModal');
  if (modal) modal.classList.add('hidden');
}

function goToCheckout() {
  if (!state.user) {
    showToast('Авторизуйтесь, чтобы оформить заказ');
    setRoute('login');
    return;
  }
  const items = state.serverCart || [];
  if (!items.length) {
    showToast('Корзина пуста');
    return;
  }
  setRoute('checkout');
}

async function loadCheckoutPage() {
  if (!state.user) {
    setRoute('login');
    return;
  }
  try {
    const data = await api('/api/cart');
    state.serverCart = data.items || [];
  } catch {
    state.serverCart = [];
  }
  const items = state.serverCart || [];
  const itemsBox = $('#checkoutItems');
  const totalEl = $('#checkoutTotal');
  const confirmBtn = $('#checkoutConfirmBtn');
  const formBox = $('#checkoutFormBox');
  if (!itemsBox || !totalEl) return;

  if (!items.length) {
    itemsBox.innerHTML =
      '<p class="text-xs text-neutral-500">Корзина пуста. <a href="#" data-route="catalog" class="underline">Перейти в каталог</a></p>';
    if (totalEl) totalEl.textContent = '0 ₽';
    if (confirmBtn) confirmBtn.disabled = true;
    if (formBox) formBox.classList.add('hidden');
    return;
  }

  if (formBox) formBox.classList.remove('hidden');
  const emailEl = $('#checkoutEmail');
  const nameEl = $('#checkoutRecipientName');
  if (emailEl && state.user) emailEl.value = state.user.email || '';
  if (nameEl && state.user) nameEl.value = state.user.name || '';
  const sbpHidden = $('#checkoutSbpBank');
  if (sbpHidden) sbpHidden.value = '';
  const searchInput = $('#checkoutSbpBankSearch');
  if (searchInput) searchInput.value = '';
  $all('.bank-list-item').forEach((item) => {
    item.classList.remove('selected', 'hidden');
  });
  const cardBox = $('#checkoutCardFormBox');
  const sbpBox = $('#checkoutSbpBankBox');
  const phoneLabel = $('#checkoutPhoneLabel');
  if (cardBox) cardBox.classList.remove('hidden');
  if (sbpBox) sbpBox.classList.add('hidden');
  if (phoneLabel) phoneLabel.textContent = 'Телефон (необязательно)';
  const selectedBankBox = $('#checkoutSbpBankSelected');
  if (selectedBankBox) selectedBankBox.classList.add('hidden');

  let total = 0;
  itemsBox.innerHTML = items
    .map((i) => {
      const price = typeof i.price === 'number' ? i.price : 0;
      const sub = price * i.quantity;
      total += sub;
      return `
        <div class="glass-card p-3 flex items-center gap-3">
          <div class="h-14 w-16 rounded-lg overflow-hidden bg-neutral-900 flex-shrink-0">
            <img src="${i.image_url || '/images/placeholder-game.jpg'}" alt="${i.title || ''}" class="h-full w-full object-cover" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-semibold text-neutral-900 line-clamp-1">${i.title || 'Товар'}</p>
            <p class="text-[11px] text-neutral-500">${formatPrice(price)} × ${i.quantity}</p>
          </div>
          <div class="text-sm font-semibold text-neutral-900">${formatPrice(sub)}</div>
        </div>
      `;
    })
    .join('');

  totalEl.textContent = formatPrice(total);
  if (confirmBtn) confirmBtn.disabled = false;
}

function updateCheckoutSbpBankDisplay() {
  const bank = $('#checkoutSbpBank')?.value || '';
  const selectedBox = $('#checkoutSbpBankSelected');
  const nameEl = $('#checkoutSbpBankName');
  if (selectedBox && nameEl) {
    if (bank) {
      selectedBox.classList.remove('hidden');
      nameEl.textContent = bank;
    } else {
      selectedBox.classList.add('hidden');
      nameEl.textContent = '';
    }
  }
}

async function handleCheckout() {
  const nameEl = $('#checkoutRecipientName');
  if (nameEl && !nameEl.value.trim()) {
    showToast('Укажите имя получателя');
    nameEl.focus();
    return;
  }
  const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked')?.value || 'card';
  const sbpBank = $('#checkoutSbpBank')?.value || '';
  const phone = $('#checkoutPhone')?.value?.trim() || '';
  if (paymentMethod === 'sbp' && !sbpBank) {
    showToast('Выберите банк для оплаты через СБП');
    return;
  }
  if (paymentMethod === 'sbp' && !phone) {
    showToast('Для оплаты через СБП обязательно укажите номер телефона');
    $('#checkoutPhone')?.focus();
    return;
  }
  if (paymentMethod === 'card') {
    const cardNum = ($('#checkoutCardNumber')?.value || '').replace(/\s/g, '');
    const cardExp = $('#checkoutCardExpiry')?.value?.trim() || '';
    const cardCvv = $('#checkoutCardCvv')?.value?.trim() || '';
    const cardName = $('#checkoutCardName')?.value?.trim() || '';
    if (cardNum.length < 16) {
      showToast('Введите корректный номер карты');
      $('#checkoutCardNumber')?.focus();
      return;
    }
    if (!/^\d{2}\/\d{2}$/.test(cardExp)) {
      showToast('Введите срок действия в формате MM/YY');
      $('#checkoutCardExpiry')?.focus();
      return;
    }
    if (cardCvv.length < 3) {
      showToast('Введите CVV (3–4 цифры)');
      $('#checkoutCardCvv')?.focus();
      return;
    }
    if (!cardName) {
      showToast('Введите имя владельца карты');
      $('#checkoutCardName')?.focus();
      return;
    }
  }
  try {
    const body = {
      recipient_name: nameEl?.value?.trim() || '',
      recipient_phone: $('#checkoutPhone')?.value?.trim() || '',
      payment_method: paymentMethod,
      sbp_bank: paymentMethod === 'sbp' ? sbpBank : '',
    };
    await api('/api/orders', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    showToast('Заказ оформлен');
    state.waitingGiftUntil = Date.now() + 25000;
    startGiftMessagePolling();
    await renderCart();
    await loadAccount();
    setRoute('account');
  } catch (e) {
    showToast(e.message || 'Ошибка оформления заказа');
  }
}

async function loadAccount() {
  const profileBox = $('#accountProfileBox');
  const adminPanel = $('#adminPanel');
  const ordersList = $('#ordersList');
  if (!profileBox || !ordersList) return;

  if (!state.user) {
    setRoute('login');
    return;
  }

  profileBox.innerHTML = `
    <div class="flex items-center justify-between">
      <div>
        <p class="text-xs text-neutral-500">Вы вошли как</p>
        <p class="text-sm font-semibold text-neutral-900">${
          state.user.name || state.user.email
        }</p>
        <p class="text-[11px] text-neutral-500">${state.user.email}</p>
      </div>
      <button id="logoutBtn" class="secondary-btn text-[11px]">Выйти</button>
    </div>
    <div class="border-t border-neutral-200 pt-4 mt-4">
      <h3 class="text-sm font-semibold text-neutral-900 mb-2">Профиль</h3>
      <form id="profileForm" class="space-y-2 text-xs">
        <input required type="text" name="name" value="${
          state.user.name || ''
        }" placeholder="Имя" class="input w-full" />
        <button type="submit" class="primary-btn text-xs">Сохранить профиль</button>
      </form>
    </div>
  `;
  if (state.user.role === 'admin' && adminPanel) {
    adminPanel.classList.remove('hidden');
    if (state.genres.length) fillGenreSelects(state.genres);
    const adminIdEl = $('#adminGameId');
    if (adminIdEl) adminIdEl.value = '';
    state.adminEditGame = null;
  } else if (adminPanel) {
    adminPanel.classList.add('hidden');
  }

  try {
    const { orders } = await api('/api/orders/me');
    if (!orders.length) {
      ordersList.innerHTML =
        '<p class="text-xs text-neutral-500">У вас пока нет заказов.</p>';
    } else {
      ordersList.innerHTML = orders
        .map(
          (o) => `
          <div class="glass-card p-3 text-xs">
            <div class="flex items-center justify-between mb-1">
              <span class="font-semibold text-neutral-900">Заказ #${o.id}</span>
              <span class="pill pill-platform">${o.status}</span>
            </div>
            <p class="text-[11px] text-neutral-500 mb-1">Создан: ${
              o.created_at
            }</p>
            <p class="text-[11px] text-neutral-500">Позиций: ${
              o.items_count
            } · Сумма: ${formatPrice(o.total)}</p>
          </div>
        `
        )
        .join('');
    }
  } catch {
    ordersList.innerHTML =
      '<p class="text-xs text-neutral-500">Не удалось загрузить заказы.</p>';
  }

  attachAccountHandlers();
}

function attachAuthPageHandlers() {
  const loginForm = $('#loginForm');
  const registerForm = $('#registerForm');

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(loginForm);
      const payload = {
        email: formData.get('email'),
        password: formData.get('password'),
      };
      try {
        const { user } = await api('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        state.user = user;
        showToast('Вы успешно авторизовались');
        updateAuthUI();
        await syncLocalCartToServer();
        setRoute('account');
        await loadAccount();
      } catch (e) {
        showToast(e.message || 'Ошибка входа');
      }
    });
  }

  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(registerForm);
      const payload = {
        name: formData.get('name'),
        email: formData.get('email'),
        password: formData.get('password'),
      };
      if (!payload.password || payload.password.length < 6) {
        showToast('Пароль должен быть не короче 6 символов');
        return;
      }
      try {
        const { user } = await api('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        state.user = user;
        showToast('Аккаунт создан, вы авторизованы');
        updateAuthUI();
        await syncLocalCartToServer();
        setRoute('account');
        await loadAccount();
      } catch (e) {
        showToast(e.message || 'Ошибка регистрации');
      }
    });
  }
}

function attachAccountHandlers() {
  const logoutBtn = $('#logoutBtn');
  const profileForm = $('#profileForm');
  const adminGameForm = $('#adminGameForm');
  const adminResetForm = $('#adminResetForm');

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await api('/api/auth/logout', { method: 'POST' });
        stopGiftMessagePolling();
        stopLiveChatPolling();
        state.waitingGiftUntil = 0;
        state.user = null;
        state.serverCart = [];
        state.chatMessages = [];
        updateAuthUI();
        syncCartCount();
        setRoute('home');
        showToast('Вы вышли из аккаунта');
      } catch {
        showToast('Ошибка выхода');
      }
    });
  }

  if (profileForm) {
    profileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(profileForm);
      const payload = { name: formData.get('name') };
      try {
        const { user } = await api('/api/auth/profile', {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        state.user = user;
        updateAuthUI();
        showToast('Профиль обновлён');
      } catch {
        showToast('Ошибка обновления профиля');
      }
    });
  }

  if (adminGameForm) {
    adminGameForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(adminGameForm);
      const id = formData.get('id');
      const method = id ? 'PUT' : 'POST';
      const url = id
        ? `/api/admin/games/${encodeURIComponent(id)}`
        : '/api/admin/games';

      try {
        const res = await fetch(url, {
          method,
          credentials: 'include',
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Ошибка сохранения игры');
        }
        showToast(id ? 'Игра обновлена' : 'Игра добавлена');
        adminGameForm.reset();
        $('#adminGameId').value = '';
        await loadCatalog();
      } catch (e) {
        console.error(e);
        showToast(e.message || 'Ошибка администрирования');
      }
    });
  }

  if (adminResetForm && adminGameForm) {
    adminResetForm.addEventListener('click', () => {
      adminGameForm.reset();
      $('#adminGameId').value = '';
    });
  }

}

function attachGlobalHandlers() {
  const searchInput = $('#searchInput');
  const chatForm = $('#chatForm');
  const chatCallSpecialistBtn = $('#chatCallSpecialistBtn');
  const adminSupportReplyForm = $('#adminSupportReplyForm');
  const adminSupportResolveBtn = $('#adminSupportResolveBtn');
  const adminSupportUserSearch = $('#adminSupportUserSearch');
  const adminSupportUserSelect = $('#adminSupportUserSelect');
  if (chatForm) {
    chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      sendChatMessage();
    });
  }
  if (chatCallSpecialistBtn) {
    chatCallSpecialistBtn.addEventListener('click', () => {
      callSpecialistInThread();
    });
  }
  if (adminSupportReplyForm) {
    adminSupportReplyForm.addEventListener('submit', (e) => {
      e.preventDefault();
      sendAdminSupportMessage();
    });
  }
  if (adminSupportResolveBtn) {
    adminSupportResolveBtn.addEventListener('click', () => {
      resolveAdminSupportThread();
    });
  }
  if (adminSupportUserSearch) {
    adminSupportUserSearch.addEventListener('input', () => {
      state.adminSupportSearch = adminSupportUserSearch.value || '';
      renderAdminSupportThreads();
    });
  }
  if (adminSupportUserSelect) {
    adminSupportUserSelect.addEventListener('change', () => {
      state.adminSupportUserFilter = adminSupportUserSelect.value || '';
      renderAdminSupportThreads();
    });
  }
  if (searchInput) {
    let timeout;
    searchInput.addEventListener('input', () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        state.catalogFilters.search = searchInput.value.trim();
        state.catalogPage = 1;
        loadCatalog();
      }, 280);
    });
  }

  function closeAllCatalogFilters() {
    $all('.catalog-filter-panel').forEach((p) => p.classList.add('hidden'));
    $all('.catalog-filter-trigger').forEach((t) => t.classList.remove('open'));
  }

  $all('.catalog-filter-trigger').forEach((trigger) => {
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const panel = trigger.nextElementSibling;
      const isOpen = panel && !panel.classList.contains('hidden');
      closeAllCatalogFilters();
      if (!isOpen && panel) {
        panel.classList.remove('hidden');
        trigger.classList.add('open');
      }
    });
  });

  const genreSearchInput = $('#genreFilterSearch');
  if (genreSearchInput) {
    genreSearchInput.addEventListener('input', () => {
      const q = genreSearchInput.value.trim().toLowerCase();
      $all('#genreFilterList .catalog-filter-item').forEach((item) => {
        const name = (item.textContent || '').toLowerCase();
        item.classList.toggle('hidden', q && !name.includes(q));
      });
    });
  }

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.catalog-filter')) {
      closeAllCatalogFilters();
    }
  });

  const prevPage = $('#prevPage');
  const nextPage = $('#nextPage');
  if (prevPage) {
    prevPage.addEventListener('click', () => {
      if (state.catalogPage > 1) {
        state.catalogPage -= 1;
        loadCatalog();
      }
    });
  }
  if (nextPage) {
    nextPage.addEventListener('click', () => {
      state.catalogPage += 1;
      loadCatalog();
    });
  }

  const cartButton = $('#checkoutButton');
  if (cartButton) {
    cartButton.addEventListener('click', goToCheckout);
  }

  const checkoutConfirmBtn = $('#checkoutConfirmBtn');
  if (checkoutConfirmBtn) {
    checkoutConfirmBtn.addEventListener('click', handleCheckout);
  }

  document.addEventListener('change', (e) => {
    if (e.target.matches('input[name="paymentMethod"]')) {
      const isCard = e.target.value === 'card';
      const cardBox = $('#checkoutCardFormBox');
      const sbpBox = $('#checkoutSbpBankBox');
      const phoneLabel = $('#checkoutPhoneLabel');
      if (cardBox) cardBox.classList.toggle('hidden', !isCard);
      if (sbpBox) sbpBox.classList.toggle('hidden', isCard);
      if (phoneLabel) {
        phoneLabel.textContent = isCard ? 'Телефон (необязательно)' : 'Телефон (обязательно для СБП)';
      }
      if (isCard) {
        const hidden = $('#checkoutSbpBank');
        if (hidden) hidden.value = '';
        const searchInput = $('#checkoutSbpBankSearch');
        if (searchInput) searchInput.value = '';
        $all('.bank-list-item').forEach((item) => item.classList.remove('selected', 'hidden'));
        const selectedBox = $('#checkoutSbpBankSelected');
        if (selectedBox) selectedBox.classList.add('hidden');
      } else {
        updateCheckoutSbpBankDisplay();
      }
    }
  });

  const cardNumberInput = $('#checkoutCardNumber');
  if (cardNumberInput) {
    cardNumberInput.addEventListener('input', (e) => {
      let v = e.target.value.replace(/\D/g, '').slice(0, 16);
      e.target.value = v.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
    });
  }
  const cardExpiryInput = $('#checkoutCardExpiry');
  if (cardExpiryInput) {
    cardExpiryInput.addEventListener('input', (e) => {
      let v = e.target.value.replace(/\D/g, '');
      if (v.length >= 2) {
        v = v.slice(0, 2) + '/' + v.slice(2, 4);
      }
      e.target.value = v;
    });
  }
  const cardCvvInput = $('#checkoutCardCvv');
  if (cardCvvInput) {
    cardCvvInput.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
    });
  }

  const bankSearchInput = $('#checkoutSbpBankSearch');
  if (bankSearchInput) {
    bankSearchInput.addEventListener('input', () => {
      const q = bankSearchInput.value.trim().toLowerCase();
      $all('.bank-list-item').forEach((item) => {
        const name = (item.dataset.bank || '').toLowerCase();
        const searchTerms = (item.dataset.search || name).toLowerCase();
        const matches = !q || name.includes(q) || searchTerms.includes(q);
        item.classList.toggle('hidden', !matches);
      });
    });
  }

  const editModal = $('#editGameModal');
  const editForm = $('#editGameForm');
  const editModalClose = $('#editGameModalClose');
  const editModalCancel = $('#editGameModalCancel');
  if (editModal) {
    editModal.addEventListener('click', (e) => {
      if (e.target === editModal) closeEditGameModal();
    });
  }
  if (editModalClose) editModalClose.addEventListener('click', closeEditGameModal);
  if (editModalCancel) editModalCancel.addEventListener('click', closeEditGameModal);
  if (editForm) {
    editForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(editForm);
      const id = formData.get('id');
      if (!id) return;
      try {
        const res = await fetch(`/api/admin/games/${encodeURIComponent(id)}`, {
          method: 'PUT',
          credentials: 'include',
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Ошибка сохранения игры');
        showToast('Игра обновлена');
        closeEditGameModal();
        await loadCatalog();
      } catch (err) {
        console.error(err);
        showToast(err.message || 'Ошибка редактирования');
      }
    });
  }

  document.addEventListener('click', (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;

    const catalogFilterItem = target.closest('.catalog-filter-item');
    if (catalogFilterItem && !catalogFilterItem.classList.contains('hidden')) {
      e.preventDefault();
      const filter = catalogFilterItem.closest('.catalog-filter');
      if (filter) {
        const value = catalogFilterItem.dataset.value || '';
        const filterType = filter.dataset.filter;
        if (filterType === 'genre') state.catalogFilters.genreId = value;
        else if (filterType === 'platform') state.catalogFilters.platform = value;
        else if (filterType === 'sort') state.catalogFilters.sort = value;
        state.catalogPage = 1;
        $all('.catalog-filter-panel').forEach((p) => p.classList.add('hidden'));
        $all('.catalog-filter-trigger').forEach((t) => t.classList.remove('open'));
        updateCatalogFilterUI();
        loadCatalog();
      }
      return;
    }

    const bankItem = target.closest('.bank-list-item');
    if (bankItem && !bankItem.classList.contains('hidden')) {
      e.preventDefault();
      const bank = bankItem.dataset.bank;
      const hidden = $('#checkoutSbpBank');
      $all('.bank-list-item').forEach((item) => item.classList.toggle('selected', item === bankItem));
      if (hidden) hidden.value = bank || '';
      updateCheckoutSbpBankDisplay();
      return;
    }

    const routeBtn = target.closest('[data-route]');
    if (routeBtn) {
      const genreId = routeBtn.dataset.genreId;
      let route = routeBtn.dataset.route;
      if (genreId) {
        state.catalogFilters.genreId = genreId;
      }
      setRoute(route);
      return;
    }

    const viewBtn = target.closest('[data-action="view-game"]');
    if (viewBtn) {
      const id = Number(viewBtn.dataset.id);
      if (id) loadGame(id);
      return;
    }

    const addBtn = target.closest('[data-action="add-cart"]');
    if (addBtn) {
      const id = Number(addBtn.dataset.id);
      if (id) addToCart(id);
      return;
    }

    const adminEditBtn = target.closest('[data-action="admin-edit"]');
    if (adminEditBtn) {
      const id = Number(adminEditBtn.dataset.id);
      if (!state.user || state.user.role !== 'admin' || !id) return;
      api(`/api/games/${id}`)
        .then((game) => openEditGameModal(game))
        .catch(() => showToast('Не удалось загрузить игру для редактирования'));
      return;
    }

    const adminDeleteBtn = target.closest('[data-action="admin-delete"]');
    if (adminDeleteBtn) {
      const id = Number(adminDeleteBtn.dataset.id);
      if (!state.user || state.user.role !== 'admin' || !id) return;
      if (!confirm('Удалить эту игру из каталога?')) return;
      fetch(`/api/admin/games/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
        .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
        .then(({ ok, data }) => {
          if (!ok) {
            throw new Error(data.error || 'Ошибка удаления игры');
          }
          showToast('Игра удалена');
          loadCatalog();
        })
        .catch((err) => {
          console.error(err);
          showToast(err.message || 'Ошибка удаления игры');
        });
      return;
    }

    const qtyInput = target.closest('input[data-cart-qty]');
    if (qtyInput) {
      const gameId = Number(qtyInput.dataset.cartQty);
      const qty = Math.max(1, Number(qtyInput.value) || 1);
      if (!state.user) {
        const item = state.cartLocal.find((i) => i.gameId === gameId);
        if (item) {
          item.quantity = qty;
          setLocalCart([...state.cartLocal]);
          renderCart();
        }
      } else {
        api(`/api/cart/${gameId}`, {
          method: 'PUT',
          body: JSON.stringify({ quantity: qty }),
        })
          .then((data) => {
            state.serverCart = data.items;
            renderCart();
          })
          .catch(() => showToast('Ошибка изменения количества'));
      }
      return;
    }

    const removeBtn = target.closest('[data-cart-remove]');
    if (removeBtn) {
      const gameId = Number(removeBtn.dataset.cartRemove);
      if (!state.user) {
        setLocalCart(state.cartLocal.filter((i) => i.gameId !== gameId));
        renderCart();
      } else {
        api(`/api/cart/${gameId}`, { method: 'DELETE' })
          .then((data) => {
            state.serverCart = data.items;
            renderCart();
          })
          .catch(() => showToast('Ошибка удаления из корзины'));
      }
    }

    const copyChatCodeBtn = target.closest('[data-chat-copy]');
    if (copyChatCodeBtn) {
      const code = copyChatCodeBtn.dataset.chatCode || '';
      if (!code) return;
      navigator.clipboard
        .writeText(code)
        .then(() => showToast('Код скопирован'))
        .catch(() => showToast('Не удалось скопировать код'));
      return;
    }

    const threadBtn = target.closest('[data-chat-thread]');
    if (threadBtn) {
      const threadId = Number(threadBtn.dataset.chatThread);
      if (!threadId) return;
      state.chatSelectedThreadId = threadId;
      loadChatPage();
      return;
    }

    const faqBtn = target.closest('[data-chat-faq]');
    if (faqBtn) {
      const quickKey = faqBtn.dataset.chatFaq || '';
      const question = faqBtn.dataset.chatQuestion || '';
      if (!quickKey || !question) return;
      sendQuickFaqMessage(question, quickKey);
      return;
    }

    const adminThreadBtn = target.closest('[data-admin-thread]');
    if (adminThreadBtn) {
      const threadId = Number(adminThreadBtn.dataset.adminThread);
      if (!threadId) return;
      state.adminSupportSelectedThreadId = threadId;
      fetchAdminSupportMessages();
      renderAdminSupportThreads();
    }
  });
}

async function init() {
  const year = $('#year');
  if (year) year.textContent = new Date().getFullYear();
  attachGlobalHandlers();
  attachAuthPageHandlers();
  loadHome();
  await loadMe();
  const { route, id } = getRouteFromHash();
  if (route === 'game' && id) {
    await loadGame(id);
  } else {
    setRoute(route || 'home');
  }
}

document.addEventListener('DOMContentLoaded', () => init());

window.addEventListener('hashchange', () => {
  const { route, id } = getRouteFromHash();
  if (route === 'game' && id) {
    loadGame(id);
  } else {
    let r = route || 'home';
    if (r === 'account' && !state.user) r = 'login';
    if (r === 'chat' && !state.user) r = 'login';
    if (r === 'support' && (!state.user || state.user.role !== 'admin')) r = 'login';
    if (r === 'login' && state.user) r = 'account';
    if (r === 'checkout' && !state.user) r = 'login';
    applyRoute(r);
  }
});

