-- Galaxy Emotions and Tracks Database Schema

CREATE TABLE IF NOT EXISTS tracks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  artist TEXT,
  spotify_url TEXT NOT NULL UNIQUE,
  spotify_id TEXT NOT NULL,

  -- Gemini Analysis Results
  emotion TEXT NOT NULL, -- joy, sadness, anger, fear, love, surprise, calm, nostalgia
  valence REAL, -- 0-1 (negative to positive)
  energy REAL, -- 0-1 (calm to energetic)
  tempo INTEGER, -- BPM
  genre TEXT,
  mood_description TEXT,
  dominant_instruments TEXT,
  vocal_characteristics TEXT,

  -- Metadata
  duration INTEGER, -- seconds
  thumbnail_url TEXT,
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_played_at DATETIME,
  play_count INTEGER DEFAULT 0,

  -- User metadata
  user_notes TEXT,
  favorite BOOLEAN DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_tracks_emotion ON tracks(emotion);
CREATE INDEX IF NOT EXISTS idx_tracks_added_at ON tracks(added_at);
CREATE INDEX IF NOT EXISTS idx_tracks_spotify_id ON tracks(spotify_id);

-- Emotion Stars Configuration (optional - can be used to customize emotion properties)
CREATE TABLE IF NOT EXISTS emotion_stars (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE, -- joy, sadness, etc.
  color TEXT NOT NULL, -- hex color
  position_x REAL,
  position_y REAL,
  position_z REAL,
  custom_properties TEXT -- JSON blob for additional properties
);

-- Pre-populate default emotions
INSERT OR IGNORE INTO emotion_stars (name, color) VALUES 
  ('joy', '#FFD700'),
  ('sadness', '#4169E1'),
  ('anger', '#DC143C'),
  ('fear', '#800080'),
  ('love', '#FF69B4'),
  ('surprise', '#FF8C00'),
  ('calm', '#00CED1'),
  ('nostalgia', '#DDA0DD');


