import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'

// Resolve db path relative to this file's location (project root is 2 dirs up from src/lib/)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbPath = path.join(__dirname, '..', '..', 'crosstalk.db')
export const db = new Database(dbPath)

db.exec(`
  CREATE TABLE IF NOT EXISTS tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    spotify_id TEXT UNIQUE NOT NULL,
    spotify_url TEXT NOT NULL,
    title TEXT NOT NULL,
    artist TEXT,
    lyrics TEXT,
    genius_url TEXT,
    has_audio_preview BOOLEAN DEFAULT 1,
    emotion TEXT NOT NULL,
    valence REAL,
    energy REAL,
    tempo INTEGER,
    genre TEXT,
    mood_description TEXT,
    dominant_instruments TEXT,
    vocal_characteristics TEXT,
    duration INTEGER,
    thumbnail_url TEXT,
    preview_url TEXT,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    nucleus_name TEXT,
    emotion TEXT DEFAULT NULL
  );

  CREATE TABLE IF NOT EXISTS nucleus_metadata (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    name TEXT NOT NULL DEFAULT 'The Nucleus',
    description TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    dominant_emotion TEXT
  );

  INSERT OR IGNORE INTO nucleus_metadata (id, name) VALUES (1, 'The Nucleus');
`)

// Add emotion column to chat_messages if it doesn't exist
try {
  db.exec(`ALTER TABLE chat_messages ADD COLUMN emotion TEXT DEFAULT NULL;`)
} catch (e) {
  // Column already exists, ignore
}

// Add preview_url column to tracks if it doesn't exist
try {
  db.exec(`ALTER TABLE tracks ADD COLUMN preview_url TEXT;`)
} catch (e) {
  // Column already exists, ignore
}

export const trackQueries = {
  getAll: db.prepare('SELECT * FROM tracks ORDER BY added_at DESC'),
  getById: db.prepare('SELECT * FROM tracks WHERE id = ?'),
  getBySpotifyId: db.prepare('SELECT * FROM tracks WHERE spotify_id = ?'),
  insert: db.prepare(`
    INSERT INTO tracks (
      spotify_id, spotify_url, title, artist, lyrics, genius_url,
      has_audio_preview, emotion, valence, energy, tempo, genre,
      mood_description, dominant_instruments, vocal_characteristics,
      duration, thumbnail_url, preview_url
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  delete: db.prepare('DELETE FROM tracks WHERE id = ?'),
  getByEmotion: db.prepare('SELECT * FROM tracks WHERE emotion = ? ORDER BY added_at DESC'),
}

export const chatQueries = {
  getAll: db.prepare('SELECT * FROM chat_messages ORDER BY timestamp ASC'),
  getRecent: db.prepare('SELECT * FROM chat_messages ORDER BY timestamp DESC LIMIT ?'),
  insert: db.prepare('INSERT INTO chat_messages (role, content, nucleus_name) VALUES (?, ?, ?)'),
  deleteAll: db.prepare('DELETE FROM chat_messages'),
  // Emotion-specific queries
  getByEmotion: db.prepare('SELECT * FROM chat_messages WHERE emotion = ? ORDER BY timestamp ASC'),
  getRecentByEmotion: db.prepare('SELECT * FROM chat_messages WHERE emotion = ? ORDER BY timestamp DESC LIMIT ?'),
  insertWithEmotion: db.prepare('INSERT INTO chat_messages (role, content, nucleus_name, emotion) VALUES (?, ?, ?, ?)'),
}

export const nucleusQueries = {
  get: db.prepare('SELECT * FROM nucleus_metadata WHERE id = 1'),
  updateName: db.prepare('UPDATE nucleus_metadata SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1'),
  updateDominantEmotion: db.prepare('UPDATE nucleus_metadata SET dominant_emotion = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1'),
}
