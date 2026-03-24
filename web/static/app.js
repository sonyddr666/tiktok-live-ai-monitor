// TikTok Live Monitor — Frontend JS
let ws = null;
const giftRanking = {}; // { username: { nickname, avatar, count } }
let statsGifts = 0, statsComments = 0, statsFollows = 0;

function connectLive() {
  const username = document.getElementById('username-input').value.trim();
  if (!username) return;

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

  ws.onmessage = (e) => {
    const data = JSON.parse(e.data);
    handleEvent(data);
  };

  ws.onclose = () => setStatus('Desconectado — recarregue para reconectar');
  ws.onerror = () => setStatus('Erro no WebSocket');
}

function handleEvent(data) {
  switch (data.type) {
    case 'status': setStatus(data.message); break;
    case 'error': setStatus('❌ ' + data.message); break;
    case 'connect': setStatus(`✅ Conectado em ${data.username}`); break;
    case 'disconnect': setStatus('⚠️ Desconectado da live'); break;
    case 'live_end': setStatus('🔴 Live encerrada'); break;
    case 'viewers': document.getElementById('stat-viewers').textContent = fmtNum(data.count); break;
    case 'comment': addComment(data); break;
    case 'gift': addGift(data); break;
    case 'follow': statsFollows++; document.getElementById('stat-follows').textContent = statsFollows; break;
    case 'join': addEventFeed('entrou', data.nickname, data.user); break;
    case 'share': addEventFeed('compartilhou', data.nickname, data.user); break;
    case 'like': addEventFeed('curtiu', data.nickname, data.user); break;
  }
}

function addComment(d) {
  statsComments++;
  document.getElementById('stat-comments').textContent = statsComments;
  const feed = document.getElementById('comment-feed');
  const el = document.createElement('div');
  el.className = 'comment-item';
  el.innerHTML = `
    <img src="${d.avatar || 'https://placehold.co/28x28/222/555?text=?'}" onerror="this.src='https://placehold.co/28x28/222/555?text=?'" />
    <div>
      <span class="uname">@${d.user}</span>
      <span class="text"> ${escHtml(d.text)}</span>
    </div>
  `;
  feed.prepend(el);
  trimFeed(feed, 100);
}

function addGift(d) {
  statsGifts++;
  document.getElementById('stat-gifts').textContent = statsGifts;

  // Som
  try { document.getElementById('gift-sound').cloneNode().play(); } catch(e) {}

  // Feed de gifts
  const feed = document.getElementById('gift-feed');
  const el = document.createElement('div');
  el.className = 'gift-item';
  el.innerHTML = `
    <img src="${d.avatar || 'https://placehold.co/32x32/2a0a0f/fe2c55?text=🎁'}" onerror="this.src='https://placehold.co/32x32/2a0a0f/fe2c55?text=🎁'" />
    <div>
      <div><span class="gift-user">@${d.user}</span> enviou</div>
      <div><span class="gift-name">${escHtml(d.gift_name)}</span> <span class="gift-count">${d.gift_count > 1 ? 'x' + d.gift_count : ''}</span></div>
    </div>
  `;
  feed.prepend(el);
  trimFeed(feed, 50);

  // Ranking
  if (!giftRanking[d.user]) {
    giftRanking[d.user] = { nickname: d.nickname, avatar: d.avatar, count: 0 };
  }
  giftRanking[d.user].count += d.gift_count || 1;
  renderRanking();
}

function renderRanking() {
  const sorted = Object.entries(giftRanking)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10);
  const el = document.getElementById('ranking');
  el.innerHTML = sorted.map(([user, info], i) => {
    const pos = i + 1;
    const cls = pos === 1 ? 'top1' : pos === 2 ? 'top2' : pos === 3 ? 'top3' : '';
    return `<div class="rank-item">
      <span class="rank-pos ${cls}">${pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : pos}</span>
      <img src="${info.avatar || 'https://placehold.co/28x28/222/555?text=?'}" onerror="this.src='https://placehold.co/28x28/222/555?text=?'" />
      <span class="rname">@${user}</span>
      <span class="rcount">${info.count} 🎁</span>
    </div>`;
  }).join('');
}

function addEventFeed(tipo, nickname, user) {
  // eventos menores — opcionalmente pode adicionar um feed aqui
  // por ora só logamos no console
  console.log(`[${tipo}] ${nickname} (@${user})`);
}

function setStatus(msg) {
  document.getElementById('status-text').textContent = msg;
}

function trimFeed(el, max) {
  while (el.children.length > max) el.removeChild(el.lastChild);
}

function fmtNum(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n;
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// Enter para conectar
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('username-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') connectLive();
  });
});
