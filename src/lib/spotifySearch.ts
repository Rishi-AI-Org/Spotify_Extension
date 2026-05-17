import axios from 'axios';

interface CachedToken {
  token: string;
  expiresAt: number;
}

let cachedToken: CachedToken | null = null;

async function getAppToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60_000) {
    return cachedToken.token;
  }

  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error('SPOTIFY_CLIENT_ID/SECRET not configured');
  }

  const basic = Buffer.from(`${id}:${secret}`).toString('base64');
  const res = await axios.post(
    'https://accounts.spotify.com/api/token',
    'grant_type=client_credentials',
    {
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );

  cachedToken = {
    token: res.data.access_token,
    expiresAt: now + res.data.expires_in * 1000,
  };
  return cachedToken.token;
}

export interface ResolvedTrack {
  spotify_uri: string;
  spotify_track_id: string;
  matched_name: string;
  matched_artist: string;
  matched_duration_ms: number;
}

/**
 * Resolve a (artist, name, duration_ms) tuple to a canonical Spotify track
 * via the Search API using Client Credentials. Uses duration as a tiebreaker
 * to pick the closest match. Returns null if no match within 2s of duration.
 */
export async function resolveSpotifyTrack(
  artist: string,
  name: string,
  durationMs: number
): Promise<ResolvedTrack | null> {
  const token = await getAppToken();
  const q = `track:"${name.replace(/"/g, '')}" artist:"${artist.replace(/"/g, '')}"`;
  const res = await axios.get('https://api.spotify.com/v1/search', {
    params: { q, type: 'track', limit: 10 },
    headers: { Authorization: `Bearer ${token}` },
  });

  const items: any[] = res.data?.tracks?.items ?? [];
  if (items.length === 0) return null;

  // Pick the candidate with the closest duration to ours, within 2000ms.
  let best: any = null;
  let bestDelta = Infinity;
  for (const item of items) {
    const delta = Math.abs((item.duration_ms ?? 0) - durationMs);
    if (delta < bestDelta) {
      best = item;
      bestDelta = delta;
    }
  }
  if (!best || bestDelta > 2000) return null;

  return {
    spotify_uri: best.uri,
    spotify_track_id: best.id,
    matched_name: best.name,
    matched_artist: best.artists?.[0]?.name ?? '',
    matched_duration_ms: best.duration_ms,
  };
}
