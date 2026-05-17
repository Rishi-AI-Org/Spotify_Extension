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

    override fun onListenerConnected() {
        super.onListenerConnected()
        Log.i(TAG, "Listener connected")
        sessionManager = getSystemService(Context.MEDIA_SESSION_SERVICE) as MediaSessionManager
        sessionManager.addOnActiveSessionsChangedListener(listenerCallback, componentName, mainHandler)
        attachToSpotify(sessionManager.getActiveSessions(componentName))
    }

    override fun onListenerDisconnected() {
        Log.i(TAG, "Listener disconnected")
        try {
            sessionManager.removeOnActiveSessionsChangedListener(listenerCallback)
        } catch (_: Throwable) { /* not yet initialized */ }
        tracker.detach()
        super.onListenerDisconnected()
    }

    private fun attachToSpotify(controllers: List<MediaController>) {
        val spotify = controllers.firstOrNull { it.packageName == SPOTIFY_PKG }
        tracker.bind(spotify)
        isAttachedToSpotify = spotify != null
        lastConnectedAt = System.currentTimeMillis()
    }

    companion object {
        private const val TAG = "GroovyListener"
        const val SPOTIFY_PKG = "com.spotify.music"

        @Volatile var isListenerBound: Boolean = false
        @Volatile var isAttachedToSpotify: Boolean = false
        @Volatile var lastConnectedAt: Long = 0L
    }

    override fun onCreate() {
        super.onCreate()
        isListenerBound = true
    }

    override fun onDestroy() {
        isListenerBound = false
        isAttachedToSpotify = false
        super.onDestroy()
    }
}
