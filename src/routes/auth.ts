import { Router, Request, Response } from 'express';
import axios from 'axios';

const router = Router();

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID!;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET!;
const SPOTIFY_REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI!;

// Scopes needed for Groovy extension
const SCOPES = [
  'user-read-playback-state',
  'user-read-currently-playing',
  'user-read-playback-position',
  'user-modify-playback-state'
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

    // Calculate token expiry timestamp
    const expiresAt = Date.now() + (expires_in * 1000);

    // Send success page with token data for extension content script to capture
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>Groovy - Login Successful</title>
          <style>
            body {
              font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              max-width: 600px;
              margin: 50px auto;
              padding: 20px;
              background: #121212;
              color: #fff;
              text-align: center;
            }
            .success {
              color: #1db954;
              font-size: 48px;
              margin-bottom: 20px;
            }
            h1 {
              color: #1db954;
              margin-bottom: 10px;
            }
            .message {
              font-size: 18px;
              margin: 20px 0;
              color: #b3b3b3;
            }
            .loader {
              border: 3px solid #282828;
              border-top: 3px solid #1db954;
              border-radius: 50%;
              width: 40px;
              height: 40px;
              animation: spin 1s linear infinite;
              margin: 30px auto;
            }
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
            .note {
              color: #666;
              font-size: 14px;
              margin-top: 30px;
            }
          </style>
        </head>
        <body>
          <!-- Token data for extension content script -->
          <div id="groovy-auth-data"
               data-access-token="${access_token}"
               data-refresh-token="${refresh_token}"
               data-expires-at="${expiresAt}"
               style="display: none;">
          </div>

          <div class="success">✓</div>
          <h1>Login Successful!</h1>
          <p id="status-message" class="message">Saving your credentials...</p>
          <div id="loader" class="loader"></div>
          <p class="note">This window will close automatically.</p>

          <script>
            // The extension's content script will read the data from #groovy-auth-data
            // and save it to chrome.storage. This page just shows a nice UI.

            // Fallback: if extension doesn't close the tab after 5 seconds, show manual close message
            setTimeout(() => {
              const loader = document.getElementById('loader');
              const message = document.getElementById('status-message');
              if (loader && message) {
                loader.style.display = 'none';
                message.textContent = 'Done! You can close this tab and return to Spotify.';
              }
            }, 5000);
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
 * POST /auth/refresh
 * Refresh access token using refresh token
 */
router.post('/refresh', async (req: Request, res: Response) => {
  const { refresh_token } = req.body;

  if (!refresh_token) {
    return res.status(400).json({ error: 'Missing refresh_token' });
  }

  try {
    const response = await axios.post(
      'https://accounts.spotify.com/api/token',
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refresh_token
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

    const { access_token, refresh_token: new_refresh_token, expires_in } = response.data;

    // Calculate expiry timestamp
    const expires_at = Date.now() + (expires_in * 1000);

    res.json({
      access_token,
      refresh_token: new_refresh_token || refresh_token,
      expires_at
    });
  } catch (error: any) {
    console.error('Error refreshing token:', error.response?.data || error.message);
    res.status(401).json({
      error: 'Failed to refresh token',
      details: error.response?.data?.error_description || error.message
    });
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
