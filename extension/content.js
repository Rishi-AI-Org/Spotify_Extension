// Groovy Spotify Extension - Content Script
// Uses API for playback control, DOM only for progress monitoring

(function() {
  'use strict';

  // Check if extension context is valid
  function isExtensionValid() {
    try {
      return chrome.runtime && chrome.runtime.id;
    } catch (e) {
      return false;
    }
  }

  // Safe message sender that handles invalidated context
  function sendMessage(message) {
    return new Promise((resolve) => {
      if (!isExtensionValid()) {
        console.warn('Groovy: Extension context invalidated - please refresh the page');
        resolve({ success: false, error: 'Extension context invalidated' });
        return;
      }

      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            console.warn('Groovy: Message error:', chrome.runtime.lastError.message);
            resolve({ success: false, error: chrome.runtime.lastError.message });
          } else {
            resolve(response || { success: false, error: 'No response' });
          }
        });
      } catch (e) {
        console.warn('Groovy: Extension context invalidated - please refresh the page');
        resolve({ success: false, error: 'Extension context invalidated' });
      }
    });
  }

  // State
  let isEnabled = true;
  let currentTrackId = null;
  let currentTrackDuration = 0;
  let currentGroovyData = null;
  let hasAppliedIntime = false;
  let monitoringInterval = null;
  let lastProgressMs = 0;
  let lastProgressTime = Date.now();
  let queueGroovyData = {}; // Cache of groovy data for queue tracks
  let isProcessing = false; // Prevent concurrent processing

  // DOM Selectors for progress bar only
  const SELECTORS = {
    currentTime: '[data-testid="playback-position"]',
    currentTimeAlt: '[data-testid="current-time"]',
    currentTimeAlt2: '.playback-bar__progress-time-elapsed',
    progressBar: '[data-testid="playback-progressbar"]'
  };

  // Constants
  const QUEUE_REFRESH_INTERVAL = 30000; // 30 seconds
  const ABRUPT_CHANGE_THRESHOLD = 3000; // 3 seconds - if progress jumps more than this, assume track change
  const MONITORING_INTERVAL = 500; // Check every 500ms

  // Parse time string (MM:SS or H:MM:SS) to milliseconds
  function parseTimeToMs(timeStr) {
    if (!timeStr) return 0;
    const parts = timeStr.split(':').map(Number);
    if (parts.length === 2) {
      return (parts[0] * 60 + parts[1]) * 1000;
    } else if (parts.length === 3) {
      return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
    }
    return 0;
  }

  // Get current playback progress from DOM (no rate limits)
  function getProgressFromDOM() {
    const selectors = [
      SELECTORS.currentTime,
      SELECTORS.currentTimeAlt,
      SELECTORS.currentTimeAlt2
    ];

    for (const selector of selectors) {
      const timeElement = document.querySelector(selector);
      if (timeElement && timeElement.textContent) {
        const time = parseTimeToMs(timeElement.textContent.trim());
        if (time >= 0) return time;
      }
    }
    return -1; // Return -1 if we can't read DOM
  }

  // API: Get current track
  async function apiGetCurrentTrack() {
    const response = await sendMessage({ action: 'getCurrentTrack' });
    return (response?.success && response.track) ? response.track : null;
  }

  // API: Get queue
  async function apiGetQueue() {
    const response = await sendMessage({ action: 'getQueue' });
    return (response?.success && response.queue) ? response.queue : null;
  }

  // API: Seek to position
  async function apiSeek(positionMs) {
    const response = await sendMessage({ action: 'seekToPosition', positionMs });
    return response?.success || false;
  }

  // API: Skip to next track
  async function apiSkipToNext() {
    const response = await sendMessage({ action: 'skipToNext' });
    return response?.success || false;
  }

  // Fetch groovy data for a track
  async function fetchGroovyData(trackId) {
    const response = await sendMessage({ action: 'getGroovyData', trackId });
    return (response?.success && response.groovyData) ? response.groovyData : null;
  }

  // Fetch groovy data for all tracks in queue and cache it
  async function fetchQueueGroovyData(queue) {
    if (!queue || !queue.queue) return;

    const trackIds = queue.queue.map(t => t.id);
    console.log(`Groovy: Fetching groovy data for ${trackIds.length} queue tracks`);

    // Fetch in parallel
    const promises = trackIds.map(async (id) => {
      if (!queueGroovyData[id]) {
        const data = await fetchGroovyData(id);
        if (data) {
          queueGroovyData[id] = data;
          console.log(`Groovy: Cached groovy data for queue track ${id}`);
        }
      }
    });

    await Promise.all(promises);
  }

  // Main initialization cycle - called on load and when track changes abruptly
  async function initializeCycle() {
    if (isProcessing) {
      console.log('Groovy: Already processing, skipping');
      return;
    }

    isProcessing = true;
    console.log('Groovy: Starting initialization cycle...');

    try {
      // Step 1: Get current track from API
      const track = await apiGetCurrentTrack();
      if (!track) {
        console.log('Groovy: No track playing');
        isProcessing = false;
        return;
      }

      console.log(`Groovy: Current track: ${track.name} (${track.id})`);
      currentTrackId = track.id;
      currentTrackDuration = track.duration_ms;
      hasAppliedIntime = false;

      // Step 2: Get groovy data for current track
      currentGroovyData = queueGroovyData[track.id] || await fetchGroovyData(track.id);

      if (currentGroovyData) {
        console.log(`Groovy: Found groovy data - intime: ${currentGroovyData.intime}ms, outtime: ${currentGroovyData.outtime}ms`);

        // Step 3: Get current progress from DOM
        const currentProgress = getProgressFromDOM();
        if (currentProgress < 0) {
          // Fallback to API progress if DOM fails
          console.log('Groovy: DOM progress unavailable, using API progress');
        }
        const progress = currentProgress >= 0 ? currentProgress : track.progress_ms;

        console.log(`Groovy: Current progress: ${progress}ms`);

        // Step 4: Apply groovy logic
        if (progress < currentGroovyData.intime) {
          // Before intime - seek to intime
          console.log(`Groovy: Progress (${progress}ms) < intime (${currentGroovyData.intime}ms), seeking via API`);
          const seekSuccess = await apiSeek(currentGroovyData.intime);
          if (seekSuccess) {
            console.log('Groovy: Seek successful');
            hasAppliedIntime = true;
            lastProgressMs = currentGroovyData.intime;
          } else {
            console.log('Groovy: Seek failed');
          }
        } else if (progress >= currentGroovyData.intime && progress < currentGroovyData.outtime) {
          // Within groovy range - let it play
          console.log(`Groovy: Progress (${progress}ms) is within groovy range, playing normally`);
          hasAppliedIntime = true;
          lastProgressMs = progress;
        } else {
          // Past outtime - skip to next
          console.log(`Groovy: Progress (${progress}ms) > outtime (${currentGroovyData.outtime}ms), skipping to next via API`);
          await handleSkipToNext();
          return; // handleSkipToNext will reinitialize
        }
      } else {
        console.log('Groovy: No groovy data for this track, playing normally');
        lastProgressMs = track.progress_ms;
      }

      // Step 5: Fetch queue and groovy data for queue tracks
      const queue = await apiGetQueue();
      if (queue) {
        await fetchQueueGroovyData(queue);
      }

      lastProgressTime = Date.now();

    } catch (error) {
      console.error('Groovy: Error in initialization cycle:', error);
    }

    isProcessing = false;
  }

  // Handle skip to next track
  async function handleSkipToNext() {
    console.log('Groovy: Skipping to next track via API...');

    // Reset state
    currentTrackId = null;
    currentGroovyData = null;
    hasAppliedIntime = false;
    lastProgressMs = 0;

    const skipSuccess = await apiSkipToNext();
    if (skipSuccess) {
      console.log('Groovy: Skip successful, waiting for track change...');
      // Wait a bit for Spotify to update, then reinitialize
      setTimeout(async () => {
        isProcessing = false;
        await initializeCycle();
      }, 1000);
    } else {
      console.log('Groovy: Skip failed, reinitializing...');
      isProcessing = false;
      await initializeCycle();
    }
  }

  // Monitor playback progress via DOM
  async function monitorProgress() {
    if (!isEnabled || isProcessing) return;

    const currentProgress = getProgressFromDOM();
    if (currentProgress < 0) return; // Can't read DOM

    const now = Date.now();
    const timeDelta = now - lastProgressTime;
    const expectedProgress = lastProgressMs + timeDelta;

    // Check for abrupt change (track change by user)
    // If progress jumped backwards significantly or jumped forward way more than expected
    const progressDelta = currentProgress - lastProgressMs;

    if (lastProgressMs > 0 && currentTrackId) {
      // Detect abrupt backward jump (new song started)
      if (progressDelta < -ABRUPT_CHANGE_THRESHOLD) {
        console.log(`Groovy: Abrupt change detected (progress went from ${lastProgressMs}ms to ${currentProgress}ms)`);
        isProcessing = false;
        await initializeCycle();
        return;
      }

      // Detect significant forward jump beyond expected playback
      // (user scrubbed forward or track changed)
      if (progressDelta > timeDelta + ABRUPT_CHANGE_THRESHOLD) {
        console.log(`Groovy: Abrupt forward jump detected (expected ~${expectedProgress}ms, got ${currentProgress}ms)`);
        isProcessing = false;
        await initializeCycle();
        return;
      }
    }

    // Update tracking
    lastProgressMs = currentProgress;
    lastProgressTime = now;

    // Check if we've reached outtime
    if (currentGroovyData && currentProgress >= currentGroovyData.outtime) {
      console.log(`Groovy: Reached outtime (${currentGroovyData.outtime}ms), skipping to next`);
      isProcessing = true;
      await handleSkipToNext();
    }
  }

  // Periodic queue refresh
  let lastQueueRefresh = 0;
  async function refreshQueuePeriodically() {
    const now = Date.now();
    if (now - lastQueueRefresh < QUEUE_REFRESH_INTERVAL) return;

    lastQueueRefresh = now;
    console.log('Groovy: Refreshing queue (30s interval)...');

    try {
      const queue = await apiGetQueue();
      if (queue) {
        // Check if queue changed
        const newQueueIds = queue.queue.map(t => t.id).join(',');
        const cachedIds = Object.keys(queueGroovyData).join(',');

        if (newQueueIds !== cachedIds) {
          console.log('Groovy: Queue changed, fetching new groovy data');
          await fetchQueueGroovyData(queue);
        }
      }
    } catch (error) {
      console.error('Groovy: Error refreshing queue:', error);
    }
  }

  // Main monitoring loop
  async function monitoringLoop() {
    if (!isEnabled) return;

    // Stop monitoring if extension context is invalidated
    if (!isExtensionValid()) {
      console.warn('Groovy: Extension context invalidated - stopping monitoring');
      stopMonitoring();
      return;
    }

    await monitorProgress();
    await refreshQueuePeriodically();
  }

  // Start monitoring
  function startMonitoring() {
    if (monitoringInterval) {
      clearInterval(monitoringInterval);
    }

    monitoringInterval = setInterval(monitoringLoop, MONITORING_INTERVAL);
    console.log('Groovy: Monitoring started (DOM progress, 500ms interval)');
  }

  // Stop monitoring
  function stopMonitoring() {
    if (monitoringInterval) {
      clearInterval(monitoringInterval);
      monitoringInterval = null;
    }
    console.log('Groovy: Monitoring stopped');
  }

  // Toggle groovy functionality
  function setEnabled(enabled) {
    isEnabled = enabled;

    if (enabled) {
      startMonitoring();
      initializeCycle();
    } else {
      stopMonitoring();
    }

    console.log(`Groovy: ${enabled ? 'Enabled' : 'Disabled'}`);
  }

  // Get current status
  function getStatus() {
    return {
      enabled: isEnabled,
      currentTrackId,
      hasGroovyData: currentGroovyData !== null,
      groovyData: currentGroovyData,
      currentProgress: getProgressFromDOM(),
      duration: currentTrackDuration
    };
  }

  // Listen for messages from popup/background
  if (isExtensionValid()) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (!isExtensionValid()) {
        sendResponse({ success: false, error: 'Extension context invalidated' });
        return true;
      }

      switch (request.action) {
        case 'setEnabled':
          setEnabled(request.enabled);
          sendResponse({ success: true, enabled: isEnabled });
          break;

        case 'getStatus':
          sendResponse({ success: true, status: getStatus() });
          break;

        case 'skipToIntime':
          if (currentGroovyData) {
            apiSeek(currentGroovyData.intime).then(success => {
              sendResponse({ success });
            });
            return true; // Async response
          } else {
            sendResponse({ success: false, error: 'No groovy data' });
          }
          break;

        case 'skipToNext':
          handleSkipToNext().then(() => {
            sendResponse({ success: true });
          });
          return true; // Async response

        case 'reinitialize':
          isProcessing = false;
          initializeCycle().then(() => {
            sendResponse({ success: true });
          });
          return true; // Async response

        case 'getCurrentPlaybackInfo':
          sendResponse({
            success: true,
            trackId: currentTrackId,
            currentTime: getProgressFromDOM(),
            duration: currentTrackDuration
          });
          break;

        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }

      return true;
    });
  }

  // Initialize when DOM is ready
  async function initialize() {
    if (!isExtensionValid()) {
      console.warn('Groovy: Extension context invalid at initialization');
      return;
    }

    // Wait for Spotify player to load
    const checkPlayer = setInterval(async () => {
      if (!isExtensionValid()) {
        clearInterval(checkPlayer);
        console.warn('Groovy: Extension context invalidated during init');
        return;
      }

      const progressBar = document.querySelector(SELECTORS.progressBar) ||
                         document.querySelector(SELECTORS.currentTime);

      if (progressBar) {
        clearInterval(checkPlayer);
        console.log('Groovy: Spotify player detected');

        try {
          // Load enabled state from storage
          const { groovy_enabled } = await chrome.storage.local.get('groovy_enabled');
          const enabled = groovy_enabled !== false; // Default to true

          if (enabled) {
            setEnabled(true);
          } else {
            setEnabled(false);
          }
        } catch (e) {
          console.warn('Groovy: Could not load settings, defaulting to enabled');
          setEnabled(true);
        }
      }
    }, 1000);

    // Timeout after 30 seconds
    setTimeout(() => clearInterval(checkPlayer), 30000);
  }

  // Start initialization
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }

  console.log('Groovy: Content script loaded (API-based playback control)');
})();
