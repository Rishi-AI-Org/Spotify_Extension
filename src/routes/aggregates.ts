import { Router, Request, Response } from 'express';
import { supabase } from '../db/supabase';

const router = Router();

const DEFAULT_MIN_SAMPLE_SIZE = Math.max(
  1,
  Number(process.env.MIN_AGGREGATE_SAMPLE) || 2
);

interface TrackRow {
  id: string;
  artist: string;
  name: string;
  duration_ms: number;
  spotify_uri: string | null;
}

interface EventRow {
  position_ms: number;
  event_type: string;
}

function meanStddev(values: number[]): { mean: number; stddev: number } {
  if (values.length === 0) return { mean: 0, stddev: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
  return { mean, stddev: Math.sqrt(variance) };
}

/**
 * Apply the two-pass filter described in the spec:
 *   1. Compute mean + stddev of raw samples.
 *   2. Drop samples >1σ from the mean.
 *   3. Recompute mean from the filtered set.
 * Returns null if there are zero samples. For 1–2 samples the stddev
 * filter is degenerate, so we fall back to the raw mean.
 */
function filteredMean(
  values: number[],
  minN: number
): {
  filteredMean: number | null;
  rawStddev: number;
  rawN: number;
  filteredN: number;
} {
  const { mean: rawMean, stddev: rawStddev } = meanStddev(values);
  if (values.length === 0) {
    return { filteredMean: null, rawStddev, rawN: 0, filteredN: 0 };
  }
  if (values.length < Math.max(3, minN)) {
    return {
      filteredMean: values.length >= minN ? Math.round(rawMean) : null,
      rawStddev,
      rawN: values.length,
      filteredN: values.length,
    };
  }
  const kept = values.filter((v) => Math.abs(v - rawMean) <= rawStddev);
  if (kept.length < minN) {
    return { filteredMean: null, rawStddev, rawN: values.length, filteredN: kept.length };
  }
  const { mean } = meanStddev(kept);
  return {
    filteredMean: Math.round(mean),
    rawStddev,
    rawN: values.length,
    filteredN: kept.length,
  };
}

/**
 * POST /api/aggregates/refresh
 * Recompute track_aggregates from playback_events. Idempotent.
 * Body (optional): { track_id?: string } to refresh just one track.
 */
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const onlyTrack = req.body?.track_id as string | undefined;
    const minN = Math.max(1, Number(req.query.min_n ?? req.body?.min_n ?? DEFAULT_MIN_SAMPLE_SIZE));

    let tracksQuery = supabase.from('tracks').select('id, artist, name, duration_ms, spotify_uri');
    if (onlyTrack) tracksQuery = tracksQuery.eq('id', onlyTrack);
    const { data: tracks, error: trackErr } = await tracksQuery;
    if (trackErr) throw trackErr;

    let recomputed = 0;
    for (const track of (tracks ?? []) as TrackRow[]) {
      const { data: events, error: evErr } = await supabase
        .from('playback_events')
        .select('position_ms, event_type')
        .eq('track_id', track.id);
      if (evErr) throw evErr;
      const rows = (events ?? []) as EventRow[];

      // intime samples: positions of seek_forward events (where they jumped into a part)
      // outtime samples: positions of skip_to_next events (where they jumped out)
      const intimes = rows
        .filter((e) => e.event_type === 'seek_forward')
        .map((e) => e.position_ms);
      const outtimes = rows
        .filter((e) => e.event_type === 'skip_to_next')
        .map((e) => e.position_ms);

      const intimeR = filteredMean(intimes, minN);
      const outtimeR = filteredMean(outtimes, minN);

      const rawN = Math.max(intimeR.rawN, outtimeR.rawN);
      if (rawN === 0) continue;

      await supabase.from('track_aggregates').upsert(
        {
          track_id: track.id,
          sample_size: Math.max(intimeR.filteredN, outtimeR.filteredN),
          raw_sample_size: rawN,
          mean_intime_ms: intimeR.filteredMean,
          mean_outtime_ms: outtimeR.filteredMean,
          stddev_intime_ms: intimeR.rawStddev,
          stddev_outtime_ms: outtimeR.rawStddev,
          last_computed_at: new Date().toISOString(),
        },
        { onConflict: 'track_id' }
      );

      // Promote high-confidence outtimes to groovy_parts so the existing
      // GET /api/groovy/:trackId keeps serving canonical "global" data.
      if (
        track.spotify_uri &&
        outtimeR.filteredMean !== null &&
        intimeR.filteredMean !== null
      ) {
        await supabase.from('groovy_parts').upsert(
          {
            track_id: track.spotify_uri,
            track_name: track.name,
            artist_name: track.artist,
            intime: intimeR.filteredMean,
            outtime: outtimeR.filteredMean,
            source: 'global',
            confidence_score: Math.min(1, outtimeR.filteredN / 20),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'track_id' }
        );
      }

      recomputed++;
    }

    res.json({ recomputed, total_tracks: (tracks ?? []).length });
  } catch (err: any) {
    console.error('Aggregation failed:', err);
    res.status(500).json({ error: 'aggregation failed', message: err?.message });
  }
});

/**
 * GET /api/aggregates
 * Public list of tracks with enough data to be useful.
 * Optional ?min_n=5
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const minN = Math.max(1, Number(req.query.min_n ?? DEFAULT_MIN_SAMPLE_SIZE));
    const { data, error } = await supabase
      .from('track_aggregates')
      .select(
        'sample_size, raw_sample_size, mean_intime_ms, mean_outtime_ms, stddev_intime_ms, stddev_outtime_ms, last_computed_at, tracks!inner(artist, name, duration_ms, spotify_uri)'
      )
      .gte('sample_size', minN)
      .order('sample_size', { ascending: false })
      .limit(200);
    if (error) throw error;
    res.json({ data });
  } catch (err: any) {
    console.error('Aggregates list failed:', err);
    res.status(500).json({ error: 'list failed', message: err?.message });
  }
});

export default router;
