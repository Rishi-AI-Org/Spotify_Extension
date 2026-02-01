import { Router, Request, Response } from 'express';
import { supabase } from '../db/supabase';
import { GroovyPart } from '../types';

const router = Router();

/**
 * GET /api/groovy/:trackId
 * Get groovy part data for a specific track
 */
router.get('/:trackId', async (req: Request, res: Response) => {
  try {
    const { trackId } = req.params;

    const { data, error } = await supabase
      .from('groovy_parts')
      .select('*')
      .eq('track_id', trackId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No data found
        return res.status(404).json({ error: 'No groovy data found for this track' });
      }
      throw error;
    }

    const groovyPart: GroovyPart = {
      track_id: data.track_id,
      intime: data.intime,
      outtime: data.outtime,
      source: data.source,
      confidence_score: data.confidence_score
    };

    res.json(groovyPart);
  } catch (error) {
    console.error('Error fetching groovy part:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/groovy
 * Create or update groovy part data for a track
 * If track already has groovy data, averages intime/outtime with existing values
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const groovyData: GroovyPart = req.body;

    // Validate required fields
    if (!groovyData.track_id || groovyData.intime === undefined || groovyData.outtime === undefined) {
      return res.status(400).json({
        error: 'Missing required fields: track_id, intime, outtime'
      });
    }

    // Validate time ranges
    if (groovyData.intime < 0 || groovyData.outtime <= groovyData.intime) {
      return res.status(400).json({
        error: 'Invalid time range: outtime must be greater than intime'
      });
    }

    // Check if track already has groovy data
    const { data: existingData, error: fetchError } = await supabase
      .from('groovy_parts')
      .select('*')
      .eq('track_id', groovyData.track_id)
      .single();

    let result;

    if (existingData && !fetchError) {
      // Track exists - calculate averaged values
      const newIntime = Math.round((existingData.intime + groovyData.intime) / 2);
      const newOuttime = Math.round((existingData.outtime + groovyData.outtime) / 2);
      const newContributionCount = (existingData.contribution_count || 1) + 1;

      // Update with averaged values
      const { data, error } = await supabase
        .from('groovy_parts')
        .update({
          intime: newIntime,
          outtime: newOuttime,
          contribution_count: newContributionCount,
          updated_at: new Date().toISOString()
        })
        .eq('track_id', groovyData.track_id)
        .select()
        .single();

      if (error) throw error;
      result = data;
    } else {
      // Track doesn't exist - insert new record
      const { data, error } = await supabase
        .from('groovy_parts')
        .insert({
          track_id: groovyData.track_id,
          track_name: groovyData.track_name,
          artist_name: groovyData.artist_name,
          intime: groovyData.intime,
          outtime: groovyData.outtime,
          source: groovyData.source || 'user',
          confidence_score: groovyData.confidence_score,
          contribution_count: 1
        })
        .select()
        .single();

      if (error) throw error;
      result = data;
    }

    res.status(201).json(result);
  } catch (error) {
    console.error('Error saving groovy part:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/groovy
 * Get all groovy parts (with optional pagination)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { limit = 100, offset = 0 } = req.query;

    const { data, error, count } = await supabase
      .from('groovy_parts')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (error) throw error;

    res.json({
      data,
      pagination: {
        total: count,
        limit: Number(limit),
        offset: Number(offset)
      }
    });
  } catch (error) {
    console.error('Error fetching groovy parts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/groovy/:trackId
 * Delete groovy part data for a track
 */
router.delete('/:trackId', async (req: Request, res: Response) => {
  try {
    const { trackId } = req.params;

    const { error } = await supabase
      .from('groovy_parts')
      .delete()
      .eq('track_id', trackId);

    if (error) throw error;

    res.json({ message: 'Groovy part deleted successfully' });
  } catch (error) {
    console.error('Error deleting groovy part:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
