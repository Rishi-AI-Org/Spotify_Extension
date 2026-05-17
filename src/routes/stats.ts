import { Router, Request, Response } from 'express';
import { supabase } from '../db/supabase';

const router = Router();

async function count(table: string): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true });
  if (error) throw error;
  return count ?? 0;
}

/**
 * GET /api/stats
 * Aggregate counters for the dashboard header.
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const [
      totalEvents,
      totalTracks,
      totalDevices,
      totalPartySessions,
      totalAggregates,
    ] = await Promise.all([
      count('playback_events'),
      count('tracks'),
      count('devices'),
      count('party_sessions'),
      count('track_aggregates'),
    ]);

    const { count: resolvedCount, error: resolvedErr } = await supabase
      .from('tracks')
      .select('*', { count: 'exact', head: true })
      .not('spotify_uri', 'is', null);
    if (resolvedErr) throw resolvedErr;

    res.json({
      total_events: totalEvents,
      total_tracks: totalTracks,
      total_resolved_tracks: resolvedCount ?? 0,
      total_devices: totalDevices,
      total_party_sessions: totalPartySessions,
      total_aggregates: totalAggregates,
    });
  } catch (err: any) {
    console.error('Stats failed:', err);
    res.status(500).json({ error: 'stats failed', message: err?.message });
  }
});

export default router;
