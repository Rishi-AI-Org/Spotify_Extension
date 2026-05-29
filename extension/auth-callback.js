// Groovy Extension - Auth Callback Content Script
// This script runs on the backend callback page to capture OAuth tokens

(function() {
  'use strict';

  // Look for the auth data element
  const authDataEl = document.getElementById('groovy-auth-data');

  if (!authDataEl) {
    console.log('[Groovy] No auth data found on this page');
    return;
  }

  // Extract token data from the element's data attributes
  const accessToken = authDataEl.dataset.accessToken;
  const refreshToken = authDataEl.dataset.refreshToken;
  const expiresAt = parseInt(authDataEl.dataset.expiresAt, 10);

  if (!accessToken) {
    console.error('[Groovy] Access token not found');
    return;
  }

  console.log('[Groovy] Auth data found, saving tokens...');

  // Save tokens to chrome.storage.local
  chrome.storage.local.set({
    spotify_access_token: accessToken,
    spotify_refresh_token: refreshToken,
    spotify_token_expires_at: expiresAt
  }, () => {
    if (chrome.runtime.lastError) {
      console.error('[Groovy] Failed to save tokens:', chrome.runtime.lastError);
      return;
    }

    console.log('[Groovy] Tokens saved successfully!');

    // Notify background script that login is complete
    chrome.runtime.sendMessage({ action: 'loginComplete' }, (response) => {
      if (chrome.runtime.lastError) {
        console.log('[Groovy] Could not notify background:', chrome.runtime.lastError.message);
      }
    });

    // Update the UI to show success
    const statusMessage = document.getElementById('status-message');
    const loader = document.getElementById('loader');

    if (statusMessage) {
      statusMessage.textContent = 'Credentials saved! Closing...';
    }
    if (loader) {
      loader.style.display = 'none';
    }

    // Close the tab after a short delay
    setTimeout(() => {
      window.close();
    }, 1500);
  });
})();
