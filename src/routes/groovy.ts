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
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const groovyData: GroovyPart = req.body;

    // Validate required fields
    if (!groovyData.track_id || !groovyData.intime || !groovyData.outtime) {
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

    // Upsert (insert or update if exists)
    const { data, error } = await supabase
      .from('groovy_parts')
      .upsert({
        track_id: groovyData.track_id,
        track_name: groovyData.track_name,
        artist_name: groovyData.artist_name,
        intime: groovyData.intime,
        outtime: groovyData.outtime,
        source: groovyData.source || 'user',
        confidence_score: groovyData.confidence_score,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'track_id'
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json(data);
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
