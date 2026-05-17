package com.groovy.collector

import android.content.Context
import android.content.SharedPreferences
import java.util.UUID

class Prefs(context: Context) {
    private val sp: SharedPreferences =
        context.getSharedPreferences(NAME, Context.MODE_PRIVATE)

    val anonId: String
        get() {
            val existing = sp.getString(KEY_ANON_ID, null)
            if (existing != null) return existing
            val fresh = UUID.randomUUID().toString()
            sp.edit().putString(KEY_ANON_ID, fresh).apply()
            return fresh
        }

    var lastUploadAt: Long
        get() = sp.getLong(KEY_LAST_UPLOAD, 0L)
        set(value) = sp.edit().putLong(KEY_LAST_UPLOAD, value).apply()

    var totalUploaded: Long
        get() = sp.getLong(KEY_TOTAL_UPLOADED, 0L)
        set(value) = sp.edit().putLong(KEY_TOTAL_UPLOADED, value).apply()

    companion object {
        const val NAME = "groovy_prefs"
        private const val KEY_ANON_ID = "anon_id"
        private const val KEY_LAST_UPLOAD = "last_upload_at"
        private const val KEY_TOTAL_UPLOADED = "total_uploaded"
    }
}
