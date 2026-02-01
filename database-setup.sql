-- Groovy Spotify Database Setup
-- Run this SQL in Supabase SQL Editor (Database → SQL Editor → New Query)

-- Create the groovy_parts table
CREATE TABLE IF NOT EXISTS groovy_parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id TEXT UNIQUE NOT NULL,
  track_name TEXT,
  artist_name TEXT,
  intime INTEGER NOT NULL,
  outtime INTEGER NOT NULL,
  source TEXT DEFAULT 'user',
  confidence_score FLOAT,
  contribution_count INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Add contribution_count column if table already exists (migration)
ALTER TABLE groovy_parts ADD COLUMN IF NOT EXISTS contribution_count INTEGER DEFAULT 1;

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_track_id ON groovy_parts(track_id);
CREATE INDEX IF NOT EXISTS idx_source ON groovy_parts(source);
CREATE INDEX IF NOT EXISTS idx_created_at ON groovy_parts(created_at DESC);

-- Insert some sample data (optional - for testing)
INSERT INTO groovy_parts (track_id, track_name, artist_name, intime, outtime, source)
VALUES
  ('3n3Ppam7vgaVa1iaRUc9Lp', 'Mr. Brightside', 'The Killers', 15000, 195000, 'user'),
  ('0VjIjW4GlUZAMYd2vXMi3b', 'Blinding Lights', 'The Weeknd', 10000, 170000, 'user')
ON CONFLICT (track_id) DO NOTHING;

-- Verify table creation
SELECT * FROM groovy_parts LIMIT 5;
