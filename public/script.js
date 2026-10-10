const socket = io();
let myName = '';
let roomCode = '';
let isHost = false;
let myHand = [];
let myCoins = 0;
let hasSeen = false;
let currentTurn = '';

function showPage(id) {
  ['landing','hostLoginBox','waiting','game','hostPanel'].forEach(x => {
    const el = document.getElementById(x);
    if (el) el.style.display = 'none';
  });
  const el = document.getElementById(id);
  if (el) el.style.display = 'block';
}

function backToLanding() { showPage('landing'); }
function showHostLogin() { showPage('hostLoginBox'); }

// ===== होस्ट लगइन =====
function hostLogin() {
  const pass = document.getElementById('hostPassword').value;
  if (!pass) {
    document.getElementById('hostLoginMsg').textContent = 'पासवर्ड लेख्नुहोस्';
    return;
  }
  socket.emit('hostLogin', { password: pass }, (res) => {
    if (res.success) {
      document.getElementById('hostLoginMsg').textContent = '';
      createRoom();
    } else {
      document.getElementById('hostLoginMsg').textContent = res.message;
    }
  });
}

// ===== रुम बनाउने =====
function createRoom() {
  myName = document.getElementById('playerName').value.trim();
  if (!myName) {
    document.getElementById('hostLoginMsg').textContent = 'पहिले नाम लेख्नुहोस्';
    showPage('landing');
    return;
  }
  socket.emit('createRoom', { hostName: myName }, (res) => {
    if (res.success) {
      roomCode = res.code;
      isHost = true;
      document.getElementById('roomCodeDisplay').textContent = roomCode;
      document.getElementById('startBtn').style.display = 'block';
      showPage('waiting');
    }
  });
}

// ===== खेलाडी जोडिने रिक्वेस्ट =====
function requestJoin() {
  myName = document.getElementById('playerName').value.trim();
  const code = document.getElementById('joinCode').value.trim().toUpperCase();
  if (!myName) return alert('नाम लेख्नुहोस्');
  if (!code) return alert('रुम कोड लेख्नुहोस्');

  socket.emit('requestJoin', { code, playerName: myName }, (res) => {
    document.getElementById('landingMsg').textContent = res.message;
  });
}

// ===== दर्शक (लिंकबाट, कोड बिना) =====
function viewGame() {
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('room');

  if (!code) {
    alert('यो लिंकबाट मात्र हेर्न सकिन्छ');
    return;
  }

  roomCode = code.toUpperCase();
  isHost = false;
  myName = document.getElementById('playerName').value.trim() || 'दर्शक';

  socket.emit('viewAsSpectator', { code: roomCode, viewerName: myName }, (res) => {
    if (res.success) {
      showPage('game');
      document.getElementById('gameMsg').textContent = '👀 तपाईं दर्शक हुनुहुन्छ';
      document.getElementById('actionButtons').style.display = 'none';
    } else {
      alert(res.message);
    }
  });
}

// ===== इभेन्टहरू =====
socket.on('joinAccepted', ({ code }) => {
  roomCode = code;
  isHost = false;
  showPage('game');
  document.getElementById('actionButtons').style.display = 'grid';
  document.getElementById('gameMsg').textContent = '✅ तपाईंलाई स्वीकार गरियो!';
});

socket.on('joinRejected', ({ message }) => {
  document.getElementById('landingMsg').textContent = message;
});

socket.on('spectatorJoined', ({ name }) => {
  console.log(`${name} दर्शक बन्यो`);
});

socket.on('requestHandled', ({ name, accepted }) => {
  const msg = accepted ? `✅ ${name} स्वीकार` : `❌ ${name} अस्वीकार`;
  document.getElementById('waitMsg').textContent = msg;
});

socket.on('playerList', (list) => {
  const countEl = document.getElementById('playerCount');
  if (countEl) countEl.textContent = list.length;

  const listEl = document.getElementById('playerList');
  if (listEl) {
    listEl.innerHTML = list.map(p =>
      `<li>👤 ${p.name}${p.isHost ? ' (होस्ट)' : ''} — 🪙 ${p.coins || 0}</li>`
    ).join('');
  }

  const allDiv = document.getElementById('allPlayers');
  if (allDiv) {
    allDiv.innerHTML = list.map(p =>
      `<div class="player-row">
        <span>👤 ${p.name}${p.isHost ? ' (होस्ट)' : ''}</span>
        <span class="coins">🪙 ${p.coins || 0}</span>
      </div>`
    ).join('');
  }

  const hostDiv = document.getElementById('hostPlayers');
  if (hostDiv) {
    hostDiv.innerHTML = list.map(p =>
      `<div class="player-row">
        <span>👤 ${p.name}</span>
        <span class="coins">🪙 ${p.coins || 0}</span>
        <button onclick="giveCoins('${p.name}')" style="width:auto;padding:4px 10px;font-size:0.8rem;margin:0">+१००</button>
      </div>`
    ).join('');
  }
});

socket.on('joinRequest', (req) => {
  const div = document.getElementById('pendingRequests');
  if (!div) return;
  const row = document.createElement('div');
  row.className = 'request-row';
  row.id = 'req-' + req.id;
  row.innerHTML = `
    <span>👤 ${req.name}</span>
    <button class="btn-accept" onclick="acceptPlayer('${req.id}')">✅</button>
    <button class="btn-reject" onclick="rejectPlayer('${req.id}')">❌</button>
  `;
  div.appendChild(row);
});

function acceptPlayer(playerId) {
  socket.emit('acceptPlayer', { code: roomCode, playerId });
  const el = document.getElementById('req-' + playerId);
  if (el) el.remove();
}

function rejectPlayer(playerId) {
  socket.emit('rejectPlayer', { code: roomCode, playerId });
  const el = document.getElementById('req-' + playerId);
  if (el) el.remove();
}

function giveCoins(playerName) {
  const amount = prompt(`${playerName} लाई कति कोइन दिनुहुन्छ?`, '100');
  if (amount && !isNaN(amount)) {
    socket.emit('giveCoins', { code: roomCode, playerName, amount: parseInt(amount) });
  }
}

socket.on('coinGiven', ({ name, amount }) => {
  document.getElementById('waitMsg').textContent = `🪙 ${name} लाई ${amount} कोइन दिइयो`;
  const hostMsg = document.getElementById('hostMsg');
  if (hostMsg) hostMsg.textContent = `🪙 ${name} लाई ${amount} कोइन दिइयो`;
});

function startGame() {
  socket.emit('startGame', { code: roomCode });
}

socket.on('gameStarted', ({ players, turn, pot }) => {
  document.getElementById('potAmount').textContent = pot || 0;
  document.getElementById('currentTurn').textContent = turn;
  currentTurn = turn;

  if (isHost) showPage('hostPanel');
  else {
    showPage('game');
    document.getElementById('actionButtons').style.display = 'grid';
  }
  document.getElementById('gameMsg').textContent = '🎮 खेल सुरु भयो!';
});

socket.on('yourHand', ({ hand, coins }) => {
  myHand = hand;
  myCoins = coins;
  hasSeen = false;
  document.getElementById('myCoins').textContent = coins;
  renderMyHand(false);
});

socket.on('allHands', ({ hands }) => {
  const div = document.getElementById('hostAllHands');
  if (!div) return;
  div.innerHTML = hands.map(p => {
    const cards = p.hand.map(c => {
      const isRed = c.suit === '♥' || c.suit === '♦';
      return `<span class="mini-card ${isRed ? 'red' : ''}">${c.rank}${c.suit}</span>`;
    }).join('');
    return `<div class="host-hand-row">
      <span class="name">👤 ${p.name}</span>
      <div class="mini-hand">${cards}</div>
    </div>`;
  }).join('');
});

function renderMyHand(showCards) {
  const div = document.getElementById('myHand');
  if (!div) return;
  if (!showCards) {
    div.innerHTML = `
      <div class="card-item hidden-card">🂠</div>
      <div class="card-item hidden-card">🂠</div>
      <div class="card-item hidden-card">🂠</div>
    `;
    return;
  }
  div.innerHTML = myHand.map(card => {
    const isRed = card.suit === '♥' || card.suit === '♦';
    return `<div class="card-item ${isRed ? 'red' : 'black'}">
      <div>${card.rank}</div>
      <div class="suit">${card.suit}</div>
    </div>`;
  }).join('');
}

function blindPlay() {
  if (hasSeen) return alert('कार्ड हेरिसक्नुभयो — सीन चल्नुहोस्');
  if (myCoins < 10) return alert('पर्याप्त कोइन छैन');
  myCoins -= 10;
  document.getElementById('myCoins').textContent = myCoins;
  document.getElementById('gameMsg').textContent = '🎴 ब्लाइन्ड चाल्यो';
}

function seeCards() {
  if (hasSeen) return alert('पहिले नै हेर्नुभयो');
  hasSeen = true;
  renderMyHand(true);
  document.getElementById('gameMsg').textContent = '👀 कार्ड हेर्यो';
}

function seenPlay() {
  if (!hasSeen) return alert('पहिले कार्ड हेर्नुहोस्');
  if (myCoins < 20) return alert('पर्याप्त कोइन छैन');
  myCoins -= 20;
  document.getElementById('myCoins').textContent = myCoins;
  document.getElementById('gameMsg').textContent = '💰 सीन चाल्यो';
}

function packGame() {
  socket.emit('pack', { code: roomCode });
  document.getElementById('gameMsg').textContent = '🏳️ प्याक गर्यो';
  document.getElementById('actionButtons').style.display = 'none';
}

function leaveTable() {
  if (!confirm('टेबलबाट उठ्न निश्चित?')) return;
  socket.emit('leaveTable', { code: roomCode });
  showPage('landing');
}

socket.on('turnChanged', ({ turn }) => {
  currentTurn = turn;
  document.getElementById('currentTurn').textContent = turn;
});

socket.on('playerPacked', ({ name, coins }) => {
  document.getElementById('gameMsg').textContent = `🏳️ ${name} प्याक गर्यो (${coins} कोइन)`;
});

socket.on('playerLeft', ({ name, coins }) => {
  document.getElementById('gameMsg').textContent = `🚪 ${name} बाहिरियो (${coins} कोइन बाँकी)`;
});

socket.on('gameWinner', ({ name, coins, amount }) => {
  document.getElementById('gameMsg').textContent = `🏆 ${name} ले जित्यो! +${amount} कोइन`;
  document.getElementById('potAmount').textContent = 0;
});

socket.on('connect', () => {
  console.log('सर्भरसँग जोडियो');
});
