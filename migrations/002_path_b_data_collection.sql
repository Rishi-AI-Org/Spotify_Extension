-- Path B: Notification-listener-based crowdsourced data collection.
-- Apply this in the Supabase SQL editor (Database -> SQL Editor) after the
-- baseline schema from database-setup.sql is in place.

-- Devices: one row per install, fully anonymous.
CREATE TABLE IF NOT EXISTS devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anon_id TEXT UNIQUE NOT NULL,
  app_version TEXT,
  android_sdk INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  last_seen_at TIMESTAMP DEFAULT NOW(),
  total_events_uploaded INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_devices_anon_id ON devices(anon_id);

-- Tracks: canonical track identity, populated from notification metadata.
-- raw_key is sha1(lower(artist) || '|' || lower(name) || '|' || round(duration_ms/1000)).
-- spotify_uri is resolved lazily server-side via Client Credentials search.
CREATE TABLE IF NOT EXISTS tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_key TEXT UNIQUE NOT NULL,
  artist TEXT NOT NULL,
  name TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  spotify_uri TEXT,
  spotify_track_id TEXT,
  resolved_at TIMESTAMP,
  resolution_attempts INTEGER DEFAULT 0,
  first_seen_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tracks_raw_key ON tracks(raw_key);
CREATE INDEX IF NOT EXISTS idx_tracks_spotify_uri ON tracks(spotify_uri) WHERE spotify_uri IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tracks_unresolved ON tracks(resolution_attempts) WHERE spotify_uri IS NULL;

-- Party sessions: a run of consecutive mid-song skips that flagged the user
-- as being in party mode. Boundaries decided client-side.
CREATE TABLE IF NOT EXISTS party_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  client_session_id TEXT NOT NULL,
  started_at TIMESTAMP NOT NULL,
  ended_at TIMESTAMP,
  track_count INTEGER DEFAULT 0,
  qualifying_skip_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (device_id, client_session_id)
);
CREATE INDEX IF NOT EXISTS idx_party_sessions_device ON party_sessions(device_id);

-- Playback events: raw stream from the Android NotificationListener.
-- Only events captured during party-mode sessions (and trimmed of first/last
-- two tracks) should be uploaded.
CREATE TABLE IF NOT EXISTS playback_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  party_session_id UUID REFERENCES party_sessions(id) ON DELETE CASCADE,
  track_id UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('skip_to_next', 'natural_transition', 'seek_forward')),
  position_ms INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  occurred_at TIMESTAMP NOT NULL,
  uploaded_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_events_track ON playback_events(track_id);
CREATE INDEX IF NOT EXISTS idx_events_session ON playback_events(party_session_id);
CREATE INDEX IF NOT EXISTS idx_events_occurred ON playback_events(occurred_at DESC);

-- Track aggregates: rolling mean intime/outtime after std-dev outlier filter.
-- Recomputed on demand or via cron. Promotes to groovy_parts when confidence
-- (sample size) crosses a threshold.
CREATE TABLE IF NOT EXISTS track_aggregates (
  track_id UUID PRIMARY KEY REFERENCES tracks(id) ON DELETE CASCADE,
  sample_size INTEGER NOT NULL,
  raw_sample_size INTEGER NOT NULL,
  mean_intime_ms INTEGER,
  mean_outtime_ms INTEGER,
  stddev_intime_ms FLOAT,
  stddev_outtime_ms FLOAT,
  last_computed_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_aggregates_sample ON track_aggregates(sample_size DESC);
