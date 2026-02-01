// Groovy Spotify Extension - Background Service Worker
// Handles Spotify API calls, token management, and groovy data prefetching

const CONFIG = {
  SPOTIFY_CLIENT_ID: 'a0e35b23c48f47e4be5e6790d3e476d5',
  BACKEND_URL: 'https://spotify-extension-backend.onrender.com',
  SPOTIFY_API_BASE: 'https://api.spotify.com/v1',
  SPOTIFY_AUTH_URL: 'https://accounts.spotify.com/authorize',
  SPOTIFY_TOKEN_URL: 'https://accounts.spotify.com/api/token',
  SCOPES: [
    'user-read-playback-state',
    'user-read-currently-playing',
    'user-read-playback-position'
  ].join(' ')
};

// Generate random string for OAuth state
function generateRandomString(length) {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

// Generate code verifier for PKCE
function generateCodeVerifier() {
  return generateRandomString(128);
}

// Generate code challenge from verifier for PKCE
async function generateCodeChallenge(verifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// Start Spotify OAuth login flow with PKCE
async function startSpotifyLogin() {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = generateRandomString(16);

  // Store code verifier for later use
  await chrome.storage.local.set({
    spotify_code_verifier: codeVerifier,
    spotify_auth_state: state
  });

  const redirectUri = chrome.identity.getRedirectURL();

  const authUrl = new URL(CONFIG.SPOTIFY_AUTH_URL);
  authUrl.searchParams.append('client_id', CONFIG.SPOTIFY_CLIENT_ID);
  authUrl.searchParams.append('response_type', 'code');
  authUrl.searchParams.append('redirect_uri', redirectUri);
  authUrl.searchParams.append('scope', CONFIG.SCOPES);
  authUrl.searchParams.append('state', state);
  authUrl.searchParams.append('code_challenge_method', 'S256');
  authUrl.searchParams.append('code_challenge', codeChallenge);

  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      {
        url: authUrl.toString(),
        interactive: true
      },
      async (redirectUrl) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        if (!redirectUrl) {
          reject(new Error('No redirect URL received'));
          return;
        }

        try {
          const url = new URL(redirectUrl);
          const code = url.searchParams.get('code');
          const returnedState = url.searchParams.get('state');

          // Verify state
          const { spotify_auth_state } = await chrome.storage.local.get('spotify_auth_state');
          if (returnedState !== spotify_auth_state) {
            reject(new Error('State mismatch'));
            return;
          }

          // Exchange code for token
          const token = await exchangeCodeForToken(code, redirectUri);
          resolve(token);
        } catch (error) {
          reject(error);
        }
      }
    );
  });
}

// Exchange authorization code for access token using PKCE
async function exchangeCodeForToken(code, redirectUri) {
  const { spotify_code_verifier } = await chrome.storage.local.get('spotify_code_verifier');

  const response = await fetch(CONFIG.SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: CONFIG.SPOTIFY_CLIENT_ID,
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: redirectUri,
      code_verifier: spotify_code_verifier
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error_description || 'Failed to exchange code for token');
  }

  const tokenData = await response.json();

  // Store token with expiry time
  const tokenWithExpiry = {
    ...tokenData,
    expires_at: Date.now() + (tokenData.expires_in * 1000)
  };

  await chrome.storage.local.set({ spotify_token: tokenWithExpiry });

  // Clean up PKCE data
  await chrome.storage.local.remove(['spotify_code_verifier', 'spotify_auth_state']);

  return tokenWithExpiry;
}

// Refresh access token
async function refreshAccessToken() {
  const { spotify_token } = await chrome.storage.local.get('spotify_token');

  if (!spotify_token?.refresh_token) {
    throw new Error('No refresh token available');
  }

  const response = await fetch(CONFIG.SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: CONFIG.SPOTIFY_CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: spotify_token.refresh_token
    })
  });

  if (!response.ok) {
    throw new Error('Failed to refresh token');
  }

  const tokenData = await response.json();

  const tokenWithExpiry = {
    ...tokenData,
    refresh_token: tokenData.refresh_token || spotify_token.refresh_token,
    expires_at: Date.now() + (tokenData.expires_in * 1000)
  };

  await chrome.storage.local.set({ spotify_token: tokenWithExpiry });

  return tokenWithExpiry;
}

// Get valid access token (refresh if needed)
async function getValidToken() {
  const { spotify_token } = await chrome.storage.local.get('spotify_token');

  if (!spotify_token) {
    return null;
  }

  // Check if token is expired (with 5 minute buffer)
  if (Date.now() >= spotify_token.expires_at - 300000) {
    try {
      return await refreshAccessToken();
    } catch (error) {
      console.error('Failed to refresh token:', error);
      return null;
    }
  }

  return spotify_token;
}

// Fetch current playing track from Spotify API
async function getCurrentTrack() {
  const token = await getValidToken();
  if (!token) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(`${CONFIG.SPOTIFY_API_BASE}/me/player/currently-playing`, {
    headers: {
      'Authorization': `Bearer ${token.access_token}`
    }
  });

  if (response.status === 204) {
    return null; // Nothing playing
  }

  if (!response.ok) {
    throw new Error('Failed to fetch current track');
  }

  const data = await response.json();

  if (!data.item) {
    return null;
  }

  return {
    id: data.item.id,
    name: data.item.name,
    artist: data.item.artists.map(a => a.name).join(', '),
    album: data.item.album.name,
    duration_ms: data.item.duration_ms,
    progress_ms: data.progress_ms,
    is_playing: data.is_playing,
    album_image: data.item.album.images[0]?.url
  };
}

// Fetch queue from Spotify API
async function getQueue() {
  const token = await getValidToken();
  if (!token) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(`${CONFIG.SPOTIFY_API_BASE}/me/player/queue`, {
    headers: {
      'Authorization': `Bearer ${token.access_token}`
    }
  });

  if (!response.ok) {
    throw new Error('Failed to fetch queue');
  }

  const data = await response.json();

  return {
    currently_playing: data.currently_playing ? {
      id: data.currently_playing.id,
      name: data.currently_playing.name,
      artist: data.currently_playing.artists.map(a => a.name).join(', '),
      duration_ms: data.currently_playing.duration_ms
    } : null,
    queue: data.queue.map(item => ({
      id: item.id,
      name: item.name,
      artist: item.artists.map(a => a.name).join(', '),
      duration_ms: item.duration_ms
    }))
  };
}

// Fetch groovy data for a track from backend
async function getGroovyData(trackId) {
  try {
    const response = await fetch(`${CONFIG.BACKEND_URL}/api/groovy/${trackId}`);

    if (response.status === 404) {
      return null; // No groovy data for this track
    }

    if (!response.ok) {
      throw new Error('Failed to fetch groovy data');
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching groovy data:', error);
    return null;
  }
}

// Save groovy data to backend
async function saveGroovyData(trackId, trackName, artistName, intime, outtime) {
  const response = await fetch(`${CONFIG.BACKEND_URL}/api/groovy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      track_id: trackId,
      track_name: trackName,
      artist_name: artistName,
      intime: intime,
      outtime: outtime,
      source: 'user'
    })
  });

  if (!response.ok) {
    throw new Error('Failed to save groovy data');
  }

  return await response.json();
}

// Prefetch groovy data for current track and queue
async function prefetchGroovyData() {
  try {
    const queueData = await getQueue();
    const trackIds = [];

    if (queueData.currently_playing) {
      trackIds.push(queueData.currently_playing.id);
    }

    // Add next few tracks from queue
    for (let i = 0; i < Math.min(5, queueData.queue.length); i++) {
      trackIds.push(queueData.queue[i].id);
    }

    // Fetch groovy data for all tracks in parallel
    const groovyDataPromises = trackIds.map(id => getGroovyData(id));
    const groovyResults = await Promise.all(groovyDataPromises);

    // Store prefetched data
    const prefetchedData = {};
    trackIds.forEach((id, index) => {
      if (groovyResults[index]) {
        prefetchedData[id] = groovyResults[index];
      }
    });

    await chrome.storage.local.set({ prefetched_groovy: prefetchedData });

    return prefetchedData;
  } catch (error) {
    console.error('Error prefetching groovy data:', error);
    return {};
  }
}

// Logout - clear stored tokens
async function logout() {
  await chrome.storage.local.remove(['spotify_token', 'prefetched_groovy']);
}

// Check if user is logged in
async function isLoggedIn() {
  const token = await getValidToken();
  return token !== null;
}

// Message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const handleAsync = async () => {
    try {
      switch (request.action) {
        case 'login':
          const token = await startSpotifyLogin();
          return { success: true, token };

        case 'logout':
          await logout();
          return { success: true };

        case 'isLoggedIn':
          const loggedIn = await isLoggedIn();
          return { success: true, loggedIn };

        case 'getCurrentTrack':
          const track = await getCurrentTrack();
          return { success: true, track };

        case 'getQueue':
          const queue = await getQueue();
          return { success: true, queue };

        case 'getGroovyData':
          const groovyData = await getGroovyData(request.trackId);
          return { success: true, groovyData };

        case 'saveGroovyData':
          const saved = await saveGroovyData(
            request.trackId,
            request.trackName,
            request.artistName,
            request.intime,
            request.outtime
          );
          return { success: true, data: saved };

        case 'prefetchGroovyData':
          const prefetched = await prefetchGroovyData();
          return { success: true, prefetched };

        case 'getPrefetchedGroovy':
          const { prefetched_groovy } = await chrome.storage.local.get('prefetched_groovy');
          return { success: true, prefetched: prefetched_groovy || {} };

        default:
          return { success: false, error: 'Unknown action' };
      }
    } catch (error) {
      console.error('Background script error:', error);
      return { success: false, error: error.message };
    }
  };

  handleAsync().then(sendResponse);
  return true; // Indicates async response
});

// Listen for tab updates to detect Spotify Web Player
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.includes('open.spotify.com')) {
    // Prefetch groovy data when Spotify Web Player is loaded
    const loggedIn = await isLoggedIn();
    if (loggedIn) {
      await prefetchGroovyData();
    }
  }
});

console.log('Groovy Spotify Extension background script loaded');
