const CFG = window.APP_CONFIG || {};
const OWNER = CFG.OWNER || "";
const GITHUB_CLIENT_ID = CFG.GITHUB_CLIENT_ID || "";
const JSONBIN_KEY = CFG.JSONBIN_KEY || "";
const JSONBIN_BIN_ID = CFG.JSONBIN_BIN_ID || "";

const API = "https://api.jsonbin.io/v3/b/" + JSONBIN_BIN_ID;
const HEADERS = {
  "Content-Type": "application/json",
  "X-Master-Key": JSONBIN_KEY
};

var db = { users: {}, chat: [], videos: [] };
var currentNick = null;
var isOwner = false;
var heartbeatTimer = null;
var refreshTimer = null;

function $(id) { return document.getElementById(id); }

function isOnline(u) {
  if (!u || !u.online) return false;
  return Date.now() - (u.lastSeen || 0) < 60000;
}

function cleanOfflineUsers() {
  for (var nick in db.users) {
    if (!isOnline(db.users[nick])) delete db.users[nick];
  }
}

function loadDB() {
  return fetch(API + "/latest", { headers: HEADERS })
    .then(function(r) { return r.json(); })
    .then(function(j) {
      db = j.record || { users: {}, chat: [], videos: [] };
      db.users = db.users || {};
      db.chat = db.chat || [];
      db.videos = db.videos || [];
    })
    .catch(function(e) { console.error("loadDB:", e); });
}

function saveDB() {
  return fetch(API, {
    method: "PUT",
    headers: HEADERS,
    body: JSON.stringify(db)
  }).catch(function(e) { console.error("saveDB:", e); });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatTime(ts) {
  if (!ts) return "";
  var d = new Date(ts);
  var pad = function(n) { return String(n).padStart(2, "0"); };
  return pad(d.getHours()) + ":" + pad(d.getMinutes());
}

function formatMoscow(ts) {
  var dt = new Date(ts + 3 * 3600 * 1000);
  var pad = function(n) { return String(n).padStart(2, "0"); };
  return pad(dt.getUTCDate()) + "." + pad(dt.getUTCMonth() + 1) + "." + dt.getUTCFullYear() +
    " " + pad(dt.getUTCHours()) + ":" + pad(dt.getUTCMinutes()) + " МСК";
}

function moscowToTimestamp(localStr) {
  var parts = localStr.split("T");
  var dp = parts[0].split("-");
  var tp = parts[1].split(":");
  return Date.UTC(+dp[0], +dp[1] - 1, +dp[2], +tp[0] - 3, +tp[1]);
}

function showError(msg) {
  var el = $("login-error");
  var inp = $("nickname-input");
  if (el) el.textContent = msg;
  if (inp) inp.classList.add("invalid");
}

function clearError() {
  var el = $("login-error");
  var inp = $("nickname-input");
  if (el) el.textContent = "";
  if (inp) inp.classList.remove("invalid");
}

function handleLogin() {
  var nick = ($("nickname-input").value || "").trim();

  if (nick.length < 4) {
    showError("никнейм должен состоять минимум из 4 символов");
    return;
  }

  loadDB().then(function() {
    cleanOfflineUsers();

    if (db.users[nick] && isOnline(db.users[nick])) {
      showError("занято");
      return;
    }

    currentNick = nick;
    db.users[nick] = { online: true, lastSeen: Date.now(), isOwner: isOwner };
    return saveDB().then(function() {
      heartbeatTimer = setInterval(function() {
        if (!currentNick) return;
        db.users[currentNick] = { online: true, lastSeen: Date.now(), isOwner: isOwner };
        saveDB();
      }, 20000);

      $("login-screen").classList.add("hidden");
      $("user-screen").classList.remove("hidden");

      if (isOwner) {
        $("admin-tab-btn").classList.remove("hidden");
        $("owner-badge").classList.remove("hidden");
      }

      initTabs();
      initWatchTab();
      if (isOwner) initAdminTab();
    });
  }).catch(function(e) {
    console.error("handleLogin:", e);
    showError("ошибка соединения: " + e.message);
  });
}

function initTabs() {
  var buttons = document.querySelectorAll(".tab-btn");
  for (var i = 0; i < buttons.length; i++) {
    buttons[i].addEventListener("click", function() {
      for (var j = 0; j < buttons.length; j++) buttons[j].classList.remove("active");
      var all = document.querySelectorAll(".tab-content");
      for (var k = 0; k < all.length; k++) all[k].classList.remove("active");
      this.classList.add("active");
      var target = $("tab-" + this.getAttribute("data-tab"));
      if (target) target.classList.add("active");
    });
  }
}

function initWatchTab() {
  var viewersEl = $("viewers-count");
  var videoEl = $("video-player");
  var nowPlaying = $("now-playing");
  var scheduleList = $("schedule-list");
  var chatBox = $("chat-messages");
  var chatInput = $("chat-input");
  var chatSend = $("chat-send");

  var playedId = null;

  function refresh() {
    loadDB().then(function() {
      cleanOfflineUsers();

      var count = 0;
      for (var n in db.users) if (isOnline(db.users[n])) count++;
      viewersEl.textContent = count;

      renderSchedule(db.videos, scheduleList);

      var now = Date.now();
      var candidates = db.videos.filter(function(v) { return v.time <= now; });
      candidates.sort(function(a, b) { return b.time - a.time; });

      if (candidates.length > 0) {
        var cur = candidates[0];
        if (cur.id !== playedId) {
          playedId = cur.id;
          videoEl.src = cur.url;
          var p = videoEl.play();
          if (p && p.catch) p.catch(function() {});
          nowPlaying.textContent = "Сейчас: " + cur.title;
        }
      } else if (playedId !== null) {
        playedId = null;
        videoEl.removeAttribute("src");
        videoEl.load();
        nowPlaying.textContent = "Сейчас ничего не транслируется";
      }

      renderChat(chatBox, db.chat, false);
    });
  }

  function sendMessage() {
    var text = (chatInput.value || "").trim();
    if (!text) return;
    loadDB().then(function() {
      db.chat.push({
        id: Date.now() + "_" + Math.random().toString(36).slice(2, 8),
        author: currentNick,
        text: text,
        time: Date.now()
      });
      if (db.chat.length > 200) db.chat = db.chat.slice(-200);
      return saveDB();
    }).then(function() {
      chatInput.value = "";
      renderChat(chatBox, db.chat, false);
    });
  }

  refresh();
  refreshTimer = setInterval(refresh, 5000);

  chatSend.addEventListener("click", sendMessage);
  chatInput.addEventListener("keydown", function(e) {
    if (e.key === "Enter") sendMessage();
  });
}

function initAdminTab() {
  var titleInput = $("video-title");
  var dtInput = $("video-datetime");
  var urlInput = $("video-url");
  var addBtn = $("add-video-btn");
  var statusEl = $("admin-status");
  var listEl = $("admin-video-list");
  var adminChat = $("admin-chat-messages");

  function renderAdminList() {
    listEl.innerHTML = "";
    var items = db.videos.slice().sort(function(a, b) { return a.time - b.time; });
    if (items.length === 0) {
      listEl.innerHTML = "<li>Очередь пуста</li>";
      return;
    }
    items.forEach(function(v) {
      var li = document.createElement("li");
      var span = document.createElement("span");
      span.innerHTML = "<b>" + escapeHtml(v.title) + "</b> — " + formatMoscow(v.time);
      var del = document.createElement("button");
      del.type = "button";
      del.textContent = "Удалить";
      del.className = "del-btn";
      del.addEventListener("click", function() {
        if (!confirm("Удалить видео?")) return;
        loadDB().then(function() {
          db.videos = db.videos.filter(function(x) { return x.id !== v.id; });
          return saveDB();
        }).then(renderAdminList);
      });
      li.appendChild(span);
      li.appendChild(del);
      listEl.appendChild(li);
    });
  }

  renderAdminList();
  renderChat(adminChat, db.chat, true);

  addBtn.addEventListener("click", function() {
    var title = (titleInput.value || "").trim();
    var dt = dtInput.value;
    var url = (urlInput.value || "").trim();

    if (!title || !dt || !url) {
      statusEl.style.color = "#ff5555";
      statusEl.textContent = "Заполните название, время и ссылку";
      return;
    }

    loadDB().then(function() {
      db.videos.push({
        id: Date.now() + "_" + Math.random().toString(36).slice(2, 8),
        title: title,
        url: url,
        time: moscowToTimestamp(dt)
      });
      return saveDB();
    }).then(function() {
      statusEl.style.color = "#9ee493";
      statusEl.textContent = "Видео добавлено!";
      titleInput.value = "";
      dtInput.value = "";
      urlInput.value = "";
      renderAdminList();
    });
  });

  setInterval(function() {
    loadDB().then(function() {
      renderAdminList();
      renderChat(adminChat, db.chat, true);
    });
  }, 8000);
}

function renderChat(container, messages, withDelete) {
  if (!container) return;
  container.innerHTML = "";
  var sorted = messages.slice().sort(function(a, b) {
    return (a.time || 0) - (b.time || 0);
  });
  sorted.forEach(function(m) {
    var div = document.createElement("div");
    div.className = "msg";
    div.innerHTML =
      '<span class="author">' + escapeHtml(m.author) + ':</span> ' +
      escapeHtml(m.text) +
      ' <span class="time">' + formatTime(m.time) + '</span>';
    if (withDelete) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = "Удалить";
      btn.style.cssText = "margin-left:8px;background:#8a1a1f;color:#fff;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:11px;";
      btn.addEventListener("click", function() {
        loadDB().then(function() {
          db.chat = db.chat.filter(function(x) { return x.id !== m.id; });
          return saveDB();
        }).then(function() {
          renderChat(container, db.chat, true);
        });
      });
      div.appendChild(btn);
    }
    container.appendChild(div);
  });
  container.scrollTop = container.scrollHeight;
}

function renderSchedule(videos, container) {
  if (!container) return;
  container.innerHTML = "";
  var items = videos.slice().sort(function(a, b) { return a.time - b.time; });
  if (items.length === 0) {
    container.innerHTML = "<li>Расписание пусто</li>";
    return;
  }
  items.forEach(function(v) {
    var li = document.createElement("li");
    li.textContent = formatMoscow(v.time) + " — " + v.title;
    container.appendChild(li);
  });
}

function startOwnerLogin() {
  if (!GITHUB_CLIENT_ID) {
    $("owner-device-box").classList.remove("hidden");
    $("owner-device-status").textContent = "GITHUB_CLIENT_ID не задан в config.js";
    $("owner-device-status").style.color = "#ff5555";
    return;
  }

  $("owner-device-box").classList.remove("hidden");
  $("owner-device-code").textContent = "————";
  $("owner-device-status").textContent = "Запрос кода...";
  $("owner-device-status").style.color = "#9ee493";

  fetch("https://github.com/login/device/code", {
    method: "POST",
    headers: { "Accept": "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: GITHUB_CLIENT_ID, scope: "read:user" })
  })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    if (!data.device_code) {
      $("owner-device-status").textContent = "Ошибка: " + (data.error_description || "нет кода");
      $("owner-device-status").style.color = "#ff5555";
      return;
    }

    $("owner-device-code").textContent = data.user_code;
    $("owner-device-status").textContent = "Ожидание подтверждения...";

    var interval = (data.interval || 5) * 1000;
    var expiresAt = Date.now() + (data.expires_in || 900) * 1000;

    var pollTimer = setInterval(function() {
      if (Date.now() > expiresAt) {
        clearInterval(pollTimer);
        $("owner-device-status").textContent = "Код истёк. Попробуйте снова.";
        $("owner-device-status").style.color = "#ff5555";
        return;
      }
      fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { "Accept": "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: GITHUB_CLIENT_ID,
          device_code: data.device_code,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code"
        })
      })
      .then(function(r) { return r.json(); })
      .then(function(pj) {
        if (pj.access_token) {
          clearInterval(pollTimer);
          verifyOwnerToken(pj.access_token);
        } else if (pj.error === "authorization_pending" || pj.error === "slow_down") {
          // продолжаем опрос
        } else {
          clearInterval(pollTimer);
          $("owner-device-status").textContent = "Ошибка: " + (pj.error_description || pj.error);
          $("owner-device-status").style.color = "#ff5555";
        }
      })
      .catch(function(e) { console.error("poll:", e); });
    }, interval);
  })
  .catch(function(e) {
    $("owner-device-status").textContent = "Ошибка сети: " + e.message;
    $("owner-device-status").style.color = "#ff5555";
  });
}

function verifyOwnerToken(token) {
  fetch("https://api.github.com/user", {
    headers: { "Authorization": "Bearer " + token }
  })
  .then(function(r) { return r.json(); })
  .then(function(user) {
    var login = (user.login || "").toLowerCase();
    if (login === OWNER.toLowerCase()) {
      isOwner = true;
      $("owner-device-status").textContent = "✔ Вход выполнен: " + user.login;
      $("owner-device-status").style.color = "#9ee493";
      $("owner-login-btn").textContent = "✔ Вы вошли как " + user.login;
      $("owner-login-btn").disabled = true;
    } else {
      $("owner-device-status").textContent = "Этот аккаунт не является владельцем сайта";
      $("owner-device-status").style.color = "#ff5555";
    }
  })
  .catch(function(e) {
    $("owner-device-status").textContent = "Ошибка проверки: " + e.message;
    $("owner-device-status").style.color = "#ff5555";
  });
}

function bindEvents() {
  var loginButton = $("login-button");
  var nickInput = $("nickname-input");
  var ownerLoginBtn = $("owner-login-btn");

  if (loginButton) loginButton.addEventListener("click", handleLogin);
  if (nickInput) {
    nickInput.addEventListener("keydown", function(e) {
      if (e.key === "Enter") handleLogin();
    });
    nickInput.addEventListener("input", clearError);
  }
  if (ownerLoginBtn) ownerLoginBtn.addEventListener("click", startOwnerLogin);

  window.addEventListener("beforeunload", function() {
    if (currentNick && db.users[currentNick]) {
      db.users[currentNick].online = false;
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bindEvents);
} else {
  bindEvents();
}
