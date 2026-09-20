import { getConfig } from './config.js';
const { JSONBIN_KEY, JSONBIN_BIN_ID, ADMIN_NICK } = getConfig();

const API = `https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}`;
const HEADERS = {
  "Content-Type": "application/json",
  "X-Master-Key": JSONBIN_KEY
};

// ==================== РАБОТА С ХРАНИЛИЩЕМ ====================
let db = { users: {}, chat: [], videos: [] };

async function loadDB() {
  try {
    const r = await fetch(`${API}/latest`, { headers: HEADERS });
    const j = await r.json();
    db = j.record || { users: {}, chat: [], videos: [] };
    db.users = db.users || {};
    db.chat = db.chat || [];
    db.videos = db.videos || [];
  } catch (e) {
    console.error("loadDB error:", e);
  }
}

async function saveDB() {
  try {
    await fetch(API, {
      method: "PUT",
      headers: HEADERS,
      body: JSON.stringify(db)
    });
  } catch (e) {
    console.error("saveDB error:", e);
  }
}

// ==================== ЭЛЕМЕНТЫ ====================
const loginScreen = document.getElementById("login-screen");
const userScreen  = document.getElementById("user-screen");
const adminScreen = document.getElementById("admin-screen");
const nickInput   = document.getElementById("nickname-input");
const loginError  = document.getElementById("login-error");
const loginButton = document.getElementById("login-button");

let currentNick = null;
let isAdmin = false;
let heartbeatTimer = null;
let renderTimer = null;

// ==================== СТАРТ ====================
init();

async function init() {
  await loadDB();
  cleanOfflineUsers();
  await saveDB();
  loginButton.addEventListener("click", handleLogin);
  nickInput.addEventListener("keydown", e => { if (e.key === "Enter") handleLogin(); });
  nickInput.addEventListener("input", () => {
    nickInput.classList.remove("invalid");
    loginError.textContent = "";
  });
  // Следим за закрытием вкладки
  window.addEventListener("beforeunload", () => {
    if (currentNick) {
      markOffline(currentNick);
      // синхронный запрос через navigator.sendBeacon не поддерживает заголовки — 
      // поэтому просто помечаем "offline" на случай если PUT успеет
    }
  });
}

// ==================== УТИЛИТЫ ====================
function isOnline(u) {
  if (!u || !u.online) return false;
  // Считаем офлайн, если heartbeat был > 60 сек назад
  return Date.now() - (u.lastSeen || 0) < 60000;
}

function cleanOfflineUsers() {
  for (const nick of Object.keys(db.users)) {
    if (!isOnline(db.users[nick])) delete db.users[nick];
  }
}

function markOffline(nick) {
  if (db.users[nick]) {
    db.users[nick].online = false;
  }
}

// ==================== ВХОД ====================
async function handleLogin() {
  const nick = nickInput.value;

  if ([...nick].length < 4) {
    nickInput.classList.add("invalid");
    loginError.textContent = "никнейм должен состоять минимум из 4 символов";
    return;
  }

  // Свежие данные
  await loadDB();
  cleanOfflineUsers();

  if (db.users[nick] && isOnline(db.users[nick])) {
    nickInput.classList.add("invalid");
    loginError.textContent = "занято";
    return;
  }

  currentNick = nick;
  isAdmin = (nick === ADMIN_NICK);

  db.users[nick] = { online: true, lastSeen: Date.now() };
  await saveDB();

  // Heartbeat каждые 20 сек — отмечаем, что мы онлайн
  heartbeatTimer = setInterval(async () => {
    if (!currentNick) return;
    db.users[currentNick] = { online: true, lastSeen: Date.now() };
    await saveDB();
  }, 20000);

  loginScreen.classList.add("hidden");
  if (isAdmin) {
    adminScreen.classList.remove("hidden");
    initAdmin();
  } else {
    userScreen.classList.remove("hidden");
    initUser();
  }
}

// ==================== ЭКРАН ПОЛЬЗОВАТЕЛЯ ====================
function initUser() {
  const viewersEl    = document.getElementById("viewers-count");
  const videoEl      = document.getElementById("video-player");
  const nowPlaying   = document.getElementById("now-playing");
  const scheduleList = document.getElementById("schedule-list");
  const chatBox      = document.getElementById("chat-messages");
  const chatInput    = document.getElementById("chat-input");
  const chatSend     = document.getElementById("chat-send");

  let playedId = null;

  // Периодически обновляем всё
  renderTimer = setInterval(async () => {
    await loadDB();
    cleanOfflineUsers();

    // Зрители
    const count = Object.values(db.users).filter(isOnline).length;
    viewersEl.textContent = count;

    // Расписание
    renderSchedule(db.videos, scheduleList);

    // Проверка видео
    const now = Date.now();
    const candidates = db.videos
      .filter(v => v.time <= now)
      .sort((a, b) => b.time - a.time);

    if (candidates.length > 0) {
      const cur = candidates[0];
      if (cur.id !== playedId) {
        playedId = cur.id;
        videoEl.src = cur.url;
        videoEl.play().catch(() => {});
        nowPlaying.textContent = `Сейчас: ${cur.title}`;
      }
    } else if (playedId !== null) {
      playedId = null;
      videoEl.removeAttribute("src");
      videoEl.load();
      nowPlaying.textContent = "Сейчас ничего не транслируется";
    }

    // Чат
    renderChat(chatBox, db.chat, false);
  }, 5000);

  // Первый рендер сразу
  viewersEl.textContent = Object.values(db.users).filter(isOnline).length;
  renderSchedule(db.videos, scheduleList);
  renderChat(chatBox, db.chat, false);

  // Отправка сообщения
  chatSend.addEventListener("click", sendMessage);
  chatInput.addEventListener("keydown", e => { if (e.key === "Enter") sendMessage(); });

  async function sendMessage() {
    const text = chatInput.value.trim();
    if (!text) return;

    await loadDB();
    db.chat.push({
      id: Date.now() + "_" + Math.random().toString(36).slice(2, 8),
      author: currentNick,
      text,
      time: Date.now()
    });
    // Храним максимум 200 сообщений
    if (db.chat.length > 200) db.chat = db.chat.slice(-200);
    await saveDB();
    chatInput.value = "";
    renderChat(chatBox, db.chat, false);
  }
}

// ==================== АДМИН ====================
function initAdmin() {
  const titleInput = document.getElementById("video-title");
  const dtInput    = document.getElementById("video-datetime");
  const urlInput   = document.getElementById("video-url");
  const addBtn     = document.getElementById("add-video-btn");
  const statusEl   = document.getElementById("admin-status");
  const listEl     = document.getElementById("admin-video-list");
  const adminChat  = document.getElementById("admin-chat-messages");

  renderAdminList();
  renderChat(adminChat, db.chat, true);

  addBtn.addEventListener("click", async () => {
    const title = titleInput.value.trim();
    const dt    = dtInput.value;
    const url   = urlInput.value.trim();

    if (!title || !dt || !url) {
      statusEl.style.color = "#ff5555";
      statusEl.textContent = "Заполните название, время и ссылку на видео";
      return;
    }

    await loadDB();

    const timestamp = moscowToTimestamp(dt);
    db.videos.push({
      id: Date.now() + "_" + Math.random().toString(36).slice(2, 8),
      title,
      url,
      time: timestamp
    });
    await saveDB();

    statusEl.style.color = "#9ee493";
    statusEl.textContent = "Видео добавлено в очередь!";

    titleInput.value = "";
    dtInput.value = "";
    urlInput.value = "";

    renderAdminList();
  });

  function renderAdminList() {
    listEl.innerHTML = "";
    const items = [...db.videos].sort((a, b) => a.time - b.time);

    if (items.length === 0) {
      listEl.innerHTML = "<li>Очередь пуста</li>";
      return;
    }

    items.forEach(v => {
      const li = document.createElement("li");
      li.innerHTML = `<span><b>${escapeHtml(v.title)}</b> — ${formatMoscow(v.time)}</span>`;
      const del = document.createElement("button");
      del.textContent = "Удалить";
      del.className = "del-btn";
      del.addEventListener("click", async () => {
        if (!confirm("Удалить видео?")) return;
        await loadDB();
        db.videos = db.videos.filter(x => x.id !== v.id);
        await saveDB();
        renderAdminList();
      });
      li.appendChild(del);
      listEl.appendChild(li);
    });
  }

  // Авто-обновление списка и чата
  renderTimer = setInterval(async () => {
    await loadDB();
    renderAdminList();
    renderChat(adminChat, db.chat, true);
  }, 8000);
}

// ==================== РЕНДЕР ЧАТА ====================
function renderChat(container, messages, withDelete) {
  container.innerHTML = "";
  [...messages]
    .sort((a, b) => (a.time || 0) - (b.time || 0))
    .forEach(m => {
      const div = document.createElement("div");
      div.className = "msg";
      div.innerHTML = `
        <span class="author">${escapeHtml(m.author)}:</span>
        ${escapeHtml(m.text)}
        <span class="time">${formatTime(m.time)}</span>
      `;
      if (withDelete) {
        const btn = document.createElement("button");
        btn.textContent = "Удалить";
        btn.style.cssText = "margin-left:8px;background:#8a1a1f;color:#fff;border:none;padding:3px 8px;border-radius:4px;cursor:pointer;font-size:11px;";
        btn.addEventListener("click", async () => {
          await loadDB();
          db.chat = db.chat.filter(x => x.id !== m.id);
          await saveDB();
          renderChat(container, db.chat, true);
        });
        div.appendChild(btn);
      }
      container.appendChild(div);
    });
  container.scrollTop = container.scrollHeight;
}

// ==================== РАСПИСАНИЕ ====================
function renderSchedule(videos, container) {
  container.innerHTML = "";
  const items = [...videos].sort((a, b) => a.time - b.time);

  if (items.length === 0) {
    container.innerHTML = "<li>Расписание пусто</li>";
    return;
  }

  items.forEach(v => {
    const li = document.createElement("li");
    li.textContent = `${formatMoscow(v.time)} — ${v.title}`;
    container.appendChild(li);
  });
}

// ==================== ВРЕМЯ / МСК ====================
function moscowToTimestamp(localStr) {
  // localStr: "2025-01-15T20:30"
  const [datePart, timePart] = localStr.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm]  = timePart.split(":").map(Number);
  // МСК = UTC+3
  return Date.UTC(y, m - 1, d, hh - 3, mm);
}

function formatMoscow(ts) {
  const dt = new Date(ts + 3 * 3600 * 1000);
  const pad = n => String(n).padStart(2, "0");
  return `${pad(dt.getUTCDate())}.${pad(dt.getUTCMonth() + 1)}.${dt.getUTCFullYear()} ${pad(dt.getUTCHours())}:${pad(dt.getUTCMinutes())} МСК`;
}

function formatTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const pad = n => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
