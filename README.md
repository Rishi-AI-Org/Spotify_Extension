# Groovy Spotify

Backend + Android collector + (future) web dashboard for crowdsourcing
"groovy parts" (the hook segment a DJ keeps; the boring parts they skip)
across Spotify tracks.

## Architecture

- `src/` — Express/TypeScript backend on Supabase. Ingests playback events,
  resolves tracks to Spotify URIs via Client Credentials search,
  aggregates per-track intime/outtime with a ±1σ outlier filter.
- `android/` — `NotificationListenerService`-based collector. Captures
  Spotify skip/seek events with zero Spotify-developer-quota usage
  (bypasses the Feb-2026 dev-mode 5-user cap). See `android/README.md`.
- `migrations/` — additional SQL migrations on top of `database-setup.sql`.

## Features

- 🎵 **Groovy Parts API** - Store and retrieve groovy timestamps for Spotify tracks
- 📥 **Crowdsourced ingest** - `POST /api/events/batch` from Android collectors
- 📊 **Aggregates** - `POST /api/aggregates/refresh` and `GET /api/aggregates`
- 🔐 **Spotify OAuth** - Authenticate users with Spotify (legacy)
- 💾 **Supabase Database** - PostgreSQL database for storing groovy data
- 🚀 **Render Deployment** - Easy deployment to Render.com

## Tech Stack

- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Database**: Supabase (PostgreSQL)
- **Deployment**: Render.com
- **Authentication**: Spotify OAuth 2.0

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Environment Variables

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

Required variables:
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_KEY` - Your Supabase service role key
- `SPOTIFY_CLIENT_ID` - From Spotify Developer Dashboard
- `SPOTIFY_CLIENT_SECRET` - From Spotify Developer Dashboard
- `SPOTIFY_REDIRECT_URI` - OAuth callback URL

### 3. Set Up Database

Run the database setup script to create tables:

```bash
npm run db:setup
```

**Or manually** run this SQL in Supabase SQL Editor:

```sql
CREATE TABLE IF NOT EXISTS groovy_parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id TEXT UNIQUE NOT NULL,
  track_name TEXT,
  artist_name TEXT,
  intime INTEGER NOT NULL,
  outtime INTEGER NOT NULL,
  source TEXT DEFAULT 'user',
  confidence_score FLOAT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_track_id ON groovy_parts(track_id);
CREATE INDEX IF NOT EXISTS idx_source ON groovy_parts(source);
```

### 4. Run Locally

**Development mode** (auto-restart on changes):
```bash
npm run dev
```

**Production mode**:
```bash
npm run build
npm start
```

Server runs on `http://localhost:3000`

## API Endpoints

### Groovy Parts

#### Get Groovy Data
```
GET /api/groovy/:trackId
```

Returns groovy part timestamps for a track.

**Response:**
```json
{
  "intime": 90000,
  "outtime": 180000,
  "source": "user",
  "confidence_score": 0.95
}
```

#### Save Groovy Data
```
POST /api/groovy
Content-Type: application/json

{
  "track_id": "3n3Ppam7vgaVa1iaRUc9Lp",
  "track_name": "Mr. Brightside",
  "artist_name": "The Killers",
  "intime": 90000,
  "outtime": 180000,
  "source": "user"
}
```

#### List All Groovy Parts
```
GET /api/groovy?limit=100&offset=0
```

#### Delete Groovy Data
```
DELETE /api/groovy/:trackId
```

### Authentication

#### Spotify Login
```
GET /auth/login
```
Redirects to Spotify authorization page.

#### OAuth Callback
```
GET /auth/callback?code=...
```
Handles Spotify OAuth callback and displays access token.

#### Health Check
```
GET /auth/health
```
Check if Spotify credentials are configured.

## Deployment to Render

### Step 1: Create Render Account
1. Go to [render.com](https://render.com)
2. Sign up with GitHub

### Step 2: Create New Web Service
1. Click "New +" → "Web Service"
2. Connect your GitHub repository
3. Fill in:
   - **Name**: `groovy-spotify-backend` (or your choice)
   - **Region**: Choose closest to you
   - **Branch**: `main`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`

### Step 3: Add Environment Variables
In Render dashboard, add these environment variables:

```
NODE_ENV=production
PORT=10000
SUPABASE_URL=https://evvsjicvyidfyaiczcqg.supabase.co
SUPABASE_KEY=your_supabase_key
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
SPOTIFY_REDIRECT_URI=https://your-app.onrender.com/auth/callback
```

### Step 4: Deploy
1. Click "Create Web Service"
2. Wait for deployment (~2-3 minutes)
3. Your app will be live at `https://your-app.onrender.com`

### Step 5: Update Spotify Dashboard
1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Open your app settings
3. Add redirect URI: `https://your-app.onrender.com/auth/callback`
4. Save

## Testing

### Test Health Check
```bash
curl https://your-app.onrender.com/
```

### Test Groovy API
```bash
# Save groovy data
curl -X POST https://your-app.onrender.com/api/groovy \
  -H "Content-Type: application/json" \
  -d '{
    "track_id": "test123",
    "intime": 60000,
    "outtime": 120000
  }'

# Get groovy data
curl https://your-app.onrender.com/api/groovy/test123
```

### Test Spotify OAuth
Open in browser:
```
https://your-app.onrender.com/auth/login
```

## Database Schema

### groovy_parts Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `track_id` | TEXT | Spotify track ID (unique) |
| `track_name` | TEXT | Track name (optional) |
| `artist_name` | TEXT | Artist name (optional) |
| `intime` | INTEGER | Start time in milliseconds |
| `outtime` | INTEGER | End time in milliseconds |
| `source` | TEXT | 'user' or 'global' |
| `confidence_score` | FLOAT | Algorithm confidence (0-1) |
| `created_at` | TIMESTAMP | Creation timestamp |
| `updated_at` | TIMESTAMP | Last update timestamp |

## Troubleshooting

### Database Connection Error
- Verify `SUPABASE_URL` and `SUPABASE_KEY` are correct
- Check Supabase project is active
- Ensure table exists (run `npm run db:setup`)

### Spotify OAuth Fails
- Verify `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET`
- Check redirect URI matches exactly in Spotify Dashboard
- Ensure redirect URI uses HTTPS (not HTTP) in production

### CORS Errors
- Backend allows all origins by default
- Check browser console for specific CORS error
- Verify extension manifest has correct `host_permissions`

## Project Structure

```
groovy-backend/
├── src/
│   ├── db/
│   │   ├── supabase.ts       # Supabase client
│   │   └── setup.ts          # Database setup script
│   ├── routes/
│   │   ├── auth.ts           # Spotify OAuth routes
│   │   └── groovy.ts         # Groovy data CRUD routes
│   ├── types/
│   │   └── index.ts          # TypeScript interfaces
│   └── index.ts              # Main Express server
├── dist/                     # Compiled JavaScript (gitignored)
├── .env                      # Environment variables (gitignored)
├── package.json              # Dependencies
├── tsconfig.json             # TypeScript config
├── render.yaml               # Render deployment config
└── README.md                 # This file
```

## Security Notes

- ⚠️ Never commit `.env` file to git
- ✅ Use service role key on backend only
- ✅ Use anon key in browser extension
- ✅ HTTPS required in production
- ✅ Environment variables stored securely in Render

## License

MIT
