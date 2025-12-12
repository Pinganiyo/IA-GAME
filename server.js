import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { supabase } from './supabase.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// Configuración de rutas
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, 'public');
const narrativePromptPath = path.join(__dirname, 'promt3.txt');

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// --- CACHE & UTILIDADES ---
let narrativePromptCache = null;

async function getNarrativePrompt() {
  if (narrativePromptCache) return narrativePromptCache;
  try {
    narrativePromptCache = await fs.readFile(narrativePromptPath, 'utf-8');
  } catch (error) {
    console.warn('⚠️ No se encontró promt3.txt, usando default.');
    narrativePromptCache = 'Eres un narrador de juegos de rol. Responde en JSON.';
  }
  return narrativePromptCache;
}

// --- SUPABASE HELPERS ---

async function loadGameDefinition(gameId) {
  if (!gameId) throw new Error('Game ID requerido');

  const { data, error } = await supabase
    .from('games')
    .select('*')
    .eq('id', gameId)
    .single();

  if (error || !data) {
    throw new Error(`Game not found: ${gameId}`);
  }
  return data.data; // The 'data' column holds the JSON definition
}

async function listGames() {
  const { data, error } = await supabase
    .from('games')
    .select('id, title, summary, image');

  if (error) {
    console.error('Error listing games:', error);
    return [];
  }
  return data.sort((a, b) => a.title.localeCompare(b.title));
}

// --- CONFIGURACIÓN GEMINI ---
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) console.error("❌ FALTA GEMINI_API_KEY en .env");

const genAI = new GoogleGenerativeAI(apiKey);

// 1. GENERACIÓN DE TEXTO (GEMINI 1.5)
async function requestGeminiChat({ playerMessage, gameState, gameDefinition, narrativePrimer, globalContext }) {
  // Configuramos el modelo para que FUERCE la respuesta en JSON
  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || "gemini-1.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
      // Definimos el esquema para asegurar que siempre devuelva estos campos
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          message: { type: SchemaType.STRING },
          imagePrompt: { type: SchemaType.STRING },
        },
        required: ["message", "imagePrompt"]
      }
    }
  });

  const systemPrompt = `
    ${narrativePrimer}
    
    INSTRUCCIONES TÉCNICAS:
    1. Actúa como el narrador del juego basado en la definición proporcionada.
    2. Tu respuesta DEBE ser un objeto JSON válido con:
       - "message": La narración de la historia.
       - "imagePrompt": Una descripción visual detallada en INGLÉS (para el generador de imágenes) de la escena actual.
    3. Contexto del juego: ${JSON.stringify(gameDefinition)}
    4. Estado actual (si existe): ${gameState ? JSON.stringify(gameState) : "Inicio del juego"}
    
    HISTORIA PREVIA (Contexto Global de todos los jugadores):
    ${globalContext || "No history yet."}
  `;

  const chat = model.startChat({
    history: [
      { role: "user", parts: [{ text: systemPrompt }] }
    ]
  });

  const result = await chat.sendMessage(playerMessage);

  // Como forzamos JSON en la config, podemos parsear directamente
  try {
    return JSON.parse(result.response.text());
  } catch (error) {
    console.error("Error parseando JSON de Gemini:", error);
    // Fallback por si acaso
    return {
      message: result.response.text(),
      imagePrompt: "Dark atmospheric scene"
    };
  }
}

// 2. GENERACIÓN DE IMAGEN (GOOGLE IMAGEN 3 VIA REST)
// Nota: El SDK de Node a veces no tiene el helper de imagen expuesto claramente, 
// usar REST es más seguro para asegurar que usamos el modelo 'imagen-3.0'
// REEMPLAZA LA FUNCIÓN DE IMAGEN ANTERIOR CON ESTA:

async function generateImageWithGemini(prompt) {
  // Pollinations.ai no necesita API Key, es gratis y muy rápido.
  // Usamos 'encodeURIComponent' para que el texto sea seguro en una URL.
  const safePrompt = encodeURIComponent(prompt + " high quality, atmospheric, 8k, rpg style art");

  // Construimos la URL. 
  // model=flux da resultados MUY buenos para fantasía.
  // width/height 1024x576 es ratio 16:9 (cine).
  const imageUrl = `https://image.pollinations.ai/prompt/${safePrompt}?width=1024&height=576&seed=${Math.floor(Math.random() * 1000)}&nologo=true&model=flux`;

  // Pollinations devuelve la imagen directamente en la URL, 
  // pero para mantener tu frontend feliz, devolvemos el objeto como espera.
  return {
    imageUrl: imageUrl
  };
}


async function getNarrativePrompt() {
  try {
    return await fs.readFile(path.join(__dirname, 'promt3.txt'), 'utf-8');
  } catch (err) {
    console.error('Error reading prompt file:', err);
    return "Eres un narrador de juegos de rol. Guía a los jugadores a través de una aventura.";
  }
}

async function getMultiplayerNarrativePrompt() {
  try {
    return await fs.readFile(path.join(__dirname, 'promt3-multiplayer.txt'), 'utf-8');
  } catch (err) {
    console.error('Error reading multiplayer prompt file:', err);
    return await getNarrativePrompt();
  }
}

// --- RUTAS API ---

app.get('/api/games', async (_req, res) => {
  const games = await listGames();
  res.json({ games });
});

app.get('/api/games/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('games')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !data) return res.status(404).json({ error: 'Game not found' });

    res.json({
      id: data.id,
      definition: data.data,
      title: data.title,
      image: data.image
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/chat', async (req, res) => {
  try {
    const { message, gameState, gameId, sessionId, playerId } = req.body;

    // 1. Cargamos datos
    // Select prompt based on session type
    const promptLoader = sessionId ? getMultiplayerNarrativePrompt() : getNarrativePrompt();

    const [gameDefinition, narrativePrimer] = await Promise.all([
      loadGameDefinition(gameId),
      promptLoader
    ]);

    // 2. Fetch Chat History (Global Context)
    // We get the last 5 messages from *every* player in this session to give the AI full context.
    let globalContext = "";
    if (sessionId) {
      // Store the new User message first
      if (playerId) {
        await Promise.all([
          supabase.from('chat_history').insert({
            session_id: sessionId,
            player_id: playerId,
            role: 'user',
            content: message
          }),
          // Update session activity to prevent cleanup
          supabase.from('sessions')
            .update({ last_activity: new Date().toISOString() })
            .eq('id', sessionId)
        ]);
      }

      // Fetch recent history
      const { data: history } = await supabase
        .from('chat_history')
        .select('role, content, players(name)')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false })
        .limit(20); // Last 20 messages from everyone

      if (history) {
        // Reverse to chronological order
        globalContext = history.reverse().map(msg => {
          const speaker = msg.role === 'user' ? (msg.players?.name || 'Player') : 'GM';
          return `${speaker}: ${msg.content}`;
        }).join('\n');
      }
    }

    // 3. Obtenemos texto e idea visual de Gemini
    const chatResponse = await requestGeminiChat({
      playerMessage: message,
      gameState,
      gameDefinition,
      narrativePrimer,
      globalContext // Pass this new shared context
    });

    // 4. Store AI Response
    if (sessionId) {
      await supabase.from('chat_history').insert({
        session_id: sessionId,
        role: 'assistant',
        content: chatResponse.message
      });
    }

    res.json(chatResponse); // Devuelve { message, imagePrompt }
  } catch (error) {
    console.error('Chat Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/image', async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt requerido' });

    const imageResult = await generateImageWithGemini(prompt);

    res.json(imageResult);
  } catch (error) {
    console.error('Image Error:', error);
    // Fallback visual si falla la API (placeholder)
    res.status(500).json({
      error: 'Falló la generación de imagen',
      imageUrl: 'https://placehold.co/1024x576/333/FFF?text=Error+Generando+Imagen'
    });
  }
});

// --- SOCKET.IO LOGIC ---
// --- SOCKET.IO LOGIC ---

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  socket.on('inspect_lobby', async ({ gameId, roomCode }) => {
    try {
      let query = supabase.from('sessions').select('*');

      if (roomCode) {
        query = query.eq('room_code', roomCode);
      } else if (gameId) {
        query = query.eq('game_id', gameId).eq('status', 'waiting');
      } else {
        return socket.emit('error', { message: 'Must provide gameId or roomCode' });
      }

      const { data: session, error } = await query.single();

      if (error || !session) {
        return socket.emit('lobby_info', { exists: false });
      }

      const { data: players } = await supabase
        .from('players')
        .select('*')
        .eq('session_id', session.id);

      socket.emit('lobby_info', {
        exists: true,
        session,
        players
      });

    } catch (error) {
      console.error('Error inspecting lobby:', error);
      socket.emit('error', { message: 'Error retrieving lobby info' });
    }
  });

  socket.on('join_lobby', async ({ gameId, roomCode, playerName, characterName }) => {
    try {
      console.log(`Player ${playerName} joining game ${gameId || 'via code ' + roomCode}`);

      if (!characterName) {
        return socket.emit('error', { message: 'Character name is required' });
      }

      // 1. Find or create a waiting session
      let session;

      if (roomCode) {
        const { data: existingSession, error } = await supabase
          .from('sessions')
          .select('*')
          .eq('room_code', roomCode)
          .single();

        if (error || !existingSession) return socket.emit('error', { message: 'Invalid Room Code' });
        session = existingSession;
        // Ensure gameId is set if we joined via code
        gameId = session.game_id;
      } else {
        // Find existing waiting session for this game
        let { data: existingSession } = await supabase
          .from('sessions')
          .select('*')
          .eq('game_id', gameId)
          .eq('status', 'waiting')
          .single();

        if (existingSession) {
          session = existingSession;
        } else {
          // Create new session
          const { data: newSession, error: createError } = await supabase
            .from('sessions')
            .insert({
              game_id: gameId,
              status: 'waiting',
              room_code: generateRoomCode()
            })
            .select()
            .single();

          if (createError) throw createError;
          session = newSession;
        }
      }

      // 2. Validate Character availability
      const { data: existingPlayers } = await supabase
        .from('players')
        .select('character')
        .eq('session_id', session.id);

      const isTaken = existingPlayers.some(p => p.character === characterName);
      if (isTaken) {
        return socket.emit('error', { message: `Character ${characterName} is already taken!` });
      }

      // 3. Add player to session
      const { data: player, error: playerError } = await supabase
        .from('players')
        .insert({
          session_id: session.id,
          name: playerName,
          socket_id: socket.id,
          character: characterName,
          status: 'connected'
        })
        .select()
        .single();

      if (playerError) throw playerError;

      // 4. Join socket room
      socket.join(session.id);

      // 5. Broadcast updated player list to room
      const { data: allPlayers } = await supabase
        .from('players')
        .select('*')
        .eq('session_id', session.id);

      io.to(session.id).emit('lobby_update', {
        sessionId: session.id,
        roomCode: session.room_code,
        players: allPlayers
      });

      // Send initial success to joining player
      socket.emit('joined_lobby', {
        sessionId: session.id,
        roomCode: session.room_code,
        playerId: player.id,
        players: allPlayers,
        isHost: allPlayers[0].id === player.id // Simple host check: first player in list
      });

      // 6. Check for Auto-Start (Full Lobby)
      try {
        const gameDef = await loadGameDefinition(gameId);
        const maxPlayers = gameDef.Personajes?.length || 5;

        if (allPlayers.length >= maxPlayers) {
          io.to(session.id).emit('start_timer', { duration: 5 });
          // Start actual game after 5s? 
          // Ideally we handle this via client timer finishing or server timeout.
          // For robustness, let's just let the clients know they should count down.
          // The HOST client can then emit 'start_game' automatically, or server can do it.
          // Server doing it is safer.
          setTimeout(async () => {
            // Check if still full
            const { count } = await supabase
              .from('players')
              .select('*', { count: 'exact', head: true })
              .eq('session_id', session.id);

            if (count >= maxPlayers) {
              io.to(session.id).emit('game_started', { gameId: session.game_id });
              await supabase.from('sessions').update({ status: 'playing' }).eq('id', session.id);
            }
          }, 5000);
        }
      } catch (e) {
        console.error("Auto-start check failed", e);
      }

    } catch (error) {
      console.error('Error joining lobby:', error);
      socket.emit('error', { message: 'Failed to join lobby: ' + error.message });
    }
  });

  socket.on('leave_lobby', async ({ sessionId, playerId }) => {
    try {
      await supabase.from('players').delete().eq('id', playerId);
      socket.leave(sessionId);

      const { data: remainingPlayers } = await supabase
        .from('players')
        .select('*')
        .eq('session_id', sessionId);

      if (!remainingPlayers || remainingPlayers.length === 0) {
        await supabase.from('sessions').delete().eq('id', sessionId);
      } else {
        io.to(sessionId).emit('lobby_update', {
          sessionId,
          players: remainingPlayers
        });
      }

      socket.emit('left_lobby'); // Confirm to sender
    } catch (e) {
      console.error("Error leaving lobby:", e);
    }
  });

  socket.on('start_game', async ({ sessionId }) => {
    // Validate host? Optional for now.
    const { error } = await supabase
      .from('sessions')
      .update({ status: 'playing' })
      .eq('id', sessionId);

    if (!error) {
      io.to(sessionId).emit('game_started', { sessionId });
    }
  });

  socket.on('disconnect', async () => {
    console.log('Client disconnected:', socket.id);
    try {
      // Find player by socket_id
      const { data: player, error: playerError } = await supabase
        .from('players')
        .select('*')
        .eq('socket_id', socket.id)
        .single();

      if (playerError || !player) {
        // console.log('Disconnected client was not an active player in a session.');
        return;
      }

      // Remove player from the session
      await supabase.from('players').delete().eq('id', player.id);

      // Get remaining players in the session
      const { data: remainingPlayers } = await supabase
        .from('players')
        .select('*')
        .eq('session_id', player.session_id);

      if (!remainingPlayers || remainingPlayers.length === 0) {
        // If no players left, delete the session
        await supabase.from('sessions').delete().eq('id', player.session_id);
        console.log(`Session ${player.session_id} deleted due to no remaining players.`);
      } else {
        // Broadcast updated player list to the room
        io.to(player.session_id).emit('lobby_update', {
          sessionId: player.session_id,
          players: remainingPlayers
        });
        console.log(`Player ${player.name} left session ${player.session_id}. Remaining players: ${remainingPlayers.length}`);
      }
    } catch (error) {
      console.error('Error handling disconnect:', error);
    }
  });
});

// --- CLEANUP JOB ---
// --- CLEANUP JOB ---
async function cleanupInactiveSessions() {
  const TIMEOUT_MINUTES = 4;
  const cutoffTime = new Date(Date.now() - TIMEOUT_MINUTES * 60 * 1000).toISOString();

  try {
    // We assume 'last_activity' exists. If not, this might fail or we should fallback.
    // To be safe, we'll try to use 'last_activity' first.

    // 1. Delete sessions with no activity for N minutes (both waiting and playing)
    // We use a broader check here.
    const { error } = await supabase
      .from('sessions')
      .delete()
      .lt('last_activity', cutoffTime);

    if (error) {
      console.error('Error cleaning sessions (check if last_activity column exists):', error);

      // Fallback for 'waiting' sessions based on created_at if last_activity doesn't exist
      const { error: fallbackError } = await supabase
        .from('sessions')
        .delete()
        .eq('status', 'waiting')
        .lt('created_at', cutoffTime);

      if (fallbackError) console.error('Fallback cleanup failed:', fallbackError);
    } else {
      // console.log('Cleaned up inactive sessions');
    }

  } catch (err) {
    console.error('Cleanup Job Failed:', err);
  }
}

// Run cleanup every minute
setInterval(cleanupInactiveSessions, 60 * 1000);

// Servir estáticos
app.use(express.static(publicDir));
app.get('/', (_req, res) => res.sendFile(path.join(publicDir, 'select.html')));
app.get('/play', (_req, res) => res.sendFile(path.join(publicDir, 'main.html')));

httpServer.listen(PORT, () => {
  console.log(`🚀 Servidor listo en http://localhost:${PORT}`);
  console.log(`🤖 Modo: ${process.env.GEMINI_API_KEY ? 'Online (Gemini Activo)' : 'Offline'}`);
});