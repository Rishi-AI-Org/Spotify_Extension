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
