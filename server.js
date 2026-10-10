const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

// ⚠️ होस्ट पासवर्ड
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

// ===== कार्ड शफल =====
function shuffleDeck(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// ===== हात तुलना (साधारण) =====
function getHandRank(hand) {
  const ranks = hand.map(c => c.rank);
  const suits = hand.map(c => c.suit);

  // Rank मान
  const rankValue = (r) => {
    const map = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14 };
    return map[r] || 0;
  };

  const values = ranks.map(rankValue).sort((a, b) => b - a);

  // ट्रेल (तिनवटै एकै)
  if (ranks[0] === ranks[1] && ranks[1] === ranks[2]) {
    return { type: 'trail', value: values[0] };
  }

  // प्योर सेक्वेन्स (एकै रङको लगातार)
  const isSameSuit = suits[0] === suits[1] && suits[1] === suits[2];
  const isSequence = (values[0] - values[1] === 1) && (values[1] - values[2] === 1);

  if (isSameSuit && isSequence) {
    return { type: 'pure-sequence', value: values[0] };
  }

  // सेक्वेन्स (लगातार)
  if (isSequence) {
    return { type: 'sequence', value: values[0] };
  }

  // कलर (एकै रङ)
  if (isSameSuit) {
    return { type: 'color', value: values[0] };
  }

  // पेयर (२ एकै)
  if (ranks[0] === ranks[1] || ranks[1] === ranks[2] || ranks[0] === ranks[2]) {
    let pairValue = 0;
    if (ranks[0] === ranks[1]) pairValue = values[0];
    else if (ranks[1] === ranks[2]) pairValue = values[1];
    else pairValue = values[0];
    return { type: 'pair', value: pairValue };
  }

  // हाइ कार्ड
  return { type: 'high-card', value: values[0] };
}

// ===== हात तुलना =====
function compareHands(hand1, hand2) {
  const rankOrder = {
    'trail': 6,
    'pure-sequence': 5,
    'sequence': 4,
    'color': 3,
    'pair': 2,
    'high-card': 1
  };

  const r1 = getHandRank(hand1);
  const r2 = getHandRank(hand2);

  if (rankOrder[r1.type] > rankOrder[r2.type]) return 1;
  if (rankOrder[r1.type] < rankOrder[r2.type]) return -1;

  if (r1.value > r2.value) return 1;
  if (r1.value < r2.value) return -1;

  return 0;
}

// ===== रुम व्यवस्थापन =====
io.on('connection', (socket) => {
  console.log('जोडियो:', socket.id);

  // ===== होस्ट लगइन =====
  socket.on('hostLogin', ({ password }, callback) => {
    if (password === HOST_PASSWORD) callback({ success: true });
    else callback({ success: false, message: '❌ गलत पासवर्ड!' });
  });

  // ===== रुम बनाउने =====
  socket.on('createRoom', ({ playerName }, callback) => {
    const code = generateRoomCode();
    rooms[code] = {
      hostId: socket.id,
      players: [{ id: socket.id, name: playerName, coins: 0, hand: [], isHost: true }],
      started: false,
      gameOver: false,
      deck: []
    };
    latestRoomCode = code;
    socket.join(code);
    callback({ success: true, code });
    console.log('रुम बन्यो:', code);
  });

  // ===== रुम जोडिने =====
  socket.on('joinRoom', ({ code, playerName }, callback) => {
    const room = rooms[code];
    if (!room) return callback({ success: false, message: 'रुम भेटिएन' });
    if (room.started) return callback({ success: false, message: 'खेल सुरु भइसक्यो' });
    if (room.players.length >= 10) return callback({ success: false, message: 'रुम भरियो (१० जना)' });

    room.players.push({
      id: socket.id,
      name: playerName,
      coins: 0,
      hand: [],
      isHost: false
    });
    socket.join(code);
    callback({ success: true, code });

    io.to(code).emit('playerList', room.players.map(p => ({
      name: p.name,
      coins: p.coins
    })));
    console.log(`${playerName} जोडियो रुम ${code} मा`);
  });

  // ===== कोइन दिने (होस्टले) =====
  socket.on('giveCoins', ({ code, playerName, amount }) => {
    const room = rooms[code];
    if (!room || room.hostId !== socket.id) return;

    const player = room.players.find(p => p.name === playerName);
    if (player) {
      player.coins += parseInt(amount);
      io.to(code).emit('playerList', room.players.map(p => ({
        name: p.name,
        coins: p.coins
      })));
      io.to(code).emit('coinGiven', { name: playerName, amount: amount });
      console.log(`${playerName} लाई ${amount} कोइन दिइयो`);
    }
  });

  // ===== खेल सुरु =====
  socket.on('startGame', ({ code }) => {
    const room = rooms[code];
    if (!room || room.hostId !== socket.id) return;

    room.started = true;
    room.deck = shuffleDeck(createDeck());

    // प्रत्येकलाई ३ कार्ड
    room.players.forEach(p => {
      p.hand = [
        room.deck.pop(),
        room.deck.pop(),
        room.deck.pop()
      ];
    });

    io.to(code).emit('gameStarted');
    console.log('खेल सुरु:', code);
  });

  socket.on('disconnect', () => {
    console.log('डिस्कनेक्ट:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`सर्भर चल्दैछ पोर्ट ${PORT} मा`);
});
