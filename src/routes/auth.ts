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

    // Send success page that auto-saves token and closes
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
            }
            .loader {
              border: 3px solid #2a2a2a;
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
          </style>
        </head>
        <body>
          <div class="success">✅</div>
          <h1>Login Successful!</h1>
          <p class="message">Saving your credentials...</p>
          <div class="loader"></div>
          <p style="color: #888; font-size: 14px; margin-top: 30px;">
            This window will close automatically.
          </p>

          <script>
            // Auto-save token to Chrome storage and close window
            const token = '${access_token}';

            // Try to save via Chrome extension API
            if (typeof chrome !== 'undefined' && chrome.storage) {
              chrome.storage.sync.set({ spotifyToken: token }, () => {
                console.log('Token saved!');
                setTimeout(() => window.close(), 1500);
              });
            } else {
              // Fallback: send message to opener window
              if (window.opener) {
                window.opener.postMessage({
                  type: 'SPOTIFY_TOKEN',
                  token: token
                }, '*');
                setTimeout(() => window.close(), 1500);
              } else {
                document.querySelector('.message').textContent = 'Please close this window and click the extension icon again.';
                document.querySelector('.loader').style.display = 'none';
              }
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
