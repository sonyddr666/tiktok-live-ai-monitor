// TikTok Live Monitor - Frontend JS
let ws = null;
const giftRanking = {};
let giftCatalog = {};
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
    case 'share':       addEventFeed('compartilhou', data.nickname, data.user, '\ud83d\udd17', getProfile(data)); break;
    case 'like':        addLike(data); break;
    case 'euler_stats': updateEulerMeter(data.count); break;
    case 'euler_limits': updateEulerLimits(data.limits); break;
    case 'room_info':    updateRoomInfo(data.room); break;
    case 'gift_catalog': updateGiftCatalog(data.catalog); break;
  }
}

function getProfile(d) {
  return d.profile || {
    username: d.user || '',
    nickname: d.nickname || '',
    avatar: d.avatar || '',
    verified: false,
    followers: 0,
    following: 0,
    user_id: '',
    sec_uid: ''
  };
}

function displayName(profile) {
  return profile.nickname || profile.username || 'Sem nome';
}

function userHandle(profile) {
  return profile.username ? '@' + profile.username : '';
}

function profileTitle(profile) {
  const parts = [
    `nome=${displayName(profile)}`,
    `user=${profile.username || '-'}`,
    `id=${profile.user_id || '-'}`,
    `verificado=${profile.verified ? 'sim' : 'nao'}`,
    `seguidores=${profile.followers || 0}`,
    `seguindo=${profile.following || 0}`
  ];
  return parts.join(' | ');
}

function placeholderAvatar(name) {
  const letter = esc((displayName(name || {}).slice(0, 1) || '?').toUpperCase());
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='100%' height='100%' fill='#232323'/><text x='50%' y='54%' dominant-baseline='middle' text-anchor='middle' fill='#bbbbbb' font-family='Segoe UI, Arial, sans-serif' font-size='28'>${letter}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function escAttr(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function safeUrl(url, fallback = '') {
  const value = String(url || '').trim();
  if (!value) return fallback;
  if (
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    value.startsWith('data:image/')
  ) {
    return value;
  }
  return fallback;
}

function avatarMarkup(profile, cls = '') {
  const fallback = placeholderAvatar(profile);
  const safeSrc = safeUrl(profile && profile.avatar, fallback);
  const safeClass = escAttr(cls);
  const safeSrcAttr = escAttr(safeSrc);
  const fallbackAttr = escAttr(fallback);
  return `<img class="${safeClass}" src="${safeSrcAttr}" data-fallback="${fallbackAttr}" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src=this.dataset.fallback" alt="" />`;
}

function addComment(d) {
  const key = dupKey('comment', d.user, d.text);
  if (isDup(key)) return;
  const profile = getProfile(d);
  statsComments++;
  document.getElementById('stat-comments').textContent = statsComments;
  const feed = document.getElementById('comment-feed');
  const el = document.createElement('div');
  el.className = 'comment-item';
  el.title = profileTitle(profile);
  el.innerHTML = `
    ${avatarMarkup(profile)}
    <div class="comment-content">
      <div class="user-line">
        <span class="display-name">${esc(displayName(profile))}</span>
        ${profile.verified ? '<span class="verified">✓</span>' : ''}
        <span class="uname">${esc(userHandle(profile))}</span>
      </div>
      <div class="text">${esc(d.text)}</div>
    </div>`;
  feed.prepend(el);
  trim(feed, 120);
}

function addGift(d) {
  const key = dupKey('gift', d.user, d.gift_name + d.gift_count);
  if (isDup(key)) return;
  const profile = getProfile(d);
  const giftMeta = giftCatalog[d.gift_name] || {};
  statsGifts++;
  document.getElementById('stat-gifts').textContent = statsGifts;
  playGiftSound();
  const feed = document.getElementById('gift-feed');
  const el = document.createElement('div');
  el.className = 'gift-item';
  el.title = profileTitle(profile);
  el.innerHTML = `
    ${avatarMarkup(profile)}
    <div>
      <div>
        <span class="gift-user">${esc(displayName(profile))}</span>
        <span class="muted-user">${esc(userHandle(profile))}</span>
        ${profile.verified ? '<span class="verified">✓</span>' : ''}
      </div>
      <div>
        ${giftMeta.image ? `<img class="gift-icon" src="${giftMeta.image}" referrerpolicy="no-referrer" onerror="this.style.display='none'" />` : ''}
        <span class="gift-name">${esc(d.gift_name)}</span>
        ${giftMeta.diamond_count ? `<span class="gift-count">${giftMeta.diamond_count} 💎</span>` : ''}
        ${d.gift_count>1?` <span class="gift-count">x${d.gift_count}</span>`:''}
      </div>
    </div>`;
  feed.prepend(el);
  trim(feed, 60);
  if (!giftRanking[d.user]) giftRanking[d.user] = { nickname: d.nickname, avatar: d.avatar, count: 0, profile };
  giftRanking[d.user].count += d.gift_count || 1;
  giftRanking[d.user].profile = profile;
  renderRanking();
}

function addFollow(d) {
  const key = dupKey('follow', d.user, '');
  if (isDup(key)) return;
  const profile = getProfile(d);
  statsFollows++;
  document.getElementById('stat-follows').textContent = statsFollows;
  playFollowSound();
  addEventFeed('seguiu', d.nickname, d.user, '\u2764\ufe0f', profile);
}

function addJoin(d) {
  const key = dupKey('join', d.user, '');
  if (isDup(key)) return;
  addEventFeed('entrou', d.nickname, d.user, '\ud83d\udfe2', getProfile(d));
}

function addLike(d) {
  const key = dupKey('like', d.user, '');
  if (isDup(key)) return;
  const profile = getProfile(d);
  statsLikes++;
  const el = document.getElementById('stat-likes');
  if (el) el.textContent = fmtNum(statsLikes);
  addEventFeed('curtiu', d.nickname, d.user, '\ud83d\udc4d', profile);
}

function addEventFeed(tipo, nickname, user, icon = '\u2022') {
  const feed = document.getElementById('event-feed');
  if (!feed) return;
  const profile = arguments[4] || { username: user || '', nickname: nickname || '', verified: false, followers: 0, following: 0, user_id: '' };
  const el = document.createElement('div');
  el.className = 'event-item';
  el.title = profileTitle(profile);
  el.innerHTML = `${avatarMarkup(profile, 'event-avatar')} ${icon} <span class="ev-name">${esc(displayName(profile))}</span> <span class="ev-user">${esc(userHandle(profile))}</span> ${tipo}`;
  feed.prepend(el);
  trim(feed, 80);
}

function renderRanking() {
  const sorted = Object.entries(giftRanking).sort((a,b)=>b[1].count-a[1].count).slice(0,10);
  document.getElementById('ranking').innerHTML = sorted.map(([user,info],i) => {
    const p = i+1, m = p===1?'\ud83e\udd47':p===2?'\ud83e\udd48':p===3?'\ud83e\udd49':p;
    const profile = info.profile || { username: user || '', nickname: info.nickname || '', avatar: info.avatar || '', verified: false, followers: 0, following: 0, user_id: '' };
    return `<div class="rank-item">
      <span class="rank-pos">${m}</span>
      ${avatarMarkup(profile)}
      <span class="rname">${esc(displayName(profile))} <span class="muted-user">${esc(userHandle(profile))}</span></span>
      <span class="rcount">${info.count} \ud83c\udf81</span>
    </div>`;
  }).join('');
}

function updateGiftCatalog(catalog) {
  giftCatalog = {};
  const gifts = (catalog && catalog.gifts) || [];
  gifts.forEach(gift => {
    if (gift && gift.name) giftCatalog[gift.name] = gift;
  });
}

function updateEulerLimits(limits) {
  const minute = limits && limits.minute ? limits.minute : {};
  const hour = limits && limits.hour ? limits.hour : {};
  const day = limits && limits.day ? limits.day : {};
  document.getElementById('limit-minute-remaining').textContent = minute.remaining ?? '-';
  document.getElementById('limit-minute-max').textContent = `/ ${minute.max ?? '-'}`;
  document.getElementById('limit-hour-remaining').textContent = hour.remaining ?? '-';
  document.getElementById('limit-hour-max').textContent = `/ ${hour.max ?? '-'}`;
  document.getElementById('limit-day-remaining').textContent = day.remaining ?? '-';
  document.getElementById('limit-day-max').textContent = `/ ${day.max ?? '-'}`;
}

function updateRoomInfo(room) {
  const creator = room && room.creator ? room.creator : {};
  const title = (room && room.title) || 'Live sem titulo';
  const creatorLine = [
    displayName(creator),
    userHandle(creator),
    creator.verified ? 'verificado' : '',
    room && room.current_viewers ? `${fmtNum(room.current_viewers)} assistindo` : ''
  ].filter(Boolean).join(' • ');
  document.getElementById('live-title').textContent = title;
  document.getElementById('creator-meta').textContent = creatorLine || 'Sem dados da live';

  const avatar = document.getElementById('creator-avatar');
  avatar.src = safeUrl(creator.avatar, placeholderAvatar(creator));
  avatar.onerror = () => {
    avatar.onerror = null;
    avatar.src = placeholderAvatar(creator);
  };

  const cover = document.getElementById('live-cover');
  const coverUrl = safeUrl(room && room.cover, '');
  if (coverUrl) {
    cover.style.backgroundImage = `linear-gradient(180deg, rgba(0,0,0,0.12), rgba(0,0,0,0.55)), url("${coverUrl}")`;
  } else {
    cover.style.backgroundImage = 'linear-gradient(135deg, #1b1b1b, #090909)';
  }
}

function setStatus(msg) { document.getElementById('status-text').textContent = msg; }
function trim(el, max) { while (el.children.length > max) el.removeChild(el.lastChild); }
function fmtNum(n) {
  if (n>=1e6) return (n/1e6).toFixed(1)+'M';
  if (n>=1000) return (n/1000).toFixed(1)+'K';
  return n;
}
function esc(s) {
  return String(s||'')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('username-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') connectLive();
  });
});
