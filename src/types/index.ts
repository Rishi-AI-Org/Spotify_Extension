export interface GroovyPart {
  id?: string;
  track_id: string;
  track_name?: string;
  artist_name?: string;
  intime: number; // milliseconds
  outtime: number; // milliseconds
  source?: 'user' | 'global';
  confidence_score?: number;
  created_at?: string;
  updated_at?: string;
}

export interface SpotifyToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
}

export interface SpotifyUser {
  id: string;
  display_name: string;
  email?: string;
}

export type PlaybackEventType = 'skip_to_next' | 'natural_transition' | 'seek_forward';

export interface ClientPlaybackEvent {
  client_session_id: string;
  artist: string;
  name: string;
  duration_ms: number;
  event_type: PlaybackEventType;
  position_ms: number;
  occurred_at: string; // ISO timestamp
}

export interface ClientPartySession {
  client_session_id: string;
  started_at: string;
  ended_at?: string;
  track_count: number;
  qualifying_skip_count: number;
}

export interface EventBatchPayload {
  anon_id: string;
  app_version?: string;
  android_sdk?: number;
  sessions: ClientPartySession[];
  events: ClientPlaybackEvent[];
}
