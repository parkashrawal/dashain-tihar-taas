const socket = io();
let myName = '';
let roomCode = '';
let isHost = false;
let myHand = [];
let myCoins = 0;
let hasSeen = false;
let currentTurn = '';

// ===== पेज ह्यान्डलिङ =====
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
    if (res.success) {
      roomCode = code;
      document.getElementById('landingMsg').textContent = res.message;
    } else {
      document.getElementById('landingMsg').textContent = res.message;
    }
  });
}

// ===== हेर्न मात्र =====
function viewGame() {
  const code = document.getElementById('joinCode').value.trim().toUpperCase();
  if (!code) return alert('रुम कोड लेख्नुहोस्');

  roomCode = code;
  isHost = false;
  showPage('game');
  document.getElementById('gameMsg').textContent = 'तपाईं दर्शक हुनुहुन्छ';
  document.getElementById('actionButtons').style.display = 'none';
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

socket.on('requestHandled', ({ name, accepted }) => {
  const msg = accepted ? `✅ ${name} स्वीकार` : `❌ ${name} अस्वीकार`;
  document.getElementById('waitMsg').textContent = msg;
});

// ===== खेलाडी सूची =====
socket.on('playerList', (list) => {
  // प्रतीक्षा कोठा
  const countEl = document.getElementById('playerCount');
  if (countEl) countEl.textContent = list.length;

  const listEl = document.getElementById('playerList');
  if (listEl) {
    listEl.innerHTML = list.map(p =>
      `<li>👤 ${p.name}${p.isHost ? ' (होस्ट)' : ''} — 🪙 ${p.coins || 0}</li>`
    ).join('');
  }

  // खेल स्क्रिनमा
  const allDiv = document.getElementById('allPlayers');
  if (allDiv) {
    allDiv.innerHTML = list.map(p =>
      `<div class="player-row">
        <span>👤 ${p.name}${p.isHost ? ' (होस्ट)' : ''}</span>
        <span class="coins">🪙 ${p.coins || 0}</span>
      </div>`
    ).join('');
  }

  // होस्ट प्यानलमा
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

// ===== रिक्वेस्ट आउँदा (होस्टको स्क्रिनमा) =====
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

// ===== होस्टले स्वीकार =====
function acceptPlayer(playerId) {
  socket.emit('acceptPlayer', { code: roomCode, playerId });
  const el = document.getElementById('req-' + playerId);
  if (el) el.remove();
}

// ===== होस्टले अस्वीकार =====
function rejectPlayer(playerId) {
  socket.emit('rejectPlayer', { code: roomCode, playerId });
  const el = document.getElementById('req-' + playerId);
  if (el) el.remove();
}

// ===== कोइन दिने (होस्टले) =====
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

// ===== खेल सुरु =====
function startGame() {
  socket.emit('startGame', { code: roomCode });
}

socket.on('gameStarted', ({ players, turn, pot }) => {
  document.getElementById('potAmount').textContent = pot || 0;
  document.getElementById('currentTurn').textContent = turn;
  currentTurn = turn;

  if (isHost) {
    showPage('hostPanel');
  } else {
    showPage('game');
    document.getElementById('actionButtons').style.display = 'grid';
  }

  document.getElementById('gameMsg').textContent = '🎮 खेल सुरु भयो!';
});

// ===== तपाईंको कार्ड =====
socket.on('yourHand', ({ hand, coins }) => {
  myHand = hand;
  myCoins = coins;
  hasSeen = false;

  document.getElementById('myCoins').textContent = coins;
  renderMyHand(false);
});

// ===== होस्टलाई सबैको कार्ड =====
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

// ===== कार्ड रेन्डर =====
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

// ===== ब्लाइन्ड चल्ने =====
function blindPlay() {
  if (hasSeen) return alert('तपाईंले कार्ड हेरिसक्नुभयो — सीन चल्नुहोस्');
  if (myCoins < 10) return alert('पर्याप्त कोइन छैन');
  myCoins -= 10;
  document.getElementById('myCoins').textContent = myCoins;
  document.getElementById('gameMsg').textContent = '🎴 ब्लाइन्ड चाल्यो';
}

// ===== कार्ड हेर्ने =====
function seeCards() {
  if (hasSeen) return alert('तपाईंले पहिले नै हेर्नुभयो');
  hasSeen = true;
  renderMyHand(true);
  document.getElementById('gameMsg').textContent = '👀 कार्ड हेर्यो';
}

// ===== सीन चल्ने =====
function seenPlay() {
  if (!hasSeen) return alert('पहिले कार्ड हेर्नुहोस्');
  if (myCoins < 20) return alert('पर्याप्त कोइन छैन');
  myCoins -= 20;
  document.getElementById('myCoins').textContent = myCoins;
  document.getElementById('gameMsg').textContent = '💰 सीन चाल्यो';
}

// ===== प्याक गर्ने =====
function packGame() {
  socket.emit('pack', { code: roomCode });
  document.getElementById('gameMsg').textContent = '🏳️ प्याक गर्यो';
  document.getElementById('actionButtons').style.display = 'none';
}

// ===== टेबलबाट उठ्ने =====
function leaveTable() {
  if (!confirm('टेबलबाट उठ्न निश्चित?')) return;
  socket.emit('leaveTable', { code: roomCode });
  showPage('landing');
}

// ===== पालो परिवर्तन =====
socket.on('turnChanged', ({ turn }) => {
  currentTurn = turn;
  document.getElementById('currentTurn').textContent = turn;
});

// ===== प्याक भयो =====
socket.on('playerPacked', ({ name, coins }) => {
  document.getElementById('gameMsg').textContent = `🏳️ ${name} प्याक गर्यो (${coins} कोइन)`;
});

// ===== खेलबाट बाहिरियो =====
socket.on('playerLeft', ({ name, coins }) => {
  document.getElementById('gameMsg').textContent = `🚪 ${name} बाहिरियो (${coins} कोइन बाँकी)`;
});

// ===== खेल जित्यो =====
socket.on('gameWinner', ({ name, coins, amount }) => {
  document.getElementById('gameMsg').textContent = `🏆 ${name} ले जित्यो! +${amount} कोइन`;
  document.getElementById('potAmount').textContent = 0;
});

// ===== सुरुवात =====
socket.on('connect', () => {
  console.log('सर्भरसँग जोडियो');
});
