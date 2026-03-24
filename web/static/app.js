// TikTok Live Monitor — Frontend JS
let ws = null;
const giftRanking = {};
let statsGifts = 0, statsComments = 0, statsFollows = 0, statsLikes = 0;

// ─── Web Audio API (sem precisar de gift.mp3) ───────────────────────────────
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playGiftSound() {
  try {
    const ctx = getAudioCtx();
    // Dois beeps curtos tipo "ding ding"
    [0, 0.15].forEach(offset => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.4, ctx.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.25);
      osc.start(ctx.currentTime + offset);
      osc.stop(ctx.currentTime + offset + 0.25);
    });
  } catch(e) {}
}

function playFollowSound() {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 660;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch(e) {}
}
// ────────────────────────────────────────────────────────────────────────────

function connectLive() {
  const username = document.getElementById('username-input').value.trim();
  if (!username) return;
  // Inicializa AudioContext na interação do usuário (requisito do browser)
  getAudioCtx();

  const name = username.startsWith('@') ? username : '@' + username;
  setStatus('Conectando ao servidor...');

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ action: 'connect', username: name }));
    return;
  }

  ws = new WebSocket(`ws://${location.host}/ws`);

  ws.onopen = () => {
    setStatus('WebSocket conectado');
    ws.send(JSON.stringify({ action: 'connect', username: name }));
  };

  ws.onmessage = (e) => handleEvent(JSON.parse(e.data));
  ws.onclose = () => setStatus('Desconectado — recarregue para reconectar');
  ws.onerror = () => setStatus('Erro no WebSocket');
}

function handleEvent(data) {
  switch (data.type) {
    case 'status':    setStatus(data.message); break;
    case 'error':     setStatus('❌ ' + data.message); break;
    case 'connect':   setStatus(`✅ Conectado em ${data.username}`); break;
    case 'disconnect':setStatus('⚠️ Desconectado da live'); break;
    case 'live_end':  setStatus('🔴 Live encerrada'); break;
    case 'viewers':   document.getElementById('stat-viewers').textContent = fmtNum(data.count); break;
    case 'comment':   addComment(data); break;
    case 'gift':      addGift(data); break;
    case 'follow':    addFollow(data); break;
    case 'join':      addEventFeed('entrou', data.nickname, data.user, '🟢'); break;
    case 'share':     addEventFeed('compartilhou', data.nickname, data.user, '🔗'); break;
    case 'like':      addLike(data); break;
  }
}

function addComment(d) {
  statsComments++;
  document.getElementById('stat-comments').textContent = statsComments;
  const feed = document.getElementById('comment-feed');
  const el = document.createElement('div');
  el.className = 'comment-item';
  el.innerHTML = `
    <img src="${d.avatar || ''}" onerror="this.style.display='none'" />
    <div>
      <span class="uname">@${escHtml(d.user)}</span>
      <span class="text"> ${escHtml(d.text)}</span>
    </div>`;
  feed.prepend(el);
  trimFeed(feed, 120);
}

function addGift(d) {
  statsGifts++;
  document.getElementById('stat-gifts').textContent = statsGifts;
  playGiftSound();

  const feed = document.getElementById('gift-feed');
  const el = document.createElement('div');
  el.className = 'gift-item';
  el.innerHTML = `
    <img src="${d.avatar || ''}" onerror="this.style.display='none'" />
    <div>
      <div><span class="gift-user">@${escHtml(d.user)}</span> enviou</div>
      <div>
        <span class="gift-name">${escHtml(d.gift_name)}</span>
        ${d.gift_count > 1 ? `<span class="gift-count"> x${d.gift_count}</span>` : ''}
      </div>
    </div>`;
  feed.prepend(el);
  trimFeed(feed, 60);

  if (!giftRanking[d.user]) giftRanking[d.user] = { nickname: d.nickname, avatar: d.avatar, count: 0 };
  giftRanking[d.user].count += d.gift_count || 1;
  renderRanking();
}

function addFollow(d) {
  statsFollows++;
  document.getElementById('stat-follows').textContent = statsFollows;
  playFollowSound();
  addEventFeed('seguiu', d.nickname, d.user, '❤️');
}

function addLike(d) {
  statsLikes++;
  // Atualiza contador de likes no stat-card de likes (se existir)
  const el = document.getElementById('stat-likes');
  if (el) el.textContent = fmtNum(statsLikes);
  addEventFeed('curtiu', d.nickname, d.user, '👍');
}

function addEventFeed(tipo, nickname, user, icon = '•') {
  const feed = document.getElementById('event-feed');
  if (!feed) return;
  const el = document.createElement('div');
  el.className = 'event-item';
  el.innerHTML = `<span class="event-icon">${icon}</span> <span class="ev-user">@${escHtml(user)}</span> ${tipo}`;
  feed.prepend(el);
  trimFeed(feed, 80);
}

function renderRanking() {
  const sorted = Object.entries(giftRanking)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10);
  const el = document.getElementById('ranking');
  el.innerHTML = sorted.map(([user, info], i) => {
    const pos = i + 1;
    const medal = pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : pos;
    return `<div class="rank-item">
      <span class="rank-pos">${medal}</span>
      <img src="${info.avatar || ''}" onerror="this.style.display='none'" />
      <span class="rname">@${escHtml(user)}</span>
      <span class="rcount">${info.count} 🎁</span>
    </div>`;
  }).join('');
}

function setStatus(msg) {
  document.getElementById('status-text').textContent = msg;
}

function trimFeed(el, max) {
  while (el.children.length > max) el.removeChild(el.lastChild);
}

function fmtNum(n) {
  if (n >= 1000000) return (n/1000000).toFixed(1)+'M';
  if (n >= 1000) return (n/1000).toFixed(1)+'K';
  return n;
}

function escHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('username-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') connectLive();
  });
});
