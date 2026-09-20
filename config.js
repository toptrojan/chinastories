// config.js
// Никаких видимых ключей — только числа и мешанина символов

// === Ник админа (байты) ===
// "trjnnntop12344040t13admindddsalam"
const _0xa1 = [116,114,106,110,110,110,116,111,112,49,50,51,52,52,48,52,48,116,49,51,97,100,109,105,110,100,100,100,115,97,108,97,109];

// === Префикс ключа "$2a$10$" в base64 ===
const _0xa2 = "JDJhJDEwJA==";

// === Остаток ключа после префикса, XOR("Kx9!mQ2") + base64 дважды ===
// исходная часть: "m16rSI18.BeEGuPiI2Dqn.nRhGfcuVkPHh3Bl3GrkLsm6G38saHyS"
const _0xa3 = "V1ZWMVdIbFlXRTl1V1d4a1dWcFpXREJ1V1hSbldtRjVjMXBZUTJ4MldWaGtTR1p6WlZkbFlWWm9XRmx0V2toa1dFMXNWMWRvUzFOd1R6MD0=";

// === Bin ID "6aafacf1ffd5d160531bb4cb" разбит по 5 символов, каждый в base64 ===
const _0xa4 = ["NmFhZm","FjZjFm","ZmQ1ZD","E2MDUz","MWJiNG","NiYg=="];

// === XOR-ключ (закодирован) ===
const _0xa5 = [75,120,57,33,109,81,50]; // "Kx9!mQ2"

// ---------- ДЕКОДЕР ----------
const _u8 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const _d64 = s => new TextDecoder().decode(_u8(s));
const _xor = (s, k) => {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    out += String.fromCharCode(s.charCodeAt(i) ^ k.charCodeAt(i % k.length));
  }
  return out;
};

let _cache = null;

export function getConfig() {
  if (_cache) return _cache;

  const nick = String.fromCharCode(..._0xa1);
  const xorKey = String.fromCharCode(..._0xa5);

  // ключ: base64(prefix) + XOR(base64(base64(rest)))
  const prefix = _d64(_0xa2);
  const rest = _xor(_d64(_d64(_0xa3)), xorKey);
  const key = prefix + rest;

  // Bin ID: склеиваем base64-куски и декодируем каждый
  const bin = _0xa4.map(s => {
    // убираем возможные паддинги при склейке
    try { return atob(s); } catch { return atob(s.replace(/=+$/, "")); }
  }).join("");

  _cache = { JSONBIN_KEY: key, JSONBIN_BIN_ID: bin, ADMIN_NICK: nick };
  return _cache;
}
