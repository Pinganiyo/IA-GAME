const grid = document.querySelector('#game-grid');
const template = document.querySelector('#game-card-template');

async function fetchGames() {
  const response = await fetch('/api/games');
  if (!response.ok) {
    throw new Error('Unable to fetch game list.');
  }
  const data = await response.json();
  return data.games ?? [];
}

function navigateToPlay(gameId) {
  const url = new URL('/play', window.location.origin);
  url.searchParams.set('gameId', gameId);
  window.location.href = url.toString();
}

function renderGameCard(game) {
  const node = template.content.cloneNode(true);
  const img = node.querySelector('.game-image');
  if (game.image) {
    img.src = game.image;
  } else {
    img.style.display = 'none';
  }
  node.querySelector('.game-title').textContent = game.title;
  node.querySelector('.game-rounds').textContent = game.totalRounds
    ? `${game.totalRounds} rondas` : 'Rondas: n/a';
  node.querySelector('.game-summary').textContent = game.summary || 'Sin descripción disponible.';

  // Single Player Button
  node.querySelector('.single-player-button').addEventListener('click', () => navigateToPlay(game.id));

  // Multiplayer Button
  node.querySelector('.multiplayer-button').addEventListener('click', () => navigateToLobby(game.id));

  grid.appendChild(node);
}

function navigateToLobby(gameId) {
  const url = new URL('/lobby.html', window.location.origin);
  url.searchParams.set('gameId', gameId);
  window.location.href = url.toString();
}

async function init() {
  try {
    const games = await fetchGames();
    if (!games.length) {
      const emptyState = document.createElement('p');
      emptyState.className = 'selection-note';
      emptyState.textContent = 'No hay escenarios disponibles. Agrega archivos JSON en la carpeta games/';
      grid.replaceChildren(emptyState);
      return;
    }
    games.forEach(renderGameCard);
  } catch (error) {
    console.error(error);
    const errorState = document.createElement('p');
    errorState.className = 'selection-note';
    errorState.textContent = 'Error cargando los escenarios. Revisa la consola.';
    grid.replaceChildren(errorState);
  }
}

init();
