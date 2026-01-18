import { supabase } from './supabase';

/**
 * Database setup script
 * Run this once to create the tables in Supabase
 */

const setupDatabase = async () => {
  console.log('Setting up database...');

  // Create groovy_parts table
  const { error } = await supabase.rpc('exec_sql', {
    sql: `
      CREATE TABLE IF NOT EXISTS groovy_parts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        track_id TEXT UNIQUE NOT NULL,
        track_name TEXT,
        artist_name TEXT,
        intime INTEGER NOT NULL,
        outtime INTEGER NOT NULL,
        source TEXT DEFAULT 'user',
        confidence_score FLOAT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_track_id ON groovy_parts(track_id);
      CREATE INDEX IF NOT EXISTS idx_source ON groovy_parts(source);
    `
  });

  if (error) {
    console.error('❌ Error creating tables:', error);
    console.log('\n📝 Please run this SQL manually in Supabase SQL Editor:');
    console.log(`
CREATE TABLE IF NOT EXISTS groovy_parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id TEXT UNIQUE NOT NULL,
  track_name TEXT,
  artist_name TEXT,
  intime INTEGER NOT NULL,
  outtime INTEGER NOT NULL,
  source TEXT DEFAULT 'user',
  confidence_score FLOAT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_track_id ON groovy_parts(track_id);
CREATE INDEX IF NOT EXISTS idx_source ON groovy_parts(source);
    `);
  } else {
    console.log('✅ Database tables created successfully!');
  }
};

setupDatabase();
