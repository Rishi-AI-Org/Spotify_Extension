// Groovy Spotify Extension - Background Service Worker
// Handles Spotify API calls, token management, and groovy data prefetching

const CONFIG = {
  BACKEND_URL: 'https://spotify-extension-backend.onrender.com',
  SPOTIFY_API_BASE: 'https://api.spotify.com/v1',
  API_TIMEOUT: 15000,  // 15 seconds timeout for API calls
  BACKEND_TIMEOUT: 30000  // 30 seconds timeout for backend (Render can be slow to wake)
};

// Fetch with timeout wrapper
async function fetchWithTimeout(url, options = {}, timeout = CONFIG.API_TIMEOUT) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Start Spotify OAuth login flow via backend
async function startSpotifyLogin() {
  return new Promise((resolve, reject) => {
    // Open backend login page in a new tab
    const loginUrl = `${CONFIG.BACKEND_URL}/auth/login`;

    chrome.tabs.create({ url: loginUrl }, (tab) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      // Store the tab ID so we can track when login completes
      chrome.storage.local.set({ auth_tab_id: tab.id });

      // The auth-callback.js content script will handle saving tokens
      // and send a 'loginComplete' message when done
      // We'll resolve this promise when that happens

      // Set up a listener for login completion
      const loginCompleteListener = (message, sender, sendResponse) => {
        if (message.action === 'loginComplete') {
          chrome.runtime.onMessage.removeListener(loginCompleteListener);
          resolve({ success: true });
          sendResponse({ received: true });
        }
      };

      chrome.runtime.onMessage.addListener(loginCompleteListener);

      // Timeout after 5 minutes
      setTimeout(() => {
        chrome.runtime.onMessage.removeListener(loginCompleteListener);
        reject(new Error('Login timeout'));
      }, 300000);
    });
  });
}

// Get valid access token (refresh if needed)
async function getValidToken() {
  const data = await chrome.storage.local.get([
    'spotify_access_token',
    'spotify_refresh_token',
    'spotify_token_expires_at'
  ]);

  if (!data.spotify_access_token) {
    return null;
  }

  // Check if token is expired (with 5 minute buffer)
  if (Date.now() >= data.spotify_token_expires_at - 300000) {
    try {
      return await refreshAccessToken();
    } catch (error) {
      console.error('Failed to refresh token:', error);
      return null;
    }
  }

  return {
    access_token: data.spotify_access_token,
    refresh_token: data.spotify_refresh_token,
    expires_at: data.spotify_token_expires_at
  };
}

// Refresh access token via backend
async function refreshAccessToken() {
  const { spotify_refresh_token } = await chrome.storage.local.get('spotify_refresh_token');

  if (!spotify_refresh_token) {
    throw new Error('No refresh token available');
  }

  const response = await fetchWithTimeout(`${CONFIG.BACKEND_URL}/auth/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      refresh_token: spotify_refresh_token
    })
  }, CONFIG.BACKEND_TIMEOUT);

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to refresh token');
  }

  const tokenData = await response.json();

  // Save new tokens
  await chrome.storage.local.set({
    spotify_access_token: tokenData.access_token,
    spotify_refresh_token: tokenData.refresh_token || spotify_refresh_token,
    spotify_token_expires_at: tokenData.expires_at
  });

  return {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token || spotify_refresh_token,
    expires_at: tokenData.expires_at
  };
}

// Fetch current playing track from Spotify API
async function getCurrentTrack() {
  const token = await getValidToken();
  if (!token) {
    throw new Error('Not authenticated');
  }

  const response = await fetchWithTimeout(`${CONFIG.SPOTIFY_API_BASE}/me/player/currently-playing`, {
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

  const response = await fetchWithTimeout(`${CONFIG.SPOTIFY_API_BASE}/me/player/queue`, {
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
    const response = await fetchWithTimeout(`${CONFIG.BACKEND_URL}/api/groovy/${trackId}`, {}, CONFIG.BACKEND_TIMEOUT);

    if (response.status === 404) {
      return null; // No groovy data for this track
    }

    if (!response.ok) {
      // Log more details about the error
      const errorText = await response.text().catch(() => 'Unable to read response');
      console.warn(`Groovy data fetch failed (${response.status}): ${errorText}`);
      return null; // Return null instead of throwing - non-critical error
    }

    return await response.json();
  } catch (error) {
    // Handle timeout specifically
    if (error.name === 'AbortError') {
      console.warn('Groovy data fetch timed out for track:', trackId);
    } else {
      console.warn('Error fetching groovy data:', error.message);
    }
    return null; // Always return null on error - don't crash
  }
}

// Save groovy data to backend
async function saveGroovyData(trackId, trackName, artistName, intime, outtime) {
  const response = await fetchWithTimeout(`${CONFIG.BACKEND_URL}/api/groovy`, {
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
  }, CONFIG.BACKEND_TIMEOUT);

  if (!response.ok) {
    throw new Error('Failed to save groovy data');
  }

  return await response.json();
}

// Prefetch groovy data for current track and queue
async function prefetchGroovyData() {
  try {
    const queueData = await getQueue().catch(err => {
      console.warn('Failed to get queue for prefetch:', err.message);
      return null;
    });

    if (!queueData) {
      return {}; // Can't prefetch without queue
    }

    const trackIds = [];

    if (queueData.currently_playing) {
      trackIds.push(queueData.currently_playing.id);
    }

    // Add next few tracks from queue
    if (queueData.queue) {
      for (let i = 0; i < Math.min(5, queueData.queue.length); i++) {
        trackIds.push(queueData.queue[i].id);
      }
    }

    if (trackIds.length === 0) {
      return {}; // No tracks to prefetch
    }

    // Fetch groovy data for all tracks in parallel (each handles its own errors)
    const groovyResults = await Promise.all(
      trackIds.map(id => getGroovyData(id))
    );

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
    console.warn('Error in prefetchGroovyData:', error.message);
    return {};
  }
}

// Seek to position in currently playing track
async function seekToPosition(positionMs) {
  const token = await getValidToken();
  if (!token) {
    throw new Error('Not authenticated');
  }

  const response = await fetchWithTimeout(`${CONFIG.SPOTIFY_API_BASE}/me/player/seek?position_ms=${positionMs}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token.access_token}`
    }
  });

  if (!response.ok && response.status !== 204) {
    throw new Error('Failed to seek');
  }

  return true;
}

// Skip to next track
async function skipToNext() {
  const token = await getValidToken();
  if (!token) {
    throw new Error('Not authenticated');
  }

  const response = await fetchWithTimeout(`${CONFIG.SPOTIFY_API_BASE}/me/player/next`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token.access_token}`
    }
  });

  if (!response.ok && response.status !== 204) {
    throw new Error('Failed to skip to next');
  }

  return true;
}

// Logout - clear stored tokens
async function logout() {
  await chrome.storage.local.remove([
    'spotify_access_token',
    'spotify_refresh_token',
    'spotify_token_expires_at',
    'prefetched_groovy',
    'auth_tab_id'
  ]);
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
          await startSpotifyLogin();
          return { success: true };

        case 'loginComplete':
          // Close the auth tab if we know its ID
          const { auth_tab_id } = await chrome.storage.local.get('auth_tab_id');
          if (auth_tab_id) {
            try {
              await chrome.tabs.remove(auth_tab_id);
            } catch (e) {
              // Tab might already be closed
            }
            await chrome.storage.local.remove('auth_tab_id');
          }
          return { success: true };

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

        case 'seekToPosition':
          await seekToPosition(request.positionMs);
          return { success: true };

        case 'skipToNext':
          await skipToNext();
          return { success: true };

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
