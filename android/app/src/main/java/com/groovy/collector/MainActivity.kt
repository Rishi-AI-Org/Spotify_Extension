package com.groovy.collector

import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.provider.Settings
import android.text.format.DateUtils
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.groovy.collector.databinding.ActivityMainBinding
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var prefs: Prefs
    private lateinit var db: EventDb

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        prefs = Prefs(this)
        db = EventDb(this)

        UploadScheduler.ensurePeriodic(applicationContext)

        binding.grantButton.setOnClickListener {
            startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
        }
        binding.uploadNowButton.setOnClickListener {
            UploadScheduler.runOnce(applicationContext)
        }
        binding.reconnectButton.setOnClickListener {
            forceListenerRebind()
        }
        binding.anonIdText.text = getString(R.string.anon_id, prefs.anonId)
    }

    override fun onResume() {
        super.onResume()
        startStatusLoop()
    }

    private fun startStatusLoop() {
        lifecycleScope.launch {
            while (true) {
                refreshStatus()
                delay(1500)
            }
        }
    }

    private suspend fun refreshStatus() {
        val granted = isNotificationListenerEnabled()
        val listenerBound = SpotifyListenerService.isListenerBound
        val spotifyAttached = SpotifyListenerService.isAttachedToSpotify
        val queued = withContext(Dispatchers.IO) { db.count() }
        val uploaded = prefs.totalUploaded

        binding.statusText.text = when {
            !granted -> getString(R.string.status_inactive)
            !listenerBound -> getString(R.string.status_listener_disconnected)
            !spotifyAttached -> getString(R.string.status_no_spotify)
            else -> getString(R.string.status_active)
        }

        val yes = getString(R.string.yes)
        val no = getString(R.string.no)
        binding.permissionCheckText.text = getString(R.string.permission_check, if (granted) yes else no)
        binding.listenerCheckText.text = getString(R.string.listener_check, if (listenerBound) yes else no)
        binding.spotifyCheckText.text = getString(R.string.spotify_check, if (spotifyAttached) yes else no)

        binding.countsText.text = getString(R.string.events_queued, queued.toInt(), uploaded.toInt())
        val last = prefs.lastUploadAt
        binding.lastUploadText.text = if (last == 0L) getString(R.string.last_upload_never)
        else getString(
            R.string.last_upload_at,
            DateUtils.getRelativeTimeSpanString(
                last,
                System.currentTimeMillis(),
                DateUtils.MINUTE_IN_MILLIS
            ).toString()
        )
        binding.grantButton.visibility = if (granted) android.view.View.GONE else android.view.View.VISIBLE
        binding.reconnectButton.visibility =
            if (granted && (!listenerBound || !spotifyAttached)) android.view.View.VISIBLE
            else android.view.View.GONE
    }

    /**
     * Tolerant check that works across Android skins which may store the
     * enabled listener as either packageName/fullyQualifiedClassName or
     * packageName/.ShortClassName.
     */
    private fun isNotificationListenerEnabled(): Boolean {
        val flat = Settings.Secure.getString(contentResolver, "enabled_notification_listeners") ?: return false
        if (flat.isEmpty()) return false
        val pkg = packageName
        val full = SpotifyListenerService::class.java.name
        val short = ".${SpotifyListenerService::class.java.simpleName}"
        return flat.split(":").any { entry ->
            val parts = entry.split("/")
            if (parts.size != 2) return@any false
            if (parts[0] != pkg) return@any false
            val cls = parts[1]
            cls == full || cls == short || cls == SpotifyListenerService::class.java.simpleName
        }
    }

    /**
     * Disable then re-enable the listener component so the system rebinds it.
     * Useful right after the user grants notification access, since some
     * Android versions don't start the service immediately.
     */
    private fun forceListenerRebind() {
        val cn = ComponentName(this, SpotifyListenerService::class.java)
        val pm = packageManager
        pm.setComponentEnabledSetting(
            cn,
            PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
            PackageManager.DONT_KILL_APP
        )
        pm.setComponentEnabledSetting(
            cn,
            PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
            PackageManager.DONT_KILL_APP
        )
    }
}
