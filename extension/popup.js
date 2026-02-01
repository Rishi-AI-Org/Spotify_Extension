// Groovy Spotify Extension - Popup Script

document.addEventListener('DOMContentLoaded', async () => {
  // DOM Elements
  const loginSection = document.getElementById('login-section');
  const mainSection = document.getElementById('main-section');
  const loginBtn = document.getElementById('login-btn');
  const logoutBtn = document.getElementById('logout-btn');
  const enableToggle = document.getElementById('enable-toggle');
  const trackInfo = document.getElementById('track-info');
  const groovyEditor = document.getElementById('groovy-editor');
  const existingGroovy = document.getElementById('existing-groovy');
  const intimeInput = document.getElementById('intime-input');
  const outtimeInput = document.getElementById('outtime-input');
  const setIntimeBtn = document.getElementById('set-intime-btn');
  const setOuttimeBtn = document.getElementById('set-outtime-btn');
  const saveGroovyBtn = document.getElementById('save-groovy-btn');
  const groovyStatus = document.getElementById('groovy-status');
  const existingIntime = document.getElementById('existing-intime');
  const existingOuttime = document.getElementById('existing-outtime');
  const contributionCount = document.getElementById('contribution-count');
  const statusBar = document.getElementById('status-bar');
  const statusText = document.getElementById('status-text');

  // Current track data
  let currentTrack = null;
  let currentGroovyData = null;

  // Helper: Format milliseconds to MM:SS
  function formatTime(ms) {
    if (!ms && ms !== 0) return '-';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  // Helper: Parse time string (MM:SS or M:SS) to milliseconds
  function parseTime(timeStr) {
    if (!timeStr) return 0;

    const parts = timeStr.trim().split(':');
    if (parts.length !== 2) return 0;

    const minutes = parseInt(parts[0], 10) || 0;
    const seconds = parseInt(parts[1], 10) || 0;

    return (minutes * 60 + seconds) * 1000;
  }

  // Helper: Send message to background script
  function sendMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  // Helper: Send message to content script
  async function sendToContentScript(message) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url?.includes('open.spotify.com')) {
      return { success: false, error: 'Not on Spotify' };
    }

    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tab.id, message, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ success: false, error: chrome.runtime.lastError.message });
        } else {
          resolve(response || { success: false });
        }
      });
    });
  }

  // Show status message
  function showStatus(message, type = 'success', duration = 3000) {
    groovyStatus.textContent = message;
    groovyStatus.className = `status-message ${type}`;
    groovyStatus.classList.remove('hidden');

    if (duration > 0) {
      setTimeout(() => {
        groovyStatus.classList.add('hidden');
      }, duration);
    }
  }

  // Show status bar
  function showStatusBar(message, isError = false) {
    statusText.textContent = message;
    statusBar.className = isError ? 'status-bar error' : 'status-bar';
    statusBar.classList.remove('hidden');

    setTimeout(() => {
      statusBar.classList.add('hidden');
    }, 3000);
  }

  // Check login status and update UI
  async function checkLoginStatus() {
    try {
      const response = await sendMessage({ action: 'isLoggedIn' });

      if (response.success && response.loggedIn) {
        loginSection.classList.add('hidden');
        mainSection.classList.remove('hidden');
        await loadCurrentTrack();
      } else {
        loginSection.classList.remove('hidden');
        mainSection.classList.add('hidden');
      }
    } catch (error) {
      console.error('Error checking login status:', error);
      loginSection.classList.remove('hidden');
      mainSection.classList.add('hidden');
    }
  }

  // Load current track info
  async function loadCurrentTrack() {
    trackInfo.innerHTML = `
      <div class="track-loading">
        <div class="spinner"></div>
        <span>Loading track info...</span>
      </div>
    `;

    try {
      const response = await sendMessage({ action: 'getCurrentTrack' });

      if (response.success && response.track) {
        currentTrack = response.track;
        displayTrackInfo(currentTrack);
        await loadGroovyData(currentTrack.id);
      } else {
        trackInfo.innerHTML = `
          <div class="no-track">
            <p>No track playing</p>
            <p style="font-size: 11px; margin-top: 4px;">Play a song on Spotify Web Player</p>
          </div>
        `;
        groovyEditor.classList.add('hidden');
        existingGroovy.classList.add('hidden');
      }
    } catch (error) {
      console.error('Error loading track:', error);
      trackInfo.innerHTML = `
        <div class="no-track">
          <p>Error loading track</p>
          <p style="font-size: 11px; margin-top: 4px;">${error.message}</p>
        </div>
      `;
    }
  }

  // Display track info
  function displayTrackInfo(track) {
    trackInfo.innerHTML = `
      <div class="track-details">
        ${track.album_image ? `<img src="${track.album_image}" alt="${track.album}" class="track-image">` : ''}
        <div class="track-text">
          <div class="track-name" title="${track.name}">${track.name}</div>
          <div class="track-artist" title="${track.artist}">${track.artist}</div>
          <div class="track-duration">Duration: ${formatTime(track.duration_ms)}</div>
        </div>
      </div>
    `;

    // Set default outtime to track duration
    if (!outtimeInput.value) {
      outtimeInput.value = formatTime(track.duration_ms);
    }
  }

  // Load groovy data for current track
  async function loadGroovyData(trackId) {
    try {
      const response = await sendMessage({ action: 'getGroovyData', trackId });

      if (response.success && response.groovyData) {
        currentGroovyData = response.groovyData;
        displayExistingGroovy(currentGroovyData);
      } else {
        currentGroovyData = null;
        existingGroovy.classList.add('hidden');
      }

      // Show editor
      groovyEditor.classList.remove('hidden');

      // Pre-fill with existing data if available
      if (currentGroovyData) {
        intimeInput.value = formatTime(currentGroovyData.intime);
        outtimeInput.value = formatTime(currentGroovyData.outtime);
      } else {
        intimeInput.value = '0:00';
        if (currentTrack) {
          outtimeInput.value = formatTime(currentTrack.duration_ms);
        }
      }
    } catch (error) {
      console.error('Error loading groovy data:', error);
    }
  }

  // Display existing groovy data
  function displayExistingGroovy(data) {
    existingIntime.textContent = formatTime(data.intime);
    existingOuttime.textContent = formatTime(data.outtime);
    contributionCount.textContent = data.contribution_count || 1;
    existingGroovy.classList.remove('hidden');
  }

  // Save groovy data
  async function saveGroovyData() {
    if (!currentTrack) {
      showStatus('No track loaded', 'error');
      return;
    }

    const intime = parseTime(intimeInput.value);
    const outtime = parseTime(outtimeInput.value);

    // Validation
    if (intime < 0) {
      showStatus('Start time cannot be negative', 'error');
      return;
    }

    if (outtime <= intime) {
      showStatus('End time must be after start time', 'error');
      return;
    }

    if (outtime > currentTrack.duration_ms) {
      showStatus('End time exceeds track duration', 'error');
      return;
    }

    saveGroovyBtn.disabled = true;
    saveGroovyBtn.textContent = 'Saving...';

    try {
      const response = await sendMessage({
        action: 'saveGroovyData',
        trackId: currentTrack.id,
        trackName: currentTrack.name,
        artistName: currentTrack.artist,
        intime,
        outtime
      });

      if (response.success) {
        showStatus('Groovy part saved! Thanks for contributing.', 'success');
        currentGroovyData = response.data;
        displayExistingGroovy(response.data);

        // Trigger prefetch to update cache
        sendMessage({ action: 'prefetchGroovyData' });
      } else {
        showStatus(response.error || 'Failed to save', 'error');
      }
    } catch (error) {
      showStatus('Error: ' + error.message, 'error');
    } finally {
      saveGroovyBtn.disabled = false;
      saveGroovyBtn.textContent = 'Save Groovy Part';
    }
  }

  // Get current playback time (try content script first, then API)
  async function getCurrentPlaybackTime() {
    // First try DOM via content script
    const domResponse = await sendToContentScript({ action: 'getCurrentPlaybackInfo' });

    if (domResponse.success && domResponse.currentTime > 0) {
      return domResponse.currentTime;
    }

    // Fallback to API (for "Now" button click, one-time call is fine)
    try {
      const apiResponse = await sendMessage({ action: 'getCurrentTrack' });
      if (apiResponse.success && apiResponse.track) {
        return apiResponse.track.progress_ms || 0;
      }
    } catch (error) {
      console.error('Failed to get playback time from API:', error);
    }

    return 0;
  }

  // Event Listeners

  // Login button
  loginBtn.addEventListener('click', async () => {
    loginBtn.disabled = true;
    loginBtn.textContent = 'Logging in...';

    try {
      const response = await sendMessage({ action: 'login' });

      if (response.success) {
        await checkLoginStatus();
        showStatusBar('Logged in successfully!');
      } else {
        showStatusBar(response.error || 'Login failed', true);
      }
    } catch (error) {
      showStatusBar('Login error: ' + error.message, true);
    } finally {
      loginBtn.disabled = false;
      loginBtn.innerHTML = `
        <svg viewBox="0 0 24 24" class="spotify-icon">
          <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
        </svg>
        Login with Spotify
      `;
    }
  });

  // Logout button
  logoutBtn.addEventListener('click', async () => {
    try {
      await sendMessage({ action: 'logout' });
      await checkLoginStatus();
      showStatusBar('Logged out');
    } catch (error) {
      console.error('Logout error:', error);
    }
  });

  // Enable toggle
  enableToggle.addEventListener('change', async () => {
    const enabled = enableToggle.checked;

    // Save to storage
    await chrome.storage.local.set({ groovy_enabled: enabled });

    // Notify content script
    await sendToContentScript({ action: 'setEnabled', enabled });

    showStatusBar(enabled ? 'Groovy enabled' : 'Groovy disabled');
  });

  // Set intime to current playback time
  setIntimeBtn.addEventListener('click', async () => {
    const currentTime = await getCurrentPlaybackTime();
    intimeInput.value = formatTime(currentTime);
  });

  // Set outtime to current playback time
  setOuttimeBtn.addEventListener('click', async () => {
    const currentTime = await getCurrentPlaybackTime();
    outtimeInput.value = formatTime(currentTime);
  });

  // Save groovy button
  saveGroovyBtn.addEventListener('click', saveGroovyData);

  // Time input validation
  [intimeInput, outtimeInput].forEach(input => {
    input.addEventListener('blur', () => {
      // Try to normalize the input
      const ms = parseTime(input.value);
      if (ms > 0 || input.value === '0:00') {
        input.value = formatTime(ms);
      }
    });
  });

  // Load saved enabled state
  const { groovy_enabled } = await chrome.storage.local.get('groovy_enabled');
  enableToggle.checked = groovy_enabled !== false;

  // Initialize
  await checkLoginStatus();

  // Refresh track info periodically when popup is open (only if track changes)
  let isRefreshing = false;
  setInterval(async () => {
    // Prevent overlapping refreshes and only check if logged in
    if (isRefreshing || mainSection.classList.contains('hidden') || !currentTrack) {
      return;
    }

    isRefreshing = true;
    try {
      const response = await sendToContentScript({ action: 'getCurrentPlaybackInfo' });
      // Only reload if we got a valid response with a DIFFERENT track ID
      if (response.success && response.trackId && response.trackId !== currentTrack.id) {
        await loadCurrentTrack();
      }
    } catch (error) {
      // Silently ignore errors during periodic refresh
    } finally {
      isRefreshing = false;
    }
  }, 5000); // Check every 5 seconds instead of 2
});
