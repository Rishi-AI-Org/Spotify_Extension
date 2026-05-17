package com.groovy.collector

import android.content.ComponentName
import android.content.Context
import android.media.session.MediaController
import android.media.session.MediaSessionManager
import android.os.Handler
import android.os.Looper
import android.service.notification.NotificationListenerService
import android.util.Log

/**
 * NotificationListenerService whose only job is to be enabled so that
 * MediaSessionManager.getActiveSessions() works. The bulk of the logic
 * lives in PlaybackTracker, which subscribes to Spotify's MediaController.
 */
class SpotifyListenerService : NotificationListenerService() {

    private lateinit var sessionManager: MediaSessionManager
    private val mainHandler = Handler(Looper.getMainLooper())
    private val tracker by lazy { PlaybackTracker(applicationContext) }

    private val componentName by lazy {
        ComponentName(applicationContext, SpotifyListenerService::class.java)
    }

    private val listenerCallback = MediaSessionManager.OnActiveSessionsChangedListener { controllers ->
        attachToSpotify(controllers ?: emptyList())
    }

    private val pollRunnable = object : Runnable {
        override fun run() {
            if (!isListenerBound) return
            try {
                attachToSpotify(sessionManager.getActiveSessions(componentName))
            } catch (e: Throwable) {
                Log.w(TAG, "Poll getActiveSessions failed: ${e.message}")
            }
            mainHandler.postDelayed(this, POLL_INTERVAL_MS)
        }
    }

    override fun onListenerConnected() {
        super.onListenerConnected()
        Log.i(TAG, "Listener connected")
        sessionManager = getSystemService(Context.MEDIA_SESSION_SERVICE) as MediaSessionManager
        sessionManager.addOnActiveSessionsChangedListener(listenerCallback, componentName, mainHandler)
        attachToSpotify(sessionManager.getActiveSessions(componentName))
        mainHandler.removeCallbacks(pollRunnable)
        mainHandler.postDelayed(pollRunnable, POLL_INTERVAL_MS)
    }

    override fun onListenerDisconnected() {
        Log.i(TAG, "Listener disconnected")
        try {
            sessionManager.removeOnActiveSessionsChangedListener(listenerCallback)
        } catch (_: Throwable) { /* not yet initialized */ }
        mainHandler.removeCallbacks(pollRunnable)
        tracker.detach()
        super.onListenerDisconnected()
    }

    private fun attachToSpotify(controllers: List<MediaController>) {
        lastDetectedPackages = controllers.map { it.packageName }
        val spotify = controllers.firstOrNull { it.packageName.startsWith(SPOTIFY_PKG_PREFIX) }
        tracker.bind(spotify)
        isAttachedToSpotify = spotify != null
        lastConnectedAt = System.currentTimeMillis()
        if (spotify != null) {
            Log.i(TAG, "Attached to Spotify session: ${spotify.packageName}")
        }
    }

    override fun onCreate() {
        super.onCreate()
        isListenerBound = true
    }

    override fun onDestroy() {
        isListenerBound = false
        isAttachedToSpotify = false
        mainHandler.removeCallbacks(pollRunnable)
        super.onDestroy()
    }

    companion object {
        private const val TAG = "GroovyListener"
        // Match Spotify, Spotify Lite, Spotify Stations, etc.
        const val SPOTIFY_PKG_PREFIX = "com.spotify"
        private const val POLL_INTERVAL_MS = 5_000L

        @Volatile var isListenerBound: Boolean = false
        @Volatile var isAttachedToSpotify: Boolean = false
        @Volatile var lastConnectedAt: Long = 0L
        @Volatile var lastDetectedPackages: List<String> = emptyList()
    }
}

