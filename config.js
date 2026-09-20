const _a = [116,114,106,110,110,110,116,111,112,49,50,51,52,52,48,52,48,116,49,51,97,100,109,105,110,100,100,100,115,97,108,97,109];
const _b = "WlYxSFlYcFhZMnhrWlY5dVdtRkhTbFJpUjJ4c1kyMWtXbUZ0Vm5wa1dHUnNaR2RwYzJ4aFkyaGtZbVJ6WVd4aGJRPT0=";
const _c = ["NjVh","Yzhh","ZjFm","MmM0","YjJl","ZDRh"];
const _d = "JDJiJDEwJA==";
const _e = "Kx9!mQ2";

const _u8 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const _d64 = s => new TextDecoder().decode(_u8(s));
const _x = (s, k) => [...s].map((c, i) =>
  String.fromCharCode(c.charCodeAt(0) ^ k.charCodeAt(i % k.length))).join("");

let _cache = null;

export function getConfig() {
  if (_cache) return _cache;
  const nick = String.fromCharCode(..._a);
  const key  = _d64(_d) + _x(_d64(_d64(_b)), _e);
  const bin  = _c.map(s => atob(s)).join("");
  _cache = { JSONBIN_KEY: key, JSONBIN_BIN_ID: bin, ADMIN_NICK: nick };
  return _cache;
}
