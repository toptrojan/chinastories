const { OWNER, GITHUB_CLIENT_ID, JSONBIN_KEY, JSONBIN_BIN_ID } = window.APP_CONFIG;

const API = `https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}`;
const HEADERS = {
  "Content-Type": "application/json",
  "X-Master-Key": JSONBIN_KEY
};

let db = { users: {}, chat: [], videos: [] };
let currentNick = null;
let isOwner = false;
let heartbeatTimer = null;
let refreshTimer = null;

const loginScreen = document.getElementById("login-screen");
const userScreen  = document.getElementById("user-screen");
const nickInput   = document.getElementById("nickname-input");
const loginError  = document.getElementById("login-error");
const loginButton = document.getElementById("login-button");

const ownerLoginBtn   = document.getElementById("owner-login-btn");
const ownerDeviceBox  = document.getElementById("owner-device-box");
const ownerDeviceCode = document.getElementById("owner-device-code");
const ownerDeviceStat = document.getElementById("owner-device-status");
const ownerBadge      = document.getElementById("owner-badge");
const adminTabBtn     = document.getElementById("admin-tab-btn");

async function loadDB() {
  try {
    const r = await fetch(`${API}/latest`, { headers: HEADERS });
    const j = await r.json();
    db = j.record || { users: {}, chat: [], videos: [] };
    db.users  = db.users  || {};
    db.chat   = db.chat   || [];
    db.videos = db.videos || [];
  } catch (e) { console.error("loadDB:", e); }
}

async function saveDB() {
  try {
    await fetch(API, { method: "PUT", headers: HEADERS, body: JSON.stringify(db) });
  } catch (e) { console.error("saveDB:", e); }
}

function isOnline(u) {
  if (!u || !u.online) return false;
  return Date.now() - (u.lastSeen || 0) < 60000;
}

function cleanOfflineUsers() {
  for (const nick of Object.keys(db.users)) {
    if (!isOnline(db.users[nick])) delete db.users[nick];
  }
}

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

  ownerLoginBtn.addEventListener("click", startOwnerLogin);

  window.addEventListener("beforeunload", () => {
    if (currentNick && db.users[currentNick]) db.users[currentNick].online = false;
  });
}

async function startOwnerLogin() {
  if (!GITHUB_CLIENT_ID || GITHUB_CLIENT_ID === "ВАШ_CLIENT_ID") {
    ownerDeviceStat.textContent = "Сначала укажите GITHUB_CLIENT_ID в config.js";
    ownerDeviceStat.style.color = "#ff5555";
    return;
  }

  ownerDeviceBox.classList.remove("hidden");
  ownerDeviceCode.textContent = "————";
  ownerDeviceStat.textContent = "Запрос кода...";
  ownerDeviceStat.style.color = "#9ee493";

  try {
    const r = await fetch("https://github.com/login/device/code", {
      method: "POST",
      headers: { "Accept": "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        scope: "read:user"
      })
    });
    const data = await r.json();

    if (!data.device_code) {
      ownerDeviceStat.textContent = "Ошибка: " + (data.error_description || "нет кода");
      ownerDeviceStat.style.color = "#ff5555";
      return;
    }

    ownerDeviceCode.textContent = data.user_code;
    ownerDeviceStat.textContent = "Ожидание подтверждения...";

    const interval = (data.interval || 5) * 1000;
    const expiresAt = Date.now() + (data.expires_in || 900) * 1000;

    const pollTimer = setInterval(async () => {
      if (Date.now() > expiresAt) {
        clearInterval(pollTimer);
        ownerDeviceStat.textContent = "Код истёк. Попробуйте снова.";
        ownerDeviceStat.style.color = "#ff5555";
        return;
      }
      try {
        const pr = await fetch("https://github.com/login/oauth/access_token", {
          method: "POST",
          headers: { "Accept": "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({
            client_id: GITHUB_CLIENT_ID,
            device_code: data.device_code,
            grant_type: "urn:ietf:params:oauth:grant-type:device_code"
          })
        });
        const pj = await pr.json();

        if (pj.access_token) {
          clearInterval(pollTimer);
          await checkOwnerToken(pj.access_token);
        } else if (pj.error === "authorization_pending") {
          // ждём дальше
        } else if (pj.error === "slow_down") {
          // продолжаем
        } else {
          clearInterval(pollTimer);
          ownerDeviceStat.textContent = "Ошибка: " + (pj.error_description || pj.error);
          ownerDeviceStat.style.color = "#ff5555";
        }
      } catch (e) {
        console.error("poll:", e);
      }
    }, interval);

  } catch (e) {
    ownerDeviceStat.textContent = "Ошибка сети: " + e.message;
    ownerDeviceStat.style.color = "#ff5555";
  }
}

async function checkOwnerToken(token) {
  try {
    const r = await fetch("https://api.github.com/user", {
      headers: { "Authorization": "Bearer " + token }
    });
    const user = await r.json();

    if ((user.login || "").toLowerCase() === OWNER.toLowerCase()) {
      isOwner = true;
      ownerDeviceStat.textContent = "✔ Вход выполнен: " + user.login;
      ownerDeviceStat.style.color = "#9ee493";
      ownerLoginBtn.textContent = "✔ Вы вошли как " + user.login;
      ownerLoginBtn.disabled = true;
    } else {
      ownerDeviceStat.textContent = "Этот аккаунт не является владельцем сайта";
      ownerDeviceStat.style.color = "#ff5555";
    }
  } catch (e) {
    ownerDeviceStat.textContent = "Ошибка проверки: " + e.message;
    ownerDeviceStat.style.color = "#ff5555";
  }
}

async function handleLogin() {
  const nick = nickInput.value;

  if ([...nick].length < 4) {
    nickInput.classList.add("invalid");
    loginError.textContent = "никнейм должен состоять минимум из 4 символов";
    return;
  }

  await loadDB();
  cleanOfflineUsers();

  if (db.users[nick] && isOnline(db.users[nick])) {
    nickInput.classList.add("invalid");
    loginError.textContent = "занято";
    return;
  }

  currentNick = nick;
  db.users[nick] = { online: true, lastSeen: Date.now(), isOwner };
  await saveDB();

  heartbeatTimer = setInterval(async () => {
    if (!currentNick) return;
    db.users[currentNick] = { online: true, lastSeen: Date.now(), isOwner };
    await saveDB();
  }, 20000);

  loginScreen.classList.add("hidden");
  userScreen.classList.remove("hidden");

  if (isOwner) {
    adminTabBtn.classList.remove("hidden");
    ownerBadge.classList.remove("hidden");
    ownerBadge.textContent = "👑 владелец";
  }

  initTabs();
  initWatchTab();
  if (isOwner) initAdminTab();
}

function initTabs() {
  const buttons = document.querySelectorAll(".tab-btn");
  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      buttons.forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
    });
  });
}

function initWatchTab() {
  const viewersEl    = document.getElementById("viewers-count");
  const videoEl      = document.getElementById("video-player");
  const nowPlaying   = document.getElementById("now-playing");
  const scheduleList = document.getElementById("schedule-list");
  const chatBox      = document.getElementById("chat-messages");
  const chatInput    = document.getElementById("chat-input");
  const chatSend     = document.getElementById("chat-send");

  let playedId = null;

  async function refresh() {
    await loadDB();
    cleanOfflineUsers();

    viewersEl.textContent = Object.values(db.users).filter(isOnline).length;
    renderSchedule(db.videos, scheduleList);

    const now = Date.now();
    const candidates = db.videos.filter(v => v.time <= now).sort((a,b) => b.time - a.time);
    if (candidates.length > 0) {
      const cur = candidates[0];
      if (cur.id !== playedId) {
        playedId = cur.id;
        videoEl.src = cur.url;
        videoEl.play().catch(()=>{});
        nowPlaying.textContent = `Сейчас: ${cur.title}`;
      }
    } else if (playedId !== null) {
      playedId = null;
      videoEl.removeAttribute("src");
      videoEl.load();
      nowPlaying.textContent = "Сейчас ничего не транслируется";
    }

    renderChat(chatBox, db.chat, false);
  }

  refresh();
  refreshTimer = setInterval(refresh, 5000);

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
    if (db.chat.length > 200) db.chat = db.chat.slice(-200);
    await saveDB();
    chatInput.value = "";
    renderChat(chatBox, db.chat, false);
  }
}

function initAdminTab() {
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
      statusEl.textContent = "Заполните название, время и ссылку";
      return;
    }

    await loadDB();
    db.videos.push({
      id: Date.now() + "_" + Math.random().toString(36).slice(2, 8),
      title, url,
      time: moscowToTimestamp(dt)
    });
    await saveDB();

    statusEl.style.color = "#9ee493";
    statusEl.textContent = "Видео добавлено!";
    titleInput.value = ""; dtInput.value = ""; urlInput.value = "";
    renderAdminList();
  });

  function renderAdminList() {
    listEl.innerHTML = "";
    const items = [...db.videos].sort((a, b) => a.time - b.time);
    if (items.length === 0) { listEl.innerHTML = "<li>Очередь пуста</li>"; return; }

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

  setInterval(async () => {
    await loadDB();
    renderAdminList();
    renderChat(adminChat, db.chat, true);
  }, 8000);
}

function renderChat(container, messages, withDelete) {
  container.innerHTML = "";
  [...messages].sort((a, b) => (a.time||0) - (b.time||0)).forEach(m => {
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

function renderSchedule(videos, container) {
  container.innerHTML = "";
  const items = [...videos].sort((a, b) => a.time - b.time);
  if (items.length === 0) { container.innerHTML = "<li>Расписание пусто</li>"; return; }
  items.forEach(v => {
    const li = document.createElement("li");
    li.textContent = `${formatMoscow(v.time)} — ${v.title}`;
    container.appendChild(li);
  });
}

function moscowToTimestamp(localStr) {
  const [datePart, timePart] = localStr.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm]  = timePart.split(":").map(Number);
  return Date.UTC(y, m - 1, d, hh - 3, mm);
}

function formatMoscow(ts) {
  const dt = new Date(ts + 3 * 3600 * 1000);
  const pad = n => String(n).padStart(2, "0");
  return `${pad(dt.getUTCDate())}.${pad(dt.getUTCMonth()+1)}.${dt.getUTCFullYear()} ${pad(dt.getUTCHours())}:${pad(dt.getUTCMinutes())} МСК`;
}

function formatTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const pad = n => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}
