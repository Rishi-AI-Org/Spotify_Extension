package com.groovy.collector

import android.content.ComponentName
import android.content.Intent
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
                delay(2000)
            }
        }
    }

    private suspend fun refreshStatus() {
        val granted = isNotificationListenerEnabled()
        val queued = withContext(Dispatchers.IO) { db.count() }
        val uploaded = prefs.totalUploaded
        binding.statusText.text = when {
            !granted -> getString(R.string.status_inactive)
            else -> getString(R.string.status_active)
        }
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
    }

    private fun isNotificationListenerEnabled(): Boolean {
        val cn = ComponentName(this, SpotifyListenerService::class.java)
        val flat = Settings.Secure.getString(contentResolver, "enabled_notification_listeners") ?: return false
        return flat.split(":").any { it.equals(cn.flattenToString(), ignoreCase = true) }
    }
}
