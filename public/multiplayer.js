// Force WebSocket transport to avoid Vercel polling issues
const socket = io({
    transports: ["websocket"],
    upgrade: false
});

// 1. Determine Identity (Room Code vs Game ID)
const searchParams = new URLSearchParams(window.location.search);
let gameId = searchParams.get('gameId');
const roomCode = searchParams.get('roomCode');

if (!gameId && !roomCode) {
    window.location.replace('/');
}

const joinForm = document.getElementById('join-form');
const playerNameInput = document.getElementById('player-name');
const characterSelect = document.getElementById('player-character');
const lobbyStatus = document.getElementById('lobby-status');
const playerList = document.getElementById('player-list');
const gameTitle = document.getElementById('game-title');
const gameSummary = document.getElementById('game-summary');
const sessionIdDisplay = document.getElementById('session-id-display');

let availableCharacters = [];
let takenCharacters = new Set();
let sessionFound = false;

async function init() {
    if (roomCode) {
        socket.emit('inspect_lobby', { roomCode });
    } else {
        await loadGameInfo();
    }
}

// Socket: Receive Lobby Info
socket.on('lobby_info', ({ exists, session, players }) => {
    if (exists && session) {
        sessionFound = true;

        if (!gameId) {
            gameId = session.game_id;
            loadGameInfo();
        }

        if (players) {
            takenCharacters = new Set(players.map(p => p.character));
            renderCharacterSelect();
        }
    } else if (roomCode) {
        alert("Invalid Room Code or Session Expired");
        window.location.replace('/');
    }
});

// Load game info and characters
async function loadGameInfo() {
    try {
        const response = await fetch(`/api/games/${gameId}`);
        if (!response.ok) throw new Error('Game not found');

        const data = await response.json();

        gameTitle.textContent = data.title;
        gameSummary.textContent = data.definition?.Ambientacion?.Contexto_Inicial || '';

        if (data.image) {
            document.getElementById('app-background').style.backgroundImage = `url('${data.image}')`;
        }

        if (data.definition?.Personajes) {
            availableCharacters = data.definition.Personajes;
            renderCharacterSelect();
        }

        if (!roomCode) {
            socket.emit('inspect_lobby', { gameId });
        }

    } catch (error) {
        console.error('Error loading game info:', error);
        gameTitle.textContent = 'Error loading game';
    }
}

function renderCharacterSelect() {
    characterSelect.innerHTML = '<option value="">-- Choose a Class --</option>';

    availableCharacters.forEach(char => {
        const option = document.createElement('option');
        option.value = char.Nombre;
        option.textContent = `${char.Nombre} (${char.Rol})`;

        if (takenCharacters.has(char.Nombre)) {
            option.disabled = true;
            option.textContent += ' [TAKEN]';
        }

        characterSelect.appendChild(option);
    });
}

// Join Game
joinForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const playerName = playerNameInput.value.trim();
    const characterName = characterSelect.value;

    if (!playerName || !characterName) {
        alert("Please select a name and character");
        return;
    }

    socket.emit('join_lobby', { gameId, roomCode, playerName, characterName });

    joinForm.querySelector('button').disabled = true;
    playerNameInput.disabled = true;
    characterSelect.disabled = true;
});

// Socket: Successfully Joined
let mySessionId = null;
let myPlayerId = null;

socket.on('joined_lobby', ({ sessionId, roomCode, players, playerId, isHost }) => {
    mySessionId = sessionId;
    myPlayerId = playerId;

    joinForm.style.display = 'none';
    lobbyStatus.classList.remove('hidden');

    let codeHtml = roomCode ? `<span style="color: #4ade80; font-weight: bold; font-size: 1.2rem;">${roomCode}</span>` : 'N/A';
    sessionIdDisplay.innerHTML = `Room Code: ${codeHtml}<br><span style="font-size: 0.8rem; opacity: 0.5">Session ID: ${sessionId}</span>`;

    updatePlayerList(players);

    // Show Start Button for Host
    if (isHost) {
        document.getElementById('start-game-btn').style.display = 'block';
    }
});

// Socket: Lobby Updated (Player joined)
socket.on('lobby_update', ({ players, roomCode }) => {
    if (roomCode) {
        let codeHtml = `<span style="color: #4ade80; font-weight: bold; font-size: 1.2rem;">${roomCode}</span>`;
        sessionIdDisplay.innerHTML = `Room Code: ${codeHtml}`;
    }

    updatePlayerList(players);

    takenCharacters = new Set(players.map(p => p.character));
    renderCharacterSelect();
});

// Timer Event
socket.on('start_timer', ({ duration }) => {
    const countdownEl = document.getElementById('countdown-display');
    countdownEl.style.display = 'block';

    let left = duration;
    countdownEl.textContent = `Game Starting in ${left}...`;

    const interval = setInterval(() => {
        left--;
        if (left <= 0) {
            clearInterval(interval);
            countdownEl.textContent = "Starting...";
        } else {
            countdownEl.textContent = `Game Starting in ${left}...`;
        }
    }, 1000);
});

// Game Started Event
socket.on('game_started', ({ sessionId, gameId }) => {
    // Redirect to play page
    // Note: In a real app we might pass session token, but here we likely rely on URL params or re-auth.
    // Assuming simple redirection for now:
    const url = new URL('/play', window.location.origin);
    // Keep gameId/sessionId? 
    // Usually main.html needs to know we are in a session. 
    // We can pass query params.
    url.searchParams.set('gameId', gameId || searchParams.get('gameId')); // fallback
    url.searchParams.set('sessionId', sessionId);
    url.searchParams.set('playerId', myPlayerId);

    window.location.href = url.toString();
});

// Exit Button
document.getElementById('exit-btn').addEventListener('click', () => {
    if (confirm('Are you sure you want to leave the lobby?')) {
        socket.emit('leave_lobby', { sessionId: mySessionId, playerId: myPlayerId });
    }
});

socket.on('left_lobby', () => {
    window.location.replace('/');
});

// Start Game Button
document.getElementById('start-game-btn').addEventListener('click', () => {
    socket.emit('start_game', { sessionId: mySessionId });
});

function updatePlayerList(players) {
    playerList.innerHTML = '';
    players.forEach(player => {
        const div = document.createElement('div');
        div.className = 'player-card';
        div.style.padding = '1rem';
        div.style.background = 'rgba(255,255,255,0.1)';
        div.style.borderRadius = '8px';
        div.style.border = '1px solid rgba(255,255,255,0.1)';
        div.innerHTML = `
            <strong>${player.name}</strong>
            <div style="font-size: 0.9rem; margin-top: 0.2rem; opacity: 0.8; color: #a5b4fc;">${player.character || 'Unknown'}</div>
        `;
        playerList.appendChild(div);
    });
}

socket.on('error', ({ message }) => {
    alert(message);
    // Re-enable form if we failed to join initially
    if (joinForm.style.display !== 'none') {
        joinForm.querySelector('button').disabled = false;
        playerNameInput.disabled = false;
        characterSelect.disabled = false;
    }
});

// Start initialization
init();
