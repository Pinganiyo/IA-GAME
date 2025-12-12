const chatFeed = document.querySelector('#chat-feed');
const chatForm = document.querySelector('#chat-form');
const chatInput = document.querySelector('#chat-input');
const imagePromptEl = document.querySelector('#image-prompt');
const sceneImage = document.querySelector('#scene-image');
const scenarioTitle = document.querySelector('#scenario-title');
const scenarioSummary = document.querySelector('#scenario-summary');
const scenarioObjective = document.querySelector('#scenario-objective');
const scenarioRisk = document.querySelector('#scenario-risk');
const loadingIndicator = document.querySelector('#loading-indicator');
const appBackground = document.querySelector('#app-background');

const messageTemplate = document.querySelector('#chat-message-template');

const searchParams = new URLSearchParams(window.location.search);
const selectedGameId = searchParams.get('gameId');

if (!selectedGameId) {
    window.location.replace('/');
}

let currentScenario = null;

function showLoading() {
    if (loadingIndicator) loadingIndicator.classList.remove('hidden');
}

function hideLoading() {
    if (loadingIndicator) loadingIndicator.classList.add('hidden');
}

function updateBackground(imageUrl) {
    if (imageUrl && appBackground) {
        appBackground.style.backgroundImage = `url('${imageUrl}')`;
    }
}

async function loadScenario(gameId) {
    const response = await fetch(`/api/games/${gameId}`);
    if (!response.ok) {
        throw new Error('No se pudo cargar el escenario seleccionado.');
    }
    const data = await response.json();
    currentScenario = data;
    scenarioTitle.textContent = data.title || 'Escenario sin título';
    scenarioSummary.textContent = data.summary || 'Sin resumen disponible.';
    scenarioObjective.textContent = data.definition?.Game_Setup?.Objetivo_Principal || 'N/A';
    scenarioRisk.textContent = data.definition?.Ambientacion?.Riesgo_Principal || 'N/A';

    if (data.image) {
        sceneImage.src = data.image;
        sceneImage.alt = data.title;
        updateBackground(data.image);
    }

    // Auto-start game
    await startGame();
}

function formatMessage(content) {
    // Escape HTML first to prevent XSS, then replace **bold**
    const escaped = content
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

    return escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
}

function appendMessage({ author, content }) {
    const node = messageTemplate.content.cloneNode(true);
    const article = node.querySelector('.chat-message');

    // Add specific class based on author
    if (author === 'Player') {
        article.classList.add('message-player');
    } else if (author === 'Game Master') {
        article.classList.add('message-gemini');
    } else {
        article.classList.add('message-system');
    }

    article.querySelector('.author').textContent = author;
    article.querySelector('.timestamp').textContent = new Date().toLocaleTimeString();
    article.querySelector('.content').innerHTML = formatMessage(content);
    chatFeed.appendChild(node);
    chatFeed.scrollTop = chatFeed.scrollHeight;
}

// Handle Enter key to submit
chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        chatForm.dispatchEvent(new Event('submit'));
    }
});

function transitionImage(imageUrl, altText) {
    sceneImage.classList.add('fade-out');
    setTimeout(() => {
        sceneImage.src = imageUrl;
        sceneImage.alt = altText;
        sceneImage.onload = () => {
            sceneImage.classList.remove('fade-out');
        };
    }, 500); // Match CSS transition time
}

const sessionId = searchParams.get('sessionId');
const playerId = searchParams.get('playerId');

// ... (existing code)

async function handleChatSubmit(event) {
    event.preventDefault();
    const playerMessage = chatInput.value.trim();
    if (!playerMessage) return;

    appendMessage({ author: 'Player', content: playerMessage });
    chatInput.value = '';
    showLoading();

    try {
        const chatResponse = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: playerMessage,
                gameId: selectedGameId,
                gameState: null,
                sessionId, // Pass if exists
                playerId   // Pass if exists
            })
        }).then((res) => res.json());

        appendMessage({ author: 'Game Master', content: chatResponse.message });
        imagePromptEl.textContent = chatResponse.imagePrompt ?? 'Sin prompt de imagen';

        const imageResponse = await fetch('/api/image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: chatResponse.imagePrompt })
        }).then((res) => res.json());

        transitionImage(imageResponse.imageUrl, chatResponse.imagePrompt ?? 'Imagen generada por Nano Banana');

    } catch (error) {
        console.error('Error handling chat submit', error);
        appendMessage({ author: 'System', content: 'Error contacting services. Revisa la consola.' });
    } finally {
        hideLoading();
    }
}

async function startGame() {
    showLoading();
    try {
        const chatResponse = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: "Start Game. Introduce the scenario and the first challenge.",
                gameId: selectedGameId,
                gameState: null,
                sessionId, // Pass if exists
                playerId   // Pass if exists
            })
        }).then((res) => res.json());

        appendMessage({ author: 'Game Master', content: chatResponse.message });
        imagePromptEl.textContent = chatResponse.imagePrompt ?? 'Sin prompt de imagen';

        // Generate initial dynamic image if needed, or stick with static one for now
        // For now, let's generate one to start the visual journey
        const imageResponse = await fetch('/api/image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: chatResponse.imagePrompt })
        }).then((res) => res.json());

        transitionImage(imageResponse.imageUrl, chatResponse.imagePrompt ?? 'Imagen generada por Nano Banana');

    } catch (error) {
        console.error('Error starting game', error);
        appendMessage({ author: 'System', content: 'Error starting game. Please try sending a message manually.' });
    } finally {
        hideLoading();
    }
}

chatForm.addEventListener('submit', handleChatSubmit);

loadScenario(selectedGameId).catch((error) => {
    console.error(error);
    scenarioTitle.textContent = 'Error cargando escenario';
    scenarioSummary.textContent = 'No se pudo cargar el escenario seleccionado.';
    scenarioObjective.textContent = 'N/A';
    scenarioRisk.textContent = 'N/A';
    appendMessage({ author: 'Sistema', content: 'No se pudo cargar el escenario. Regresa y selecciona otro.' });
    chatForm.querySelector('button[type="submit"]').disabled = true;
});
