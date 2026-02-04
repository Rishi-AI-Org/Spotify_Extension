// Groovy Extension - Evaluation/Debug Script
// Run these tests from the browser console on open.spotify.com
// Copy and paste into console, or load via content script

(function() {
  'use strict';

  const EVAL_VERSION = '1.0.0';

  // Test results storage
  const testResults = {
    passed: 0,
    failed: 0,
    tests: []
  };

  // Helper: Log with formatting
  function log(msg, type = 'info') {
    const prefix = {
      'info': '📋',
      'pass': '✅',
      'fail': '❌',
      'warn': '⚠️',
      'test': '🧪'
    }[type] || '📋';
    console.log(`${prefix} Groovy Eval: ${msg}`);
  }

  // Helper: Record test result
  function recordTest(name, passed, details = '') {
    testResults.tests.push({ name, passed, details });
    if (passed) {
      testResults.passed++;
      log(`${name}: PASSED ${details}`, 'pass');
    } else {
      testResults.failed++;
      log(`${name}: FAILED ${details}`, 'fail');
    }
  }

  // ============================================
  // TEST 1: DOM Progress Reading
  // ============================================
  async function testDOMProgress() {
    log('Testing DOM progress reading...', 'test');

    const selectors = [
      '[data-testid="playback-position"]',
      '[data-testid="current-time"]',
      '.playback-bar__progress-time-elapsed'
    ];

    let foundSelector = null;
    let progressText = null;

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && element.textContent) {
        foundSelector = selector;
        progressText = element.textContent.trim();
        break;
      }
    }

    if (foundSelector) {
      recordTest('DOM Progress Element', true, `Found: "${foundSelector}" = "${progressText}"`);

      // Test parsing
      const parts = progressText.split(':').map(Number);
      let ms = 0;
      if (parts.length === 2) {
        ms = (parts[0] * 60 + parts[1]) * 1000;
      } else if (parts.length === 3) {
        ms = (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
      }

      recordTest('DOM Progress Parsing', ms >= 0, `Parsed: ${ms}ms`);
      return { success: true, selector: foundSelector, text: progressText, ms };
    } else {
      recordTest('DOM Progress Element', false, 'No progress element found');
      return { success: false };
    }
  }

  // ============================================
  // TEST 2: API - Get Current Track
  // ============================================
  async function testAPIGetCurrentTrack() {
    log('Testing API getCurrentTrack...', 'test');

    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'getCurrentTrack' }, (response) => {
        if (chrome.runtime.lastError) {
          recordTest('API getCurrentTrack', false, `Error: ${chrome.runtime.lastError.message}`);
          resolve({ success: false, error: chrome.runtime.lastError.message });
          return;
        }

        if (response?.success && response.track) {
          const track = response.track;
          recordTest('API getCurrentTrack', true,
            `Track: "${track.name}" by ${track.artist} (ID: ${track.id})`);
          recordTest('API Track has ID', !!track.id, `ID: ${track.id}`);
          recordTest('API Track has duration', track.duration_ms > 0, `Duration: ${track.duration_ms}ms`);
          recordTest('API Track has progress', track.progress_ms >= 0, `Progress: ${track.progress_ms}ms`);
          resolve({ success: true, track });
        } else {
          recordTest('API getCurrentTrack', false,
            `Response: ${JSON.stringify(response)}`);
          resolve({ success: false, response });
        }
      });
    });
  }

  // ============================================
  // TEST 3: API - Get Queue
  // ============================================
  async function testAPIGetQueue() {
    log('Testing API getQueue...', 'test');

    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'getQueue' }, (response) => {
        if (chrome.runtime.lastError) {
          recordTest('API getQueue', false, `Error: ${chrome.runtime.lastError.message}`);
          resolve({ success: false, error: chrome.runtime.lastError.message });
          return;
        }

        if (response?.success && response.queue) {
          const queue = response.queue;
          const queueLength = queue.queue?.length || 0;
          recordTest('API getQueue', true, `Queue has ${queueLength} tracks`);

          if (queue.currently_playing) {
            recordTest('API Queue has currently_playing', true,
              `Current: ${queue.currently_playing.name}`);
          } else {
            recordTest('API Queue has currently_playing', false, 'No currently_playing');
          }

          if (queueLength > 0) {
            log(`Queue tracks: ${queue.queue.slice(0, 3).map(t => t.name).join(', ')}...`, 'info');
          }

          resolve({ success: true, queue });
        } else {
          recordTest('API getQueue', false, `Response: ${JSON.stringify(response)}`);
          resolve({ success: false, response });
        }
      });
    });
  }

  // ============================================
  // TEST 4: API - Seek (dry run check)
  // ============================================
  async function testAPISeekDryRun() {
    log('Testing API seek capability (checking auth)...', 'test');

    // First get current track to know current position
    const trackResult = await testAPIGetCurrentTrack();
    if (!trackResult.success) {
      recordTest('API Seek Pre-check', false, 'Cannot test seek - no track playing');
      return { success: false };
    }

    // We'll do a "safe" seek - seek to current position (no audible change)
    const currentPos = trackResult.track.progress_ms;

    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'seekToPosition', positionMs: currentPos }, (response) => {
        if (chrome.runtime.lastError) {
          recordTest('API Seek', false, `Error: ${chrome.runtime.lastError.message}`);
          resolve({ success: false, error: chrome.runtime.lastError.message });
          return;
        }

        if (response?.success) {
          recordTest('API Seek', true, `Seek to ${currentPos}ms successful`);
          resolve({ success: true });
        } else {
          recordTest('API Seek', false, `Response: ${JSON.stringify(response)}`);
          resolve({ success: false, response });
        }
      });
    });
  }

  // ============================================
  // TEST 5: Backend - Get Groovy Data
  // ============================================
  async function testGroovyDataFetch(trackId) {
    log(`Testing groovy data fetch for track: ${trackId}...`, 'test');

    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'getGroovyData', trackId }, (response) => {
        if (chrome.runtime.lastError) {
          recordTest('Backend getGroovyData', false, `Error: ${chrome.runtime.lastError.message}`);
          resolve({ success: false, error: chrome.runtime.lastError.message });
          return;
        }

        if (response?.success) {
          if (response.groovyData) {
            const data = response.groovyData;
            recordTest('Backend getGroovyData', true,
              `Found: intime=${data.intime}ms, outtime=${data.outtime}ms`);
            recordTest('Groovy intime valid', data.intime >= 0, `intime: ${data.intime}`);
            recordTest('Groovy outtime valid', data.outtime > data.intime,
              `outtime: ${data.outtime} > intime: ${data.intime}`);
            resolve({ success: true, hasData: true, data });
          } else {
            recordTest('Backend getGroovyData', true, 'No groovy data for this track (expected for many tracks)');
            resolve({ success: true, hasData: false });
          }
        } else {
          recordTest('Backend getGroovyData', false, `Response: ${JSON.stringify(response)}`);
          resolve({ success: false, response });
        }
      });
    });
  }

  // ============================================
  // TEST 6: Authentication Check
  // ============================================
  async function testAuthentication() {
    log('Testing authentication status...', 'test');

    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'isLoggedIn' }, (response) => {
        if (chrome.runtime.lastError) {
          recordTest('Authentication Check', false, `Error: ${chrome.runtime.lastError.message}`);
          resolve({ success: false, error: chrome.runtime.lastError.message });
          return;
        }

        if (response?.success) {
          recordTest('Authentication Check', response.loggedIn,
            response.loggedIn ? 'User is logged in' : 'User is NOT logged in');
          resolve({ success: true, loggedIn: response.loggedIn });
        } else {
          recordTest('Authentication Check', false, `Response: ${JSON.stringify(response)}`);
          resolve({ success: false, response });
        }
      });
    });
  }

  // ============================================
  // TEST 7: Content Script Status
  // ============================================
  async function testContentScriptStatus() {
    log('Testing content script status...', 'test');

    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'getStatus' }, (response) => {
        if (chrome.runtime.lastError) {
          recordTest('Content Script Status', false, `Error: ${chrome.runtime.lastError.message}`);
          resolve({ success: false, error: chrome.runtime.lastError.message });
          return;
        }

        if (response?.success && response.status) {
          const status = response.status;
          recordTest('Content Script Status', true, `Enabled: ${status.enabled}`);
          recordTest('Content Script has trackId', !!status.currentTrackId,
            `TrackId: ${status.currentTrackId}`);
          recordTest('Content Script groovyData', true,
            status.hasGroovyData ? `Has groovy data` : 'No groovy data');
          log(`Full status: ${JSON.stringify(status, null, 2)}`, 'info');
          resolve({ success: true, status });
        } else {
          recordTest('Content Script Status', false, `Response: ${JSON.stringify(response)}`);
          resolve({ success: false, response });
        }
      });
    });
  }

  // ============================================
  // TEST 8: Progress Comparison (DOM vs API)
  // ============================================
  async function testProgressComparison() {
    log('Testing progress comparison (DOM vs API)...', 'test');

    const domResult = await testDOMProgress();
    const apiResult = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'getCurrentTrack' }, (response) => {
        resolve(response);
      });
    });

    if (domResult.success && apiResult?.success && apiResult.track) {
      const domMs = domResult.ms;
      const apiMs = apiResult.track.progress_ms;
      const diff = Math.abs(domMs - apiMs);

      // They should be within 2 seconds of each other
      const inSync = diff < 2000;
      recordTest('Progress Sync (DOM vs API)', inSync,
        `DOM: ${domMs}ms, API: ${apiMs}ms, Diff: ${diff}ms`);

      return { success: true, domMs, apiMs, diff, inSync };
    } else {
      recordTest('Progress Sync (DOM vs API)', false, 'Could not compare - missing data');
      return { success: false };
    }
  }

  // ============================================
  // TEST 9: Abrupt Change Detection Logic
  // ============================================
  function testAbruptChangeDetection() {
    log('Testing abrupt change detection logic...', 'test');

    const THRESHOLD = 3000; // 3 seconds

    // Test cases
    const testCases = [
      { lastProgress: 10000, currentProgress: 11000, timeDelta: 1000, expected: false, desc: 'Normal playback' },
      { lastProgress: 10000, currentProgress: 5000, timeDelta: 500, expected: true, desc: 'Backward jump (new song)' },
      { lastProgress: 10000, currentProgress: 20000, timeDelta: 500, expected: true, desc: 'Large forward jump (scrub/skip)' },
      { lastProgress: 10000, currentProgress: 12000, timeDelta: 2000, expected: false, desc: 'Normal 2s playback' },
      { lastProgress: 60000, currentProgress: 0, timeDelta: 500, expected: true, desc: 'Reset to 0 (new song)' },
    ];

    let allPassed = true;
    for (const tc of testCases) {
      const progressDelta = tc.currentProgress - tc.lastProgress;
      const backwardJump = progressDelta < -THRESHOLD;
      const forwardJump = progressDelta > tc.timeDelta + THRESHOLD;
      const isAbrupt = backwardJump || forwardJump;

      const passed = isAbrupt === tc.expected;
      if (!passed) allPassed = false;

      recordTest(`Abrupt Detection: ${tc.desc}`, passed,
        `Expected: ${tc.expected}, Got: ${isAbrupt}`);
    }

    return { success: allPassed };
  }

  // ============================================
  // TEST 10: Full Groovy Logic Simulation
  // ============================================
  async function testGroovyLogicSimulation() {
    log('Testing groovy logic simulation...', 'test');

    // Get current track
    const trackResult = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'getCurrentTrack' }, resolve);
    });

    if (!trackResult?.success || !trackResult.track) {
      recordTest('Groovy Logic Simulation', false, 'No track playing');
      return { success: false };
    }

    const track = trackResult.track;
    const progress = track.progress_ms;

    // Get groovy data
    const groovyResult = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'getGroovyData', trackId: track.id }, resolve);
    });

    if (!groovyResult?.success) {
      recordTest('Groovy Logic Simulation', false, 'Failed to fetch groovy data');
      return { success: false };
    }

    if (!groovyResult.groovyData) {
      recordTest('Groovy Logic Simulation', true, 'No groovy data - would play normally');
      return { success: true, action: 'play_normal' };
    }

    const groovy = groovyResult.groovyData;
    let expectedAction = '';

    if (progress < groovy.intime) {
      expectedAction = 'seek_to_intime';
    } else if (progress >= groovy.intime && progress < groovy.outtime) {
      expectedAction = 'let_play';
    } else {
      expectedAction = 'skip_to_next';
    }

    recordTest('Groovy Logic Simulation', true,
      `Progress: ${progress}ms, Intime: ${groovy.intime}ms, Outtime: ${groovy.outtime}ms → Action: ${expectedAction}`);

    return { success: true, progress, intime: groovy.intime, outtime: groovy.outtime, action: expectedAction };
  }

  // ============================================
  // RUN ALL TESTS
  // ============================================
  async function runAllTests() {
    console.clear();
    log(`Groovy Extension Evaluation v${EVAL_VERSION}`, 'info');
    log('=' .repeat(50), 'info');

    // Reset results
    testResults.passed = 0;
    testResults.failed = 0;
    testResults.tests = [];

    // Run tests in order
    log('Starting tests...', 'info');
    console.log('');

    // Test 1: Authentication
    await testAuthentication();
    console.log('');

    // Test 2: DOM Progress
    await testDOMProgress();
    console.log('');

    // Test 3: API Current Track
    const trackResult = await testAPIGetCurrentTrack();
    console.log('');

    // Test 4: API Queue
    await testAPIGetQueue();
    console.log('');

    // Test 5: API Seek
    await testAPISeekDryRun();
    console.log('');

    // Test 6: Groovy Data (if we have a track)
    if (trackResult.success && trackResult.track) {
      await testGroovyDataFetch(trackResult.track.id);
    }
    console.log('');

    // Test 7: Content Script Status
    await testContentScriptStatus();
    console.log('');

    // Test 8: Progress Comparison
    await testProgressComparison();
    console.log('');

    // Test 9: Abrupt Change Detection Logic
    testAbruptChangeDetection();
    console.log('');

    // Test 10: Groovy Logic Simulation
    await testGroovyLogicSimulation();
    console.log('');

    // Summary
    log('=' .repeat(50), 'info');
    log(`SUMMARY: ${testResults.passed} passed, ${testResults.failed} failed`,
      testResults.failed === 0 ? 'pass' : 'fail');

    if (testResults.failed > 0) {
      log('Failed tests:', 'warn');
      testResults.tests.filter(t => !t.passed).forEach(t => {
        log(`  - ${t.name}: ${t.details}`, 'fail');
      });
    }

    return testResults;
  }

  // ============================================
  // INDIVIDUAL TEST RUNNERS
  // ============================================
  window.GroovyEval = {
    version: EVAL_VERSION,
    runAll: runAllTests,
    testAuth: testAuthentication,
    testDOM: testDOMProgress,
    testTrack: testAPIGetCurrentTrack,
    testQueue: testAPIGetQueue,
    testSeek: testAPISeekDryRun,
    testGroovy: testGroovyDataFetch,
    testStatus: testContentScriptStatus,
    testProgressSync: testProgressComparison,
    testAbruptDetection: testAbruptChangeDetection,
    testLogic: testGroovyLogicSimulation,
    results: testResults,

    // Quick diagnostic
    quick: async function() {
      log('Quick Diagnostic...', 'info');
      const auth = await testAuthentication();
      const dom = await testDOMProgress();
      const track = await testAPIGetCurrentTrack();

      console.log('');
      log('Quick Summary:', 'info');
      log(`  Auth: ${auth.loggedIn ? 'OK' : 'FAIL'}`, auth.loggedIn ? 'pass' : 'fail');
      log(`  DOM: ${dom.success ? 'OK' : 'FAIL'} ${dom.text || ''}`, dom.success ? 'pass' : 'fail');
      log(`  API Track: ${track.success ? 'OK' : 'FAIL'} ${track.track?.name || ''}`, track.success ? 'pass' : 'fail');

      return { auth, dom, track };
    },

    // Test a specific track's groovy data
    testTrackGroovy: async function(trackId) {
      if (!trackId) {
        const track = await testAPIGetCurrentTrack();
        if (track.success) {
          trackId = track.track.id;
        } else {
          log('No track ID provided and no track playing', 'fail');
          return;
        }
      }
      return await testGroovyDataFetch(trackId);
    },

    // Manual seek test (will actually seek!)
    manualSeekTest: async function(positionMs) {
      log(`Manual seek test to ${positionMs}ms...`, 'warn');
      return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'seekToPosition', positionMs }, (response) => {
          if (response?.success) {
            log(`Seek to ${positionMs}ms successful!`, 'pass');
          } else {
            log(`Seek failed: ${JSON.stringify(response)}`, 'fail');
          }
          resolve(response);
        });
      });
    },

    // Manual skip test (will actually skip!)
    manualSkipTest: async function() {
      log('Manual skip test...', 'warn');
      return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'skipToNext' }, (response) => {
          if (response?.success) {
            log('Skip successful!', 'pass');
          } else {
            log(`Skip failed: ${JSON.stringify(response)}`, 'fail');
          }
          resolve(response);
        });
      });
    },

    // Force reinitialize
    reinit: async function() {
      log('Forcing reinitialize...', 'info');
      return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'reinitialize' }, (response) => {
          log(`Reinitialize: ${JSON.stringify(response)}`, response?.success ? 'pass' : 'fail');
          resolve(response);
        });
      });
    },

    help: function() {
      console.log(`
╔══════════════════════════════════════════════════════════════╗
║                 GROOVY EVAL - HELP                           ║
╠══════════════════════════════════════════════════════════════╣
║ GroovyEval.runAll()          - Run all tests                 ║
║ GroovyEval.quick()           - Quick diagnostic              ║
║                                                              ║
║ Individual Tests:                                            ║
║ GroovyEval.testAuth()        - Test authentication           ║
║ GroovyEval.testDOM()         - Test DOM progress reading     ║
║ GroovyEval.testTrack()       - Test API getCurrentTrack      ║
║ GroovyEval.testQueue()       - Test API getQueue             ║
║ GroovyEval.testSeek()        - Test API seek (safe)          ║
║ GroovyEval.testGroovy(id)    - Test groovy data fetch        ║
║ GroovyEval.testStatus()      - Test content script status    ║
║ GroovyEval.testProgressSync()- Compare DOM vs API progress   ║
║ GroovyEval.testLogic()       - Simulate groovy logic         ║
║                                                              ║
║ Manual Actions (actually perform):                           ║
║ GroovyEval.manualSeekTest(ms) - Seek to position             ║
║ GroovyEval.manualSkipTest()   - Skip to next                 ║
║ GroovyEval.reinit()           - Force reinitialize           ║
║                                                              ║
║ GroovyEval.results           - View last test results        ║
╚══════════════════════════════════════════════════════════════╝
      `);
    }
  };

  log('Groovy Eval loaded! Run GroovyEval.help() for commands, or GroovyEval.runAll() to start.', 'info');

})();
