package com.groovy.collector

import android.content.Context
import android.media.MediaMetadata
import android.media.session.MediaController
import android.media.session.PlaybackState
import android.os.SystemClock
import android.util.Log
import java.util.UUID
import kotlin.math.abs

/**
 * Subscribes to Spotify's MediaController and infers a stream of playback
 * events from metadata + playback-state callbacks. Writes raw events to
 * the local SQLite buffer; the party-mode classification happens at upload
 * time.
 *
 * Inference rules:
 *   - Track change after we last saw position < (duration - 5000ms)
 *       -> previous track ended with `skip_to_next` at that position.
 *   - Track change after we last saw position >= (duration - 5000ms)
 *       -> previous track ended with `natural_transition`.
 *   - Playback-state update where wall-clock-adjusted position jumps
 *     forward by more than 3000ms (and metadata didn't change)
 *       -> `seek_forward` event on the current track at the new position.
 *
 * A "client session" is restarted whenever there's been > 5 minutes
 * since the previous tick.
 */
class PlaybackTracker(context: Context) {

    private val db = EventDb(context)

    private var controller: MediaController? = null
    private var callback: MediaController.Callback? = null

    // Last observation:
    private var lastTrackKey: String? = null
    private var lastArtist: String? = null
    private var lastName: String? = null
    private var lastDuration: Int = 0
    private var lastPositionMs: Int = 0
    private var lastPositionUpdatedElapsed: Long = 0L
    private var lastIsPlaying: Boolean = false

    // Session:
    private var clientSessionId: String = UUID.randomUUID().toString()
    private var lastEventEpoch: Long = 0L

    @Synchronized
    fun bind(c: MediaController?) {
        if (controller?.sessionToken == c?.sessionToken) return
        detach()
        controller = c ?: return
        val cb = object : MediaController.Callback() {
            override fun onMetadataChanged(metadata: MediaMetadata?) {
                handleMetadata(metadata)
            }

            override fun onPlaybackStateChanged(state: PlaybackState?) {
                handlePlaybackState(state)
            }

            override fun onSessionDestroyed() {
                Log.i(TAG, "Spotify session destroyed")
                detach()
            }
        }
        callback = cb
        c.registerCallback(cb)
        handleMetadata(c.metadata)
        handlePlaybackState(c.playbackState)
        Log.i(TAG, "Bound to Spotify controller")
    }

    @Synchronized
    fun detach() {
        val cb = callback
        val c = controller
        if (cb != null && c != null) {
            try { c.unregisterCallback(cb) } catch (_: Throwable) {}
        }
        callback = null
        controller = null
    }

    @Synchronized
    private fun handleMetadata(meta: MediaMetadata?) {
        if (meta == null) return
        val artist = meta.getString(MediaMetadata.METADATA_KEY_ARTIST)
            ?: meta.getString(MediaMetadata.METADATA_KEY_ALBUM_ARTIST)
            ?: return
        val title = meta.getString(MediaMetadata.METADATA_KEY_TITLE) ?: return
        val duration = meta.getLong(MediaMetadata.METADATA_KEY_DURATION).toInt()
        if (duration <= 0) return

        val newKey = "$artist::$title::$duration"
        if (newKey == lastTrackKey) return

        // Emit a transition for the OUTGOING track.
        val prevArtist = lastArtist
        val prevName = lastName
        val prevDuration = lastDuration
        if (prevArtist != null && prevName != null && prevDuration > 0) {
            val now = System.currentTimeMillis()
            rotateSessionIfStale(now)
            val pos = projectedPosition()
            val transitionType =
                if (pos < prevDuration - NATURAL_END_TOLERANCE_MS) "skip_to_next"
                else "natural_transition"
            db.insertEvent(
                RawEvent(
                    clientSessionId = clientSessionId,
                    artist = prevArtist,
                    name = prevName,
                    durationMs = prevDuration,
                    eventType = transitionType,
                    positionMs = pos.coerceAtLeast(0),
                    occurredAt = now,
                )
            )
            lastEventEpoch = now
            Log.d(TAG, "$transitionType @ ${pos}ms of '$prevName'")
        }

        lastTrackKey = newKey
        lastArtist = artist
        lastName = title
        lastDuration = duration
        lastPositionMs = 0
        lastPositionUpdatedElapsed = SystemClock.elapsedRealtime()
    }

    @Synchronized
    private fun handlePlaybackState(state: PlaybackState?) {
        if (state == null) return
        val nowElapsed = SystemClock.elapsedRealtime()
        val reportedPos = state.position.toInt()

        // If we have a known previous position, check for seek_forward.
        if (lastTrackKey != null && lastPositionUpdatedElapsed > 0L && state.state == PlaybackState.STATE_PLAYING) {
            val elapsedDelta = nowElapsed - lastPositionUpdatedElapsed
            val expected = lastPositionMs + elapsedDelta.toInt()
            val jump = reportedPos - expected
            if (jump > SEEK_FORWARD_THRESHOLD_MS && reportedPos < lastDuration - 1000) {
                val now = System.currentTimeMillis()
                rotateSessionIfStale(now)
                db.insertEvent(
                    RawEvent(
                        clientSessionId = clientSessionId,
                        artist = lastArtist ?: return,
                        name = lastName ?: return,
                        durationMs = lastDuration,
                        eventType = "seek_forward",
                        positionMs = reportedPos.coerceAtLeast(0),
                        occurredAt = now,
                    )
                )
                lastEventEpoch = now
                Log.d(TAG, "seek_forward to ${reportedPos}ms (jump ${jump}ms)")
            }
        }

        lastPositionMs = reportedPos
        lastPositionUpdatedElapsed = nowElapsed
        lastIsPlaying = state.state == PlaybackState.STATE_PLAYING
    }

    /** Project the previous track's exit position using cached state only. */
    private fun projectedPosition(): Int {
        if (lastPositionUpdatedElapsed == 0L) return lastPositionMs
        if (!lastIsPlaying) return lastPositionMs
        val elapsed = SystemClock.elapsedRealtime() - lastPositionUpdatedElapsed
        return (lastPositionMs + elapsed.toInt()).coerceAtMost(lastDuration)
    }

    private fun rotateSessionIfStale(now: Long) {
        if (lastEventEpoch == 0L) return
        if (now - lastEventEpoch > SESSION_GAP_MS) {
            clientSessionId = UUID.randomUUID().toString()
            Log.i(TAG, "Rotated session -> $clientSessionId")
        }
    }

    companion object {
        private const val TAG = "GroovyTracker"
        private const val NATURAL_END_TOLERANCE_MS = 5_000
        private const val SEEK_FORWARD_THRESHOLD_MS = 3_000
        private const val SESSION_GAP_MS = 5 * 60 * 1000L
    }
}
