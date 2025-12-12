# Deployment Guide: Node.js + WebSockets + Gemini

## ⚠️ Important: Vercel Limitation
The multiplayer features of this game (Lobby, Chat, Real-time status) rely on **Socket.io**.
Vercel is a **Serverless** platform, which means:
1. It kills server processes after 10-60 seconds.
2. It does **not** support the persistent WebSocket connections required for this game.

**You cannot host the full multiplayer game on Vercel.**

## ✅ Recommended Solution: Render or Railway
To fix the `WebSocket connection failed` errors, you must deploy this repository to a **Node.js Platform-as-a-Service (PaaS)**. These platforms act just like your local computer, keeping the server running 24/7.

### Option 1: Render (Free Tier available)
1. Push your code to GitHub.
2. Go to [render.com](https://render.com) and sign up.
3. Click **New +** -> **Web Service**.
4. Connect your GitHub repository.
5. Settings:
   - **Environment:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
6. **Environment Variables:**
   Add these in the "Environment" tab:
   - `GEMINI_API_KEY`: Your Google Gemini API Key
   - `SUPABASE_URL`: Your Supabase URL
   - `SUPABASE_KEY`: Your Supabase Anon Key
7. Deploy!
8. Use the URL Render gives you (e.g., `https://ia-game.onrender.com`) instead of Vercel.

### Option 2: Railway
1. Go to [railway.app](https://railway.app).
2. "Start a New Project" -> "Deploy from GitHub repo".
3. Select your repository.
4. Railway will auto-detect Node.js.
5. Go to **Settings** -> **Variables** and add:
   - `PORT`: `3000` (Optional, Railway often sets its own)
   - `GEMINI_API_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_KEY`
6. Railway will deploy and provide a public URL.

## Summary
- **Do not split** frontend and backend unless you are an advanced user.
- Deploy the **entire repository** to Render or Railway.
- Use that single URL for everything. It serves both the `public/` web page and the socket server.
