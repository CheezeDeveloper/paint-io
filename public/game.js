const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const startScreen = document.getElementById('startScreen');
const gameUI = document.getElementById('gameUI');
const nameInput = document.getElementById('nameInput');
const playBtn = document.getElementById('playBtn');
const sizeDisplay = document.getElementById('sizeDisplay');
const scoreDisplay = document.getElementById('scoreDisplay');
const leaderboardList = document.getElementById('leaderboardList');
const deathMessage = document.getElementById('deathMessage');

// Set canvas size
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});

// Game state
let socket;
let myId;
let players = {};
let orbs = [];
let trails = {};
let camera = { x: 0, y: 0 };
let mouse = { x: canvas.width / 2, y: canvas.height / 2 };

// Mouse movement
canvas.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
});

// Start game
playBtn.addEventListener('click', () => {
    const name = nameInput.value.trim() || `Player ${Math.floor(Math.random() * 1000)}`;
    startScreen.style.display = 'none';
    gameUI.style.display = 'block';
    initGame(name);
});

// Initialize game
function initGame(playerName) {
    socket = io();

    socket.on('init', (data) => {
        myId = data.id;
        players = data.players;
        orbs = data.orbs;
        socket.emit('setName', playerName);
        gameLoop();
    });

    socket.on('update', (data) => {
        players = data.players;
        orbs = data.orbs;
        trails = data.trails;
    });

    socket.on('playerJoined', (player) => {
        players[player.id] = player;
    });

    socket.on('playerLeft', (id) => {
        delete players[id];
        delete trails[id];
    });

    socket.on('died', (message) => {
        showDeathMessage(message);
    });

    socket.on('ateOrb', () => {
        // Could add sound effect here
    });
}

// Show death message
function showDeathMessage(message) {
    deathMessage.textContent = message;
    deathMessage.style.display = 'block';
    setTimeout(() => {
        deathMessage.style.display = 'none';
    }, 2000);
}

// Send movement to server
function sendMovement() {
    if (!socket || !players[myId]) return;

    const player = players[myId];
    
    // Calculate target position based on mouse
    const dx = mouse.x - canvas.width / 2;
    const dy = mouse.y - canvas.height / 2;
    
    const speed = 3;
    const targetX = player.x + dx * 0.1;
    const targetY = player.y + dy * 0.1;

    socket.emit('move', { x: targetX, y: targetY });
}

// Update camera
function updateCamera() {
    if (!players[myId]) return;

    const player = players[myId];
    camera.x = player.x - canvas.width / 2;
    camera.y = player.y - canvas.height / 2;
}

// Draw grid
function drawGrid() {
    const gridSize = 50;
    ctx.strokeStyle = 'rgba(78, 205, 196, 0.1)';
    ctx.lineWidth = 1;

    const startX = Math.floor(camera.x / gridSize) * gridSize;
    const startY = Math.floor(camera.y / gridSize) * gridSize;

    for (let x = startX; x < camera.x + canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x - camera.x, 0);
        ctx.lineTo(x - camera.x, canvas.height);
        ctx.stroke();
    }

    for (let y = startY; y < camera.y + canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y - camera.y);
        ctx.lineTo(canvas.width, y - camera.y);
        ctx.stroke();
    }
}

// Draw trails
function drawTrails() {
    Object.entries(trails).forEach(([playerId, trail]) => {
        if (trail.length < 2) return;

        ctx.globalAlpha = 0.6;
        for (let i = 0; i < trail.length - 1; i++) {
            const segment = trail[i];
            const nextSegment = trail[i + 1];
            
            const age = Date.now() - segment.timestamp;
            const fadeAlpha = Math.max(0, 1 - age / 3000);

            ctx.globalAlpha = fadeAlpha * 0.6;
            ctx.strokeStyle = segment.color;
            ctx.lineWidth = segment.size;
            ctx.lineCap = 'round';

            ctx.beginPath();
            ctx.moveTo(segment.x - camera.x, segment.y - camera.y);
            ctx.lineTo(nextSegment.x - camera.x, nextSegment.y - camera.y);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
    });
}

// Draw orbs
function drawOrbs() {
    orbs.forEach(orb => {
        ctx.fillStyle = orb.color;
        ctx.beginPath();
        ctx.arc(
            orb.x - camera.x,
            orb.y - camera.y,
            orb.size,
            0,
            Math.PI * 2
        );
        ctx.fill();
    });
}

// Draw players
function drawPlayers() {
    Object.values(players).forEach(player => {
        const x = player.x - camera.x;
        const y = player.y - camera.y;

        // Draw player square
        ctx.fillStyle = player.color;
        ctx.fillRect(
            x - player.size / 2,
            y - player.size / 2,
            player.size,
            player.size
        );

        // Draw border for own player
        if (player.id === myId) {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 3;
            ctx.strokeRect(
                x - player.size / 2,
                y - player.size / 2,
                player.size,
                player.size
            );
        }

        // Draw name
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(player.name, x, y - player.size / 2 - 10);
    });
}

// Update UI
function updateUI() {
    if (!players[myId]) return;

    const player = players[myId];
    sizeDisplay.textContent = `Size: ${Math.floor(player.size)}`;
    scoreDisplay.textContent = `Score: ${player.score}`;

    // Update leaderboard
    const sortedPlayers = Object.values(players)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);

    leaderboardList.innerHTML = sortedPlayers
        .map((p, i) => `<li>${p.name}: ${p.score}</li>`)
        .join('');
}

// Game loop
function gameLoop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    sendMovement();
    updateCamera();

    drawGrid();
    drawTrails();
    drawOrbs();
    drawPlayers();
    updateUI();

    requestAnimationFrame(gameLoop);
}
