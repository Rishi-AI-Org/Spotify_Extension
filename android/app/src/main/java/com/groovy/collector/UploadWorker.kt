package com.groovy.collector

import android.content.Context
import android.os.Build
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.TimeUnit

class UploadWorker(appContext: Context, params: WorkerParameters) :
    CoroutineWorker(appContext, params) {

    private val prefs = Prefs(appContext)
    private val db = EventDb(appContext)

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        try {
            val rows = db.loadAll()
            if (rows.isEmpty()) return@withContext Result.success()

            val classified = PartyModeClassifier.classify(rows)
            if (classified.uploadEvents.isEmpty()) {
                // Still mark the non-party rows as handled so the buffer doesn't grow forever.
                db.deleteIds(classified.handledIds)
                return@withContext Result.success()
            }

            val payload = buildPayload(classified)
            val ok = postBatch(payload)
            if (!ok) return@withContext Result.retry()

            db.deleteIds(classified.handledIds)
            prefs.lastUploadAt = System.currentTimeMillis()
            prefs.totalUploaded = prefs.totalUploaded + classified.uploadEvents.size
            Result.success()
        } catch (e: Exception) {
            Log.e(TAG, "Upload failed", e)
            Result.retry()
        }
    }

    private fun buildPayload(c: PartyModeClassifier.Classified): String {
        val root = JSONObject()
        root.put("anon_id", prefs.anonId)
        root.put("app_version", "0.1.0")
        root.put("android_sdk", Build.VERSION.SDK_INT)

        val sessions = JSONArray()
        for (s in c.sessions) {
            sessions.put(JSONObject().apply {
                put("client_session_id", s.clientSessionId)
                put("started_at", iso(s.startedAt))
                put("ended_at", iso(s.endedAt))
                put("track_count", s.trackCount)
                put("qualifying_skip_count", s.qualifyingSkipCount)
            })
        }
        root.put("sessions", sessions)

        val events = JSONArray()
        for (e in c.uploadEvents) {
            events.put(JSONObject().apply {
                put("client_session_id", e.clientSessionId)
                put("artist", e.artist)
                put("name", e.name)
                put("duration_ms", e.durationMs)
                put("event_type", e.eventType)
                put("position_ms", e.positionMs)
                put("occurred_at", iso(e.occurredAt))
            })
        }
        root.put("events", events)
        return root.toString()
    }

    private fun postBatch(json: String): Boolean {
        val client = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .build()
        val url = "${BuildConfig.BACKEND_BASE_URL}/api/events/batch"
        val req = Request.Builder()
            .url(url)
            .post(json.toRequestBody("application/json".toMediaType()))
            .build()
        return try {
            client.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) {
                    Log.w(TAG, "POST $url -> ${resp.code}: ${resp.body?.string()}")
                }
                resp.isSuccessful
            }
        } catch (e: Exception) {
            Log.w(TAG, "POST $url failed: ${e.message}")
            false
        }
    }

    companion object {
        private const val TAG = "GroovyUpload"
        private val isoFmt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }
        @Synchronized
        private fun iso(epochMs: Long): String = isoFmt.format(Date(epochMs))
    }
}
