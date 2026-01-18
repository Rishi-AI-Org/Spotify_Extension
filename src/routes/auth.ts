import { Router, Request, Response } from 'express';
import axios from 'axios';

const router = Router();

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID!;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET!;
const SPOTIFY_REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI!;

// Scopes needed for reading queue (read-only)
const SCOPES = [
  'user-read-playback-state',
  'user-read-currently-playing'
].join(' ');

/**
 * GET /auth/login
 * Redirect to Spotify authorization page
 */
router.get('/login', (req: Request, res: Response) => {
  const state = generateRandomString(16);

  const authUrl = 'https://accounts.spotify.com/authorize?' +
    new URLSearchParams({
      response_type: 'code',
      client_id: SPOTIFY_CLIENT_ID,
      scope: SCOPES,
      redirect_uri: SPOTIFY_REDIRECT_URI,
      state: state
    });

  res.redirect(authUrl);
});

/**
 * GET /auth/callback
 * Spotify OAuth callback
 */
router.get('/callback', async (req: Request, res: Response) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.send(`
      <html>
        <body>
          <h1>Authorization Failed</h1>
          <p>Error: ${error}</p>
          <a href="/">Try again</a>
        </body>
      </html>
    `);
  }

  if (!code) {
    return res.status(400).send('Missing authorization code');
  }

  try {
    // Exchange code for access token
    const response = await axios.post(
      'https://accounts.spotify.com/api/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: code as string,
        redirect_uri: SPOTIFY_REDIRECT_URI
      }),
      {
        headers: {
          'Authorization': 'Basic ' + Buffer.from(
            SPOTIFY_CLIENT_ID + ':' + SPOTIFY_CLIENT_SECRET
          ).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const { access_token, refresh_token, expires_in } = response.data;

    // Send success page with token (user will copy this)
    res.send(`
      <html>
        <head>
          <style>
            body {
              font-family: Arial, sans-serif;
              max-width: 600px;
              margin: 50px auto;
              padding: 20px;
              background: #1a1a1a;
              color: #fff;
            }
            .token-box {
              background: #2a2a2a;
              padding: 15px;
              border-radius: 8px;
              margin: 20px 0;
              word-break: break-all;
              font-family: monospace;
              font-size: 12px;
            }
            button {
              background: #1db954;
              color: white;
              border: none;
              padding: 10px 20px;
              border-radius: 20px;
              cursor: pointer;
              font-size: 14px;
            }
            button:hover {
              background: #1ed760;
            }
            .success {
              color: #1db954;
              font-size: 24px;
              margin-bottom: 10px;
            }
          </style>
        </head>
        <body>
          <div class="success">✅ Authorization Successful!</div>
          <p>Copy your access token below and paste it in the Groovy Spotify extension popup:</p>

          <div class="token-box" id="token">${access_token}</div>

          <button onclick="copyToken()">Copy Token</button>

          <p style="margin-top: 30px; color: #888; font-size: 12px;">
            Note: This token expires in ${expires_in} seconds (${Math.floor(expires_in / 3600)} hours).
            You can close this window after copying the token.
          </p>

          <script>
            function copyToken() {
              const token = document.getElementById('token').textContent;
              navigator.clipboard.writeText(token);
              alert('Token copied to clipboard!');
            }
          </script>
        </body>
      </html>
    `);
  } catch (error: any) {
    console.error('Error exchanging code for token:', error.response?.data || error.message);
    res.status(500).send(`
      <html>
        <body>
          <h1>Error</h1>
          <p>Failed to exchange authorization code for token</p>
          <pre>${JSON.stringify(error.response?.data || error.message, null, 2)}</pre>
        </body>
      </html>
    `);
  }
});

/**
 * GET /auth/health
 * Check if Spotify credentials are configured
 */
router.get('/health', (req: Request, res: Response) => {
  const configured = !!(
    SPOTIFY_CLIENT_ID &&
    SPOTIFY_CLIENT_ID !== 'PLACEHOLDER_UPDATE_AFTER_RENDER_DEPLOYMENT' &&
    SPOTIFY_CLIENT_SECRET &&
    SPOTIFY_CLIENT_SECRET !== 'PLACEHOLDER_UPDATE_AFTER_RENDER_DEPLOYMENT'
  );

  res.json({
    configured,
    redirect_uri: SPOTIFY_REDIRECT_URI,
    message: configured
      ? 'Spotify OAuth is configured'
      : 'Spotify credentials not configured. Update SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET environment variables.'
  });
});

// Helper function
function generateRandomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export default router;
