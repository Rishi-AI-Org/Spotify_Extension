import { Router, Request, Response } from 'express';
import { supabase } from '../db/supabase';
import { EventBatchPayload } from '../types';
import { trackRawKey } from '../lib/trackKey';
import { resolveSpotifyTrack } from '../lib/spotifySearch';

const router = Router();

/**
 * POST /api/events/batch
 * Body: EventBatchPayload (see types/index.ts)
 *
 * Idempotent best-effort ingest. Returns counts of what was accepted.
 * Unknown tracks are inserted and queued for Spotify URI resolution.
 */
router.post('/batch', async (req: Request, res: Response) => {
  const payload = req.body as EventBatchPayload;
  if (!payload?.anon_id || !Array.isArray(payload.events)) {
    return res.status(400).json({ error: 'anon_id and events[] are required' });
  }

  try {
    // 1. Upsert device by anon_id.
    const { data: device, error: deviceErr } = await supabase
      .from('devices')
      .upsert(
        {
          anon_id: payload.anon_id,
          app_version: payload.app_version,
          android_sdk: payload.android_sdk,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'anon_id' }
      )
      .select('id')
      .single();
    if (deviceErr || !device) throw deviceErr ?? new Error('device upsert failed');
    const deviceId = device.id as string;

    // 2. Upsert party sessions referenced by this batch.
    const sessionIdByClientKey = new Map<string, string>();
    if (payload.sessions?.length) {
      const rows = payload.sessions.map((s) => ({
        device_id: deviceId,
        client_session_id: s.client_session_id,
        started_at: s.started_at,
        ended_at: s.ended_at ?? null,
        track_count: s.track_count,
        qualifying_skip_count: s.qualifying_skip_count,
      }));
      const { data: sessions, error: sessErr } = await supabase
        .from('party_sessions')
        .upsert(rows, { onConflict: 'device_id,client_session_id' })
        .select('id, client_session_id');
      if (sessErr) throw sessErr;
      for (const row of sessions ?? []) {
        sessionIdByClientKey.set(row.client_session_id as string, row.id as string);
      }
    }

    // 3. Upsert tracks by raw_key.
    const trackKeyToInput = new Map<
      string,
      { artist: string; name: string; duration_ms: number }
    >();
    for (const e of payload.events) {
      const k = trackRawKey(e.artist, e.name, e.duration_ms);
      if (!trackKeyToInput.has(k)) {
        trackKeyToInput.set(k, { artist: e.artist, name: e.name, duration_ms: e.duration_ms });
      }
    }
    const trackRows = Array.from(trackKeyToInput.entries()).map(([raw_key, t]) => ({
      raw_key,
      artist: t.artist,
      name: t.name,
      duration_ms: t.duration_ms,
    }));

    const trackIdByRawKey = new Map<string, string>();
    let unresolvedRawKeys: string[] = [];
    if (trackRows.length > 0) {
      const { data: tracks, error: trackErr } = await supabase
        .from('tracks')
        .upsert(trackRows, { onConflict: 'raw_key', ignoreDuplicates: false })
        .select('id, raw_key, spotify_uri');
      if (trackErr) throw trackErr;
      for (const t of tracks ?? []) {
        trackIdByRawKey.set(t.raw_key as string, t.id as string);
        if (!t.spotify_uri) unresolvedRawKeys.push(t.raw_key as string);
      }
    }

    // 4. Insert playback events.
    const eventRows = payload.events.map((e) => {
      const trackId = trackIdByRawKey.get(trackRawKey(e.artist, e.name, e.duration_ms));
      const sessId = sessionIdByClientKey.get(e.client_session_id) ?? null;
      return {
        device_id: deviceId,
        party_session_id: sessId,
        track_id: trackId,
        event_type: e.event_type,
        position_ms: e.position_ms,
        duration_ms: e.duration_ms,
        occurred_at: e.occurred_at,
      };
    });
    let insertedEvents = 0;
    if (eventRows.length > 0) {
      const { error: evErr, count } = await supabase
        .from('playback_events')
        .insert(eventRows, { count: 'exact' });
      if (evErr) throw evErr;
      insertedEvents = count ?? eventRows.length;
    }

    // 5. Bump device's running total.
    await supabase
      .from('devices')
      .update({ total_events_uploaded: insertedEvents })
      .eq('id', deviceId);

    // 6. Fire-and-forget: resolve unknown tracks to Spotify URIs in background.
    if (unresolvedRawKeys.length > 0) {
      // No await — let it run after we respond.
      void resolveTracksInBackground(unresolvedRawKeys);
    }

    res.json({
      device_id: deviceId,
      events_inserted: insertedEvents,
      sessions_upserted: sessionIdByClientKey.size,
      tracks_seen: trackIdByRawKey.size,
      tracks_pending_resolution: unresolvedRawKeys.length,
    });
  } catch (err: any) {
    console.error('Error ingesting event batch:', err);
    res.status(500).json({ error: 'ingest failed', message: err?.message });
  }
});

async function resolveTracksInBackground(rawKeys: string[]) {
  for (const raw_key of rawKeys) {
    try {
      const { data: track, error } = await supabase
        .from('tracks')
        .select('id, artist, name, duration_ms, spotify_uri, resolution_attempts')
        .eq('raw_key', raw_key)
        .single();
      if (error || !track || track.spotify_uri) continue;
      if ((track.resolution_attempts ?? 0) >= 3) continue;

      const match = await resolveSpotifyTrack(track.artist, track.name, track.duration_ms);
      await supabase
        .from('tracks')
        .update({
          spotify_uri: match?.spotify_uri ?? null,
          spotify_track_id: match?.spotify_track_id ?? null,
          resolved_at: match ? new Date().toISOString() : null,
          resolution_attempts: (track.resolution_attempts ?? 0) + 1,
        })
        .eq('id', track.id);
    } catch (err) {
      console.error(`Failed to resolve track ${raw_key}:`, err);
    }
  }
}

export default router;
