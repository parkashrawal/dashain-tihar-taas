const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

const HOST_PASSWORD = 'pgpk3535';
const rooms = {};
let latestRoomCode = null;

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

// ===== कार्ड डेक =====
function createDeck() {
  const suits = ['♠', '♥', '♦', '♣'];
  const ranks = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
  const deck = [];
  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

function shuffleDeck(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// ===== हात तुलना =====
function rankValue(r) {
  const map = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14 };
  return map[r] || 0;
}

function getHandRank(hand) {
  const ranks = hand.map(c => c.rank);
  const suits = hand.map(c => c.suit);
  const values = ranks.map(rankValue).sort((a, b) => b - a);

  // ट्रेल
  if (ranks[0] === ranks[1] && ranks[1] === ranks[2]) {
    return { type: 'trail', value: values[0], name: 'ट्रेल' };
  }

  const isSameSuit = suits[0] === suits[1] && suits[1] === suits[2];
  const isSequence = (values[0] - values[1] === 1) && (values[1] - values[2] === 1);

  // प्योर सेक्वेन्स
  if (isSameSuit && isSequence) {
    return { type: 'pure-sequence', value: values[0], name: 'प्योर सेक्वेन्स' };
  }

  // सेक्वेन्स
  if (isSequence) {
    return { type: 'sequence', value: values[0], name: 'सेक्वेन्स' };
  }

  // कलर
  if (isSameSuit) {
    return { type: 'color', value: values[0], name: 'कलर' };
  }

  // पेयर
  if (ranks[0] === ranks[1] || ranks[1] === ranks[2] || ranks[0] === ranks[2]) {
    let pairValue = 0;
    if (ranks[0] === ranks[1]) pairValue = values[0];
    else if (ranks[1] === ranks[2]) pairValue = values[1];
    else pairValue = values[0];
    return { type: 'pair', value: pairValue, name: 'पेयर' };
  }

  return { type: 'high-card', value: values[0], name: 'हाइ कार्ड' };
}

function compareHands(hand1, hand2) {
  const rankOrder = {
    'trail': 6, 'pure-sequence': 5, 'sequence': 4,
    'color': 3, 'pair': 2, 'high-card': 1
  };
  const r1 = getHandRank(hand1);
  const r2 = getHandRank(hand2);
  if (rankOrder[r1.type] > rankOrder[r2.type]) return 1;
  if (rankOrder[r1.type] < rankOrder[r2.type]) return -1;
  if (r1.value > r2.value) return 1;
  if (r1.value < r2.value) return -1;
  return 0;
}

// ===== रुम सिर्जना =====
function createRoom(hostId, hostName) {
  const code = generateRoomCode();
  rooms[code] = {
    hostId: hostId,
    players: [{
      id: hostId,
      name: hostName,
      coins: 0,
      hand: [],
      isHost: true,
      packed: false,
      seen: false,
      currentBet: 0
    }],
    pendingRequests: [],
    started: false,
    gameOver: false,
    deck: [],
    pot: 0,
    currentTurn: 0,
    betAmount: 10,
    gameNumber: 0,
    log: []
  };
  latestRoomCode = code;
  return code;
}

// ===== सकेट ह्यान्डलर =====
io.on('connection', (socket) => {
  console.log('जोडियो:', socket.id);

  // ===== होस्ट लगइन =====
  socket.on('hostLogin', ({ password }, callback) => {
    if (password === HOST_PASSWORD) callback({ success: true });
    else callback({ success: false, message: '❌ गलत पासवर्ड!' });
  });

  // ===== होस्टले रुम बनाउने =====
  socket.on('createRoom', ({ hostName }, callback) => {
    const code = createRoom(socket.id, hostName);
    socket.join(code);
    callback({ success: true, code });
    io.to(code).emit('playerList', rooms[code].players.map(p => ({
      name: p.name, coins: p.coins, isHost: p.isHost
    })));
    console.log('रुम बन्यो:', code);
  });

  // ===== खेलाडी जोडिने रिक्वेस्ट =====
  socket.on('requestJoin', ({ code, playerName }, callback) => {
    const room = rooms[code];
    if (!room) return callback({ success: false, message: 'रुम भेटिएन' });
    if (room.players.length >= 10) return callback({ success: false, message: 'रुम भरियो' });
    if (room.players.some(p => p.name === playerName)) {
      return callback({ success: false, message: 'यो नाम पहिले नै छ' });
    }

    // होस्टलाई रिक्वेस्ट पठाउने
    const request = { id: socket.id, name: playerName };
    room.pendingRequests.push(request);
    io.to(room.hostId).emit('joinRequest', request);
    callback({ success: true, message: 'होस्टको स्वीकृति पर्खंदै...' });
  });

  // ===== होस्टले स्वीकार गर्ने =====
  socket.on('acceptPlayer', ({ code, playerId }, callback) => {
    const room = rooms[code];
    if (!room || room.hostId !== socket.id) return;

    const req = room.pendingRequests.find(r => r.id === playerId);
    if (!req) return;

    room.players.push({
      id: req.id,
      name: req.name,
      coins: 0,
      hand: [],
      isHost: false,
      packed: false,
      seen: false,
      currentBet: 0
    });
    room.pendingRequests = room.pendingRequests.filter(r => r.id !== playerId);

    io.to(req.id).emit('joinAccepted', { code });
    io.to(code).emit('playerList', room.players.map(p => ({
      name: p.name, coins: p.coins, isHost: p.isHost
    })));
    socket.emit('requestHandled', { name: req.name, accepted: true });
  });

  // ===== होस्टले अस्वीकार गर्ने =====
  socket.on('rejectPlayer', ({ code, playerId }) => {
    const room = rooms[code];
    if (!room || room.hostId !== socket.id) return;

    const req = room.pendingRequests.find(r => r.id === playerId);
    if (!req) return;

    io.to(req.id).emit('joinRejected', { message: 'होस्टले स्वीकार गरेन' });
    room.pendingRequests = room.pendingRequests.filter(r => r.id !== playerId);
    socket.emit('requestHandled', { name: req.name, accepted: false });
  });

  // ===== होस्टले कोइन दिने =====
  socket.on('giveCoins', ({ code, playerName, amount }) => {
    const room = rooms[code];
    if (!room || room.hostId !== socket.id) return;

    const player = room.players.find(p => p.name === playerName);
    if (player) {
      player.coins += parseInt(amount);
      io.to(code).emit('playerList', room.players.map(p => ({
        name: p.name, coins: p.coins, isHost: p.isHost
      })));
      io.to(code).emit('coinGiven', { name: playerName, amount: amount });
    }
  });

  // ===== खेल सुरु =====
  socket.on('startGame', ({ code }) => {
    const room = rooms[code];
    if (!room || room.hostId !== socket.id) return;

    // सबैलाई कार्ड बाँड्ने
    room.deck = shuffleDeck(createDeck());
    room.players.forEach(p => {
      p.hand = [room.deck.pop(), room.deck.pop(), room.deck.pop()];
      p.packed = false;
      p.seen = false;
      p.currentBet = 0;
    });

    room.started = true;
    room.gameOver = false;
    room.pot = 0;
    room.currentTurn = 0;
    room.gameNumber++;

    // प्रत्येकलाई उसको कार्ड
    room.players.forEach(p => {
      io.to(p.id).emit('yourHand', { hand: p.hand, coins: p.coins });
    });

    // होस्टलाई सबैको कार्ड
    io.to(room.hostId).emit('allHands', {
      hands: room.players.map(p => ({ name: p.name, hand: p.hand }))
    });

    // सबैलाई खेल सुरु सन्देश
    io.to(code).emit('gameStarted', {
      players: room.players.map(p => ({
        name: p.name, coins: p.coins, isHost: p.isHost
      })),
      turn: room.players[room.currentTurn].name,
      pot: 0
    });

    console.log(`खेल ${room.gameNumber} सुरु (रुम ${code})`);
  });

  // ===== प्याक गर्ने =====
  socket.on('pack', ({ code }) => {
    const room = rooms[code];
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    player.packed = true;

    io.to(code).emit('playerPacked', {
      name: player.name,
      coins: player.coins
    });

    // अर्को पालो
    nextTurn(room, code);
  });

  // ===== टेबलबाट उठ्ने =====
  socket.on('leaveTable', ({ code }) => {
    const room = rooms[code];
    if (!room) return;
    const idx = room.players.findIndex(p => p.id === socket.id);
    if (idx === -1) return;

    const player = room.players[idx];

    io.to(code).emit('playerLeft', {
      name: player.name,
      coins: player.coins
    });

    room.players.splice(idx, 1);
    socket.leave(code);

    if (room.players.length === 0) {
      delete rooms[code];
    } else {
      io.to(code).emit('playerList', room.players.map(p => ({
        name: p.name, coins: p.coins, isHost: p.isHost
      })));
    }
  });

  socket.on('disconnect', () => {
    console.log('डिस्कनेक्ट:', socket.id);
  });
});

// ===== पालो घुमाउने =====
function nextTurn(room, code) {
  const active = room.players.filter(p => !p.packed);
  if (active.length <= 1) {
    // खेल समाप्त — जित्नेलाई बोटी
    if (active.length === 1) {
      active[0].coins += room.pot;
      io.to(code).emit('gameWinner', {
        name: active[0].name,
        coins: active[0].coins,
        amount: room.pot
      });
    }
    return;
  }

  // अर्को सक्रिय खेलाडी खोज्ने
  let attempts = 0;
  do {
    room.currentTurn = (room.currentTurn + 1) % room.players.length;
    attempts++;
  } while (room.players[room.currentTurn].packed && attempts < 20);

  io.to(code).emit('turnChanged', {
    turn: room.players[room.currentTurn].name
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`सर्भर चल्दैछ पोर्ट ${PORT} मा`);
});
