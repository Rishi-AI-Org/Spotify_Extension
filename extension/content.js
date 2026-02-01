// Groovy Spotify Extension - Content Script
// Handles DOM manipulation on Spotify Web Player

(function() {
  'use strict';

  // State
  let isEnabled = true;
  let currentTrackId = null;
  let currentGroovyData = null;
  let hasSkippedToIntime = false;
  let monitoringInterval = null;
  let lastCheckedTime = 0;
  let lastApiTrackId = null;
  let lastApiProgress = 0;

  // DOM Selectors for Spotify Web Player (updated for 2024/2025)
  const SELECTORS = {
    // Progress bar - multiple fallbacks
    progressBar: '[data-testid="playback-progressbar"]',
    progressBarAlt: '[data-testid="progress-bar"]',
    progressBarAlt2: '.playback-bar',
    progressBarAlt3: '[class*="progress-bar"]',

    // Time display - multiple fallbacks
    currentTime: '[data-testid="playback-position"]',
    currentTimeAlt: '[data-testid="current-time"]',
    currentTimeAlt2: '.playback-bar__progress-time-elapsed',
    currentTimeAlt3: '[class*="playback-position"]',

    totalDuration: '[data-testid="playback-duration"]',

    // Controls - multiple fallbacks
    nextButton: '[data-testid="control-button-skip-forward"]',
    nextButtonAlt: 'button[aria-label="Next"]',
    nextButtonAlt2: '[data-testid="control-button-next"]',
    nextButtonAlt3: '.player-controls button[class*="skip-forward"]',

    playPauseButton: '[data-testid="control-button-playpause"]',

    // Track info - multiple fallbacks
    trackName: '[data-testid="context-item-link"]',
    trackNameAlt: '[data-testid="nowplaying-track-link"]',
    trackNameAlt2: 'a[href*="/track/"]',
    nowPlayingWidget: '[data-testid="now-playing-widget"]',
    nowPlayingWidgetAlt: '[data-testid="CoverSlotCollapsed__container"]'
  };

  // Parse time string (MM:SS or H:MM:SS) to milliseconds
  function parseTimeToMs(timeStr) {
    if (!timeStr) return 0;

    const parts = timeStr.split(':').map(Number);

    if (parts.length === 2) {
      // MM:SS
      return (parts[0] * 60 + parts[1]) * 1000;
    } else if (parts.length === 3) {
      // H:MM:SS
      return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
    }

    return 0;
  }

  // Get current playback time from DOM (with multiple fallbacks)
  function getCurrentTimeMs() {
    const selectors = [
      SELECTORS.currentTime,
      SELECTORS.currentTimeAlt,
      SELECTORS.currentTimeAlt2,
      SELECTORS.currentTimeAlt3
    ];

    for (const selector of selectors) {
      const timeElement = document.querySelector(selector);
      if (timeElement && timeElement.textContent) {
        const time = parseTimeToMs(timeElement.textContent.trim());
        if (time > 0) return time;
      }
    }

    // Fallback to last API progress if DOM fails
    return lastApiProgress;
  }

  // Get total duration from DOM
  function getTotalDurationMs() {
    const durationElement = document.querySelector(SELECTORS.totalDuration);

    if (durationElement) {
      return parseTimeToMs(durationElement.textContent);
    }

    return 0;
  }

  // Get current track and progress from API via background script
  async function getTrackFromApi() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'getCurrentTrack' }, (response) => {
        if (response?.success && response.track) {
          lastApiTrackId = response.track.id;
          lastApiProgress = response.track.progress_ms || 0;
          resolve({
            trackId: response.track.id,
            progress: response.track.progress_ms || 0,
            duration: response.track.duration_ms || 0,
            isPlaying: response.track.is_playing
          });
        } else {
          resolve(null);
        }
      });
    });
  }

  // Click on progress bar at specific percentage
  function clickProgressBarAtPercentage(percentage) {
    const progressBar = document.querySelector(SELECTORS.progressBar) ||
                       document.querySelector(SELECTORS.progressBarAlt) ||
                       document.querySelector(SELECTORS.progressBarAlt2) ||
                       document.querySelector(SELECTORS.progressBarAlt3);

    if (!progressBar) {
      console.log('Groovy: Progress bar not found');
      return false;
    }

    const rect = progressBar.getBoundingClientRect();
    const clickX = rect.left + (rect.width * percentage);
    const clickY = rect.top + (rect.height / 2);

    // Create and dispatch mouse events
    const mousedownEvent = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: clickX,
      clientY: clickY
    });

    const mouseupEvent = new MouseEvent('mouseup', {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: clickX,
      clientY: clickY
    });

    const clickEvent = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: clickX,
      clientY: clickY
    });

    progressBar.dispatchEvent(mousedownEvent);
    progressBar.dispatchEvent(mouseupEvent);
    progressBar.dispatchEvent(clickEvent);

    console.log(`Groovy: Clicked progress bar at ${(percentage * 100).toFixed(1)}%`);
    return true;
  }

  // Skip to specific time in milliseconds
  function skipToTime(timeMs, totalDurationMs) {
    if (!totalDurationMs || totalDurationMs <= 0) {
      console.log('Groovy: Invalid duration');
      return false;
    }

    const percentage = Math.min(Math.max(timeMs / totalDurationMs, 0), 1);
    return clickProgressBarAtPercentage(percentage);
  }

  // Click next button to skip to next song
  function clickNextButton() {
    const nextButton = document.querySelector(SELECTORS.nextButton) ||
                      document.querySelector(SELECTORS.nextButtonAlt) ||
                      document.querySelector(SELECTORS.nextButtonAlt2) ||
                      document.querySelector(SELECTORS.nextButtonAlt3);

    if (nextButton) {
      nextButton.click();
      console.log('Groovy: Clicked next button');
      return true;
    }

    console.log('Groovy: Next button not found');
    return false;
  }

  // Get current track info from DOM (with multiple fallbacks)
  function getCurrentTrackFromDOM() {
    // Try multiple selectors for track link
    const trackLinkSelectors = [
      SELECTORS.trackName,
      SELECTORS.trackNameAlt,
      SELECTORS.trackNameAlt2
    ];

    for (const selector of trackLinkSelectors) {
      const trackLink = document.querySelector(selector);
      if (trackLink) {
        const href = trackLink.getAttribute('href');
        if (href && href.includes('/track/')) {
          const trackId = href.split('/track/')[1]?.split('?')[0];
          if (trackId) return trackId;
        }
      }
    }

    // Try to get from URL if on track page
    const urlMatch = window.location.href.match(/\/track\/([a-zA-Z0-9]+)/);
    if (urlMatch) {
      return urlMatch[1];
    }

    // Fallback to last API track ID
    return lastApiTrackId;
  }

  // Fetch groovy data from background script
  async function fetchGroovyData(trackId) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: 'getGroovyData', trackId },
        (response) => {
          if (response?.success && response.groovyData) {
            resolve(response.groovyData);
          } else {
            resolve(null);
          }
        }
      );
    });
  }

  // Get prefetched groovy data
  async function getPrefetchedGroovy(trackId) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: 'getPrefetchedGroovy' },
        (response) => {
          if (response?.success && response.prefetched?.[trackId]) {
            resolve(response.prefetched[trackId]);
          } else {
            resolve(null);
          }
        }
      );
    });
  }

  // Counter for API calls (to avoid rate limiting)
  let apiCallCounter = 0;
  const API_CALL_INTERVAL = 4; // Call API every 4th iteration (2 seconds at 500ms interval)
  let lastApiDuration = 0;

  // Main monitoring function
  async function monitorPlayback() {
    if (!isEnabled) return;

    // Get track ID from API (called periodically to avoid rate limits)
    let trackId = lastApiTrackId;

    if (apiCallCounter % API_CALL_INTERVAL === 0) {
      const apiData = await getTrackFromApi();
      if (apiData) {
        trackId = apiData.trackId;
        lastApiDuration = apiData.duration;
      }
    }
    apiCallCounter++;

    // Get time from DOM (every iteration - no rate limits)
    const currentTimeMs = getCurrentTimeMs();
    // Use API duration as fallback if DOM fails
    const durationMs = getTotalDurationMs() || lastApiDuration;

    // Debug logging (uncomment if needed)
    // console.log(`Groovy: trackId=${trackId}, time=${currentTimeMs}ms, duration=${durationMs}ms`);

    // Track changed
    if (trackId && trackId !== currentTrackId) {
      console.log(`Groovy: New track detected: ${trackId}`);
      currentTrackId = trackId;
      hasSkippedToIntime = false;
      lastCheckedTime = 0;

      // Try to get groovy data (prefetched first, then fetch)
      currentGroovyData = await getPrefetchedGroovy(trackId);

      if (!currentGroovyData) {
        currentGroovyData = await fetchGroovyData(trackId);
      }

      if (currentGroovyData) {
        console.log(`Groovy: Found groovy data - intime: ${currentGroovyData.intime}ms, outtime: ${currentGroovyData.outtime}ms`);

        // Trigger prefetch for next songs
        chrome.runtime.sendMessage({ action: 'prefetchGroovyData' });
      } else {
        console.log('Groovy: No groovy data for this track');
      }
    }

    // Apply groovy logic if we have data
    if (currentGroovyData && durationMs > 0) {
      // Skip to intime if we haven't already and we're before intime
      if (!hasSkippedToIntime && currentTimeMs < currentGroovyData.intime) {
        // Only skip if we're at the very beginning (within first 3 seconds)
        if (currentTimeMs < 3000) {
          console.log(`Groovy: Skipping to intime: ${currentGroovyData.intime}ms`);
          skipToTime(currentGroovyData.intime, durationMs);
          hasSkippedToIntime = true;
        }
      } else if (currentTimeMs >= currentGroovyData.intime) {
        hasSkippedToIntime = true;
      }

      // Check if we've reached outtime
      if (currentTimeMs >= currentGroovyData.outtime && currentTimeMs > lastCheckedTime) {
        console.log(`Groovy: Reached outtime (${currentGroovyData.outtime}ms), skipping to next song`);
        clickNextButton();

        // Reset for next track
        currentTrackId = null;
        currentGroovyData = null;
        hasSkippedToIntime = false;
      }
    }

    lastCheckedTime = currentTimeMs;
  }

  // Start monitoring
  function startMonitoring() {
    if (monitoringInterval) {
      clearInterval(monitoringInterval);
    }

    // Check playback every 500ms
    monitoringInterval = setInterval(monitorPlayback, 500);
    console.log('Groovy: Playback monitoring started');
  }

  // Stop monitoring
  function stopMonitoring() {
    if (monitoringInterval) {
      clearInterval(monitoringInterval);
      monitoringInterval = null;
    }
    console.log('Groovy: Playback monitoring stopped');
  }

  // Toggle groovy functionality
  function setEnabled(enabled) {
    isEnabled = enabled;

    if (enabled) {
      startMonitoring();
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
      currentTime: getCurrentTimeMs(),
      duration: getTotalDurationMs()
    };
  }

  // Listen for messages from popup/background
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
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
          const duration = getTotalDurationMs();
          skipToTime(currentGroovyData.intime, duration);
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: 'No groovy data' });
        }
        break;

      case 'skipToNext':
        clickNextButton();
        sendResponse({ success: true });
        break;

      case 'testProgressBar':
        // Test function to click at a specific percentage
        const result = clickProgressBarAtPercentage(request.percentage || 0.5);
        sendResponse({ success: result });
        break;

      case 'getCurrentPlaybackInfo':
        sendResponse({
          success: true,
          trackId: getCurrentTrackFromDOM(),
          currentTime: getCurrentTimeMs(),
          duration: getTotalDurationMs()
        });
        break;

      default:
        sendResponse({ success: false, error: 'Unknown action' });
    }

    return true;
  });

  // Initialize when DOM is ready
  function initialize() {
    // Wait for Spotify player to load
    const checkPlayer = setInterval(() => {
      const progressBar = document.querySelector(SELECTORS.progressBar) ||
                         document.querySelector(SELECTORS.progressBarAlt);

      if (progressBar) {
        clearInterval(checkPlayer);
        console.log('Groovy: Spotify player detected, initializing...');

        // Load enabled state from storage
        chrome.storage.local.get('groovy_enabled', (result) => {
          const enabled = result.groovy_enabled !== false; // Default to true
          setEnabled(enabled);
        });
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

  console.log('Groovy: Content script loaded');
})();
