package com.groovy.collector

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

/**
 * Local SQLite buffer for captured playback events. Events sit here until
 * the upload worker successfully POSTs them, then they're deleted.
 */
class EventDb(context: Context) : SQLiteOpenHelper(context.applicationContext, NAME, null, VERSION) {

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE raw_events (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              client_session_id TEXT NOT NULL,
              artist TEXT NOT NULL,
              name TEXT NOT NULL,
              duration_ms INTEGER NOT NULL,
              prev_event_type TEXT NOT NULL, -- skip_to_next | natural_transition | seek_forward
              position_ms INTEGER NOT NULL,
              occurred_at INTEGER NOT NULL    -- epoch ms
            )
            """.trimIndent()
        )
        db.execSQL("CREATE INDEX idx_raw_session ON raw_events(client_session_id)")
        db.execSQL("CREATE INDEX idx_raw_time ON raw_events(occurred_at)")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        db.execSQL("DROP TABLE IF EXISTS raw_events")
        onCreate(db)
    }

    fun insertEvent(e: RawEvent) {
        writableDatabase.insert("raw_events", null, ContentValues().apply {
            put("client_session_id", e.clientSessionId)
            put("artist", e.artist)
            put("name", e.name)
            put("duration_ms", e.durationMs)
            put("prev_event_type", e.eventType)
            put("position_ms", e.positionMs)
            put("occurred_at", e.occurredAt)
        })
    }

    fun count(): Long {
        readableDatabase.rawQuery("SELECT COUNT(*) FROM raw_events", null).use { c ->
            return if (c.moveToFirst()) c.getLong(0) else 0L
        }
    }

    fun loadAll(): List<RawEventRow> {
        val out = mutableListOf<RawEventRow>()
        readableDatabase.rawQuery(
            "SELECT id, client_session_id, artist, name, duration_ms, prev_event_type, position_ms, occurred_at " +
                "FROM raw_events ORDER BY occurred_at ASC", null
        ).use { c ->
            while (c.moveToNext()) {
                out += RawEventRow(
                    id = c.getLong(0),
                    clientSessionId = c.getString(1),
                    artist = c.getString(2),
                    name = c.getString(3),
                    durationMs = c.getInt(4),
                    eventType = c.getString(5),
                    positionMs = c.getInt(6),
                    occurredAt = c.getLong(7),
                )
            }
        }
        return out
    }

    fun deleteIds(ids: List<Long>) {
        if (ids.isEmpty()) return
        val db = writableDatabase
        db.beginTransaction()
        try {
            val stmt = db.compileStatement("DELETE FROM raw_events WHERE id = ?")
            for (id in ids) {
                stmt.clearBindings()
                stmt.bindLong(1, id)
                stmt.executeUpdateDelete()
            }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    companion object {
        const val NAME = "groovy_events.db"
        const val VERSION = 1
    }
}

data class RawEvent(
    val clientSessionId: String,
    val artist: String,
    val name: String,
    val durationMs: Int,
    val eventType: String,
    val positionMs: Int,
    val occurredAt: Long,
)

data class RawEventRow(
    val id: Long,
    val clientSessionId: String,
    val artist: String,
    val name: String,
    val durationMs: Int,
    val eventType: String,
    val positionMs: Int,
    val occurredAt: Long,
)
