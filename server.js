const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static('public'));

// Game state
const players = {};
const paintOrbs = [];
const trails = {};

// Game configuration
const WORLD_WIDTH = 3000;
const WORLD_HEIGHT = 3000;
const MAX_ORBS = 200;
const ORB_SIZE = 8;
const INITIAL_PLAYER_SIZE = 30;
const SIZE_DRAIN_RATE = 0.02; // Size lost per second
const TRAIL_LIFETIME = 3000; // 3 seconds
const MIN_PLAYER_SIZE = 10;

// Generate random color
function randomColor() {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', 
    '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2',
    '#F8B739', '#52B788', '#E63946', '#A8DADC'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

// Generate random position
function randomPosition() {
  return {
    x: Math.random() * WORLD_WIDTH,
    y: Math.random() * WORLD_HEIGHT
  };
}

// Initialize paint orbs
function initializeOrbs() {
  for (let i = 0; i < MAX_ORBS; i++) {
    paintOrbs.push({
      id: Math.random().toString(36).substr(2, 9),
      ...randomPosition(),
      size: ORB_SIZE,
      color: randomColor()
    });
  }
}

// Spawn new orb
function spawnOrb() {
  if (paintOrbs.length < MAX_ORBS) {
    paintOrbs.push({
      id: Math.random().toString(36).substr(2, 9),
      ...randomPosition(),
      size: ORB_SIZE,
      color: randomColor()
    });
  }
}

// Check collision between two circles
function checkCollision(obj1, obj2) {
  const dx = obj1.x - obj2.x;
  const dy = obj1.y - obj2.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  return distance < (obj1.size + obj2.size) / 2;
}

// Socket.io connection handler
io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  // Create new player
  const startPos = randomPosition();
  players[socket.id] = {
    id: socket.id,
    x: startPos.x,
    y: startPos.y,
    size: INITIAL_PLAYER_SIZE,
    color: randomColor(),
    name: `Player ${Object.keys(players).length + 1}`,
    score: 0
  };

  trails[socket.id] = [];

  // Send initial game state to new player
  socket.emit('init', {
    id: socket.id,
    players: players,
    orbs: paintOrbs
  });

  // Broadcast new player to all others
  socket.broadcast.emit('playerJoined', players[socket.id]);

  // Handle player movement
  socket.on('move', (data) => {
    if (!players[socket.id]) return;

    const player = players[socket.id];
    
    // Add current position to trail
    trails[socket.id].push({
      x: player.x,
      y: player.y,
      size: player.size,
      color: player.color,
      timestamp: Date.now()
    });

    // Update position
    player.x = Math.max(player.size/2, Math.min(WORLD_WIDTH - player.size/2, data.x));
    player.y = Math.max(player.size/2, Math.min(WORLD_HEIGHT - player.size/2, data.y));

    // Clean old trail segments
    const now = Date.now();
    trails[socket.id] = trails[socket.id].filter(
      segment => now - segment.timestamp < TRAIL_LIFETIME
    );
  });

  // Handle player name change
  socket.on('setName', (name) => {
    if (players[socket.id]) {
      players[socket.id].name = name.substring(0, 20);
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    delete players[socket.id];
    delete trails[socket.id];
    io.emit('playerLeft', socket.id);
  });
});

// Game loop
setInterval(() => {
  // Drain player size
  Object.values(players).forEach(player => {
    player.size -= SIZE_DRAIN_RATE;
    
    // Check if player died from size drain
    if (player.size < MIN_PLAYER_SIZE) {
      const socket = io.sockets.sockets.get(player.id);
      if (socket) {
        socket.emit('died', 'You ran out of paint!');
        
        // Reset player
        const startPos = randomPosition();
        player.x = startPos.x;
        player.y = startPos.y;
        player.size = INITIAL_PLAYER_SIZE;
        player.score = 0;
        trails[player.id] = [];
      }
    }
  });

  // Check collisions with orbs
  Object.values(players).forEach(player => {
    for (let i = paintOrbs.length - 1; i >= 0; i--) {
      const orb = paintOrbs[i];
      if (checkCollision(player, orb)) {
        // Player eats orb
        player.size += orb.size / 2;
        player.score += 1;
        paintOrbs.splice(i, 1);
        spawnOrb();
        
        io.to(player.id).emit('ateOrb');
      }
    }
  });

  // Check player collisions (eating other players)
  const playerArray = Object.values(players);
  for (let i = 0; i < playerArray.length; i++) {
    for (let j = i + 1; j < playerArray.length; j++) {
      const p1 = playerArray[i];
      const p2 = playerArray[j];
      
      if (checkCollision(p1, p2)) {
        // Bigger player eats smaller
        if (p1.size > p2.size * 1.1) {
          p1.size += p2.size * 0.5;
          p1.score += 10;
          
          // Reset smaller player
          const socket = io.sockets.sockets.get(p2.id);
          if (socket) {
            socket.emit('died', `Eaten by ${p1.name}!`);
            const startPos = randomPosition();
            p2.x = startPos.x;
            p2.y = startPos.y;
            p2.size = INITIAL_PLAYER_SIZE;
            p2.score = 0;
            trails[p2.id] = [];
          }
        } else if (p2.size > p1.size * 1.1) {
          p2.size += p1.size * 0.5;
          p2.score += 10;
          
          // Reset smaller player
          const socket = io.sockets.sockets.get(p1.id);
          if (socket) {
            socket.emit('died', `Eaten by ${p2.name}!`);
            const startPos = randomPosition();
            p1.x = startPos.x;
            p1.y = startPos.y;
            p1.size = INITIAL_PLAYER_SIZE;
            p1.score = 0;
            trails[p1.id] = [];
          }
        }
      }
    }
  }

  // Broadcast game state
  io.emit('update', {
    players: players,
    orbs: paintOrbs,
    trails: trails
  });

}, 1000 / 30); // 30 ticks per second

// Initialize game
initializeOrbs();

// Start server
http.listen(PORT, () => {
  console.log(`Paint.io server running on port ${PORT}`);
});
