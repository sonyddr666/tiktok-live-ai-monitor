// TikTok Live Monitor - Frontend JS
let ws = null;
const giftRanking = {};
let statsGifts = 0, statsComments = 0, statsFollows = 0, statsLikes = 0;

// Dedup — janela de 5s por tipo+user+texto (evita duplicatas do batch TikTokLive)
const _seen = new Set();
function isDup(key) {
  if (_seen.has(key)) return true;
  _seen.add(key);
  if (_seen.size > 500) _seen.delete(_seen.values().next().value);
  return false;
}
function dupKey(type, user, extra) {
  const ts = Math.floor(Date.now() / 5000); // janela 5s
  return `${type}|${user}|${extra}|${ts}`;
}

// --- Web Audio ---
let audioCtx = null;
function getAC() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}
function playGiftSound() {
  try {
    const ctx = getAC();
    [0, 0.15].forEach(t => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = 880; o.type = 'sine';
      g.gain.setValueAtTime(0.35, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.22);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.22);
    });
  } catch(e) {}
}
function playFollowSound() {
  try {
    const ctx = getAC();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 660; o.type = 'sine';
    g.gain.setValueAtTime(0.22, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
    o.start(); o.stop(ctx.currentTime + 0.28);
  } catch(e) {}
}

// --- Euler meter ---
const EULER_MAX_PER_MIN = 30;
function updateEulerMeter(count) {
  const pct = Math.min(100, Math.round((count / EULER_MAX_PER_MIN) * 100));
  const bar = document.getElementById('euler-bar');
  const txt = document.getElementById('euler-count');
  if (!bar || !txt) return;
  bar.style.width = pct + '%';
  bar.style.background = pct > 80 ? '#f44336' : pct > 50 ? '#ff9800' : '#4caf50';
  txt.textContent = `${count}/min`;
}

// --- WebSocket ---
function connectLive() {
  const username = document.getElementById('username-input').value.trim();
  if (!username) return;
  getAC();
  const name = username.startsWith('@') ? username : '@' + username;
  setStatus('Conectando...');

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ action: 'connect', username: name }));
    return;
  }
  ws = new WebSocket(`ws://${location.host}/ws`);
  ws.onopen = () => ws.send(JSON.stringify({ action: 'connect', username: name }));
  ws.onmessage = e => handleEvent(JSON.parse(e.data));
  ws.onclose = () => setStatus('Desconectado');
  ws.onerror = () => setStatus('Erro WebSocket');
}

function handleEvent(data) {
  switch (data.type) {
    case 'status':      setStatus(data.message); break;
    case 'error':       setStatus('\u274c ' + data.message); break;
    case 'connect':     setStatus(`\u2705 Conectado em ${data.username}`); break;
    case 'disconnect':  setStatus('\u26a0\ufe0f Desconectado'); break;
    case 'live_end':    setStatus('\ud83d\udd34 Live encerrada'); break;
    case 'viewers':     document.getElementById('stat-viewers').textContent = fmtNum(data.count); break;
    case 'comment':     addComment(data); break;
    case 'gift':        addGift(data); break;
    case 'follow':      addFollow(data); break;
    case 'join':        addJoin(data); break;
    case 'share':       addEventFeed('compartilhou', data.nickname, data.user, '\ud83d\udd17'); break;
    case 'like':        addLike(data); break;
    case 'euler_stats': updateEulerMeter(data.count); break;
  }
}

function addComment(d) {
  const key = dupKey('comment', d.user, d.text);
  if (isDup(key)) return;
  statsComments++;
  document.getElementById('stat-comments').textContent = statsComments;
  const feed = document.getElementById('comment-feed');
  const el = document.createElement('div');
  el.className = 'comment-item';
  el.innerHTML = `
    <img src="${d.avatar||''}" onerror="this.style.display='none'" />
    <div><span class="uname">@${esc(d.user)}</span> <span class="text">${esc(d.text)}</span></div>`;
  feed.prepend(el);
  trim(feed, 120);
}

function addGift(d) {
  const key = dupKey('gift', d.user, d.gift_name + d.gift_count);
  if (isDup(key)) return;
  statsGifts++;
  document.getElementById('stat-gifts').textContent = statsGifts;
  playGiftSound();
  const feed = document.getElementById('gift-feed');
  const el = document.createElement('div');
  el.className = 'gift-item';
  el.innerHTML = `
    <img src="${d.avatar||''}" onerror="this.style.display='none'" />
    <div>
      <div><span class="gift-user">@${esc(d.user)}</span> enviou</div>
      <div><span class="gift-name">${esc(d.gift_name)}</span>${d.gift_count>1?` <span class="gift-count">x${d.gift_count}</span>`:''}</div>
    </div>`;
  feed.prepend(el);
  trim(feed, 60);
  if (!giftRanking[d.user]) giftRanking[d.user] = { nickname: d.nickname, avatar: d.avatar, count: 0 };
  giftRanking[d.user].count += d.gift_count || 1;
  renderRanking();
}

function addFollow(d) {
  const key = dupKey('follow', d.user, '');
  if (isDup(key)) return;
  statsFollows++;
  document.getElementById('stat-follows').textContent = statsFollows;
  playFollowSound();
  addEventFeed('seguiu', d.nickname, d.user, '\u2764\ufe0f');
}

function addJoin(d) {
  const key = dupKey('join', d.user, '');
  if (isDup(key)) return;
  addEventFeed('entrou', d.nickname, d.user, '\ud83d\udfe2');
}

function addLike(d) {
  const key = dupKey('like', d.user, '');
  if (isDup(key)) return;
  statsLikes++;
  const el = document.getElementById('stat-likes');
  if (el) el.textContent = fmtNum(statsLikes);
  addEventFeed('curtiu', d.nickname, d.user, '\ud83d\udc4d');
}

function addEventFeed(tipo, nickname, user, icon = '\u2022') {
  const feed = document.getElementById('event-feed');
  if (!feed) return;
  const el = document.createElement('div');
  el.className = 'event-item';
  el.innerHTML = `${icon} <span class="ev-user">@${esc(user)}</span> ${tipo}`;
  feed.prepend(el);
  trim(feed, 80);
}

function renderRanking() {
  const sorted = Object.entries(giftRanking).sort((a,b)=>b[1].count-a[1].count).slice(0,10);
  document.getElementById('ranking').innerHTML = sorted.map(([user,info],i) => {
    const p = i+1, m = p===1?'\ud83e\udd47':p===2?'\ud83e\udd48':p===3?'\ud83e\udd49':p;
    return `<div class="rank-item">
      <span class="rank-pos">${m}</span>
      <img src="${info.avatar||''}" onerror="this.style.display='none'" />
      <span class="rname">@${esc(user)}</span>
      <span class="rcount">${info.count} \ud83c\udf81</span>
    </div>`;
  }).join('');
}

function setStatus(msg) { document.getElementById('status-text').textContent = msg; }
function trim(el, max) { while (el.children.length > max) el.removeChild(el.lastChild); }
function fmtNum(n) {
  if (n>=1e6) return (n/1e6).toFixed(1)+'M';
  if (n>=1000) return (n/1000).toFixed(1)+'K';
  return n;
}
function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('username-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') connectLive();
  });
});
