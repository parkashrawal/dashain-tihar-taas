const socket = io();
let myName = '';
let roomCode = '';
let isHost = false;

// ===== पेज ह्यान्डलिङ =====
function showPage(id) {
  ['landing','hostLoginBox','waiting','game'].forEach(x => {
    document.getElementById(x).style.display = 'none';
  });
  document.getElementById(id).style.display = 'block';
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
    document.getElementById('landingMsg').textContent = 'पहिले नाम लेख्नुहोस्';
    showPage('landing');
    return;
  }
  socket.emit('createRoom', { playerName: myName }, (res) => {
    if (res.success) {
      roomCode = res.code;
      isHost = true;
      document.getElementById('roomCodeDisplay').textContent = roomCode;
      document.getElementById('startBtn').style.display = 'block';
      showPage('waiting');
    } else {
      document.getElementById('landingMsg').textContent = res.message;
    }
  });
}

// ===== रुम जोडिने =====
function joinRoom() {
  myName = document.getElementById('playerName').value.trim();
  const code = document.getElementById('roomCode').value.trim().toUpperCase();
  if (!myName) return alert('नाम लेख्नुहोस्');
  if (!code) return alert('रुम कोड लेख्नुहोस्');

  socket.emit('joinRoom', { code, playerName: myName }, (res) => {
    if (res.success) {
      roomCode = res.code;
      isHost = false;
      document.getElementById('roomCodeDisplay').textContent = roomCode;
      document.getElementById('startBtn').style.display = 'none';
      showPage('waiting');
    } else {
      document.getElementById('landingMsg').textContent = res.message;
    }
  });
}

// ===== खेलाडी सूची =====
socket.on('playerList', (list) => {
  document.getElementById('playerCount').textContent = list.length;
  document.getElementById('playerList').innerHTML = list.map(p =>
    `<li>👤 ${p.name} — 🪙 ${p.coins || 0}</li>`
  ).join('');

  // खेल स्क्रिनमा पनि देखाउने
  const allDiv = document.getElementById('allPlayers');
  if (allDiv) {
    allDiv.innerHTML = list.map(p =>
      `<div class="player-row">
        <span>👤 ${p.name}</span>
        <span class="coins">🪙 ${p.coins || 0}</span>
      </div>`
    ).join('');
  }
});

// ===== कोइन दिइयो सन्देश =====
socket.on('coinGiven', ({ name, amount }) => {
  document.getElementById('waitMsg').textContent = `🪙 ${name} लाई ${amount} कोइन दिइयो`;
});

// ===== खेल सुरु =====
function startGame() {
  socket.emit('startGame', { code: roomCode });
}

socket.on('gameStarted', () => {
  document.getElementById('gameRoomCode').textContent = roomCode;
  showPage('game');
  document.getElementById('gameMsg').textContent = '🎮 खेल सुरु भयो!';
});

// ===== कार्ड देखाउने =====
function renderHand(hand) {
  const div = document.getElementById('myHand');
  if (!div) return;
  div.innerHTML = hand.map(card => {
    const isRed = card.suit === '♥' || card.suit === '♦';
    return `<div class="card-item ${isRed ? 'red' : 'black'}">
      <div>${card.rank}</div>
      <div class="suit">${card.suit}</div>
    </div>`;
  }).join('');
}

socket.on('yourHand', ({ hand }) => {
  renderHand(hand);
});

socket.on('yourCoins', ({ coins }) => {
  const el = document.getElementById('myCoins');
  if (el) el.textContent = coins;
});
