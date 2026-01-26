/**
 * SQLite Database Service for Galaxy Tracks
 */
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';

export interface Track {
  id: number;
  title: string;
  artist: string | null;
  spotify_url: string;
  spotify_id: string;

  // Gemini Analysis
  emotion: string;
  valence: number | null;
  energy: number | null;
  tempo: number | null;
  genre: string | null;
  mood_description: string | null;
  dominant_instruments: string | null;
  vocal_characteristics: string | null;

  // Metadata
  duration: number | null;
  thumbnail_url: string | null;
  added_at: string;
  last_played_at: string | null;
  play_count: number;

  // User metadata
  user_notes: string | null;
  favorite: boolean;
}

export interface NewTrack {
  title: string;
  artist?: string;
  spotify_url: string;
  spotify_id: string;
  emotion: string;
  valence?: number;
  energy?: number;
  tempo?: number;
  genre?: string;
  mood_description?: string;
  dominant_instruments?: string;
  vocal_characteristics?: string;
  duration?: number;
  thumbnail_url?: string;
}

class DatabaseService {
  private db: Database.Database | null = null;
  private readonly dbPath = join(process.cwd(), 'galaxy-tracks.db');

  constructor() {
    this.initialize();
  }

  private initialize() {
    try {
      this.db = new Database(this.dbPath);
      this.db.pragma('journal_mode = WAL');
      
      // Read and execute schema
      const schemaPath = join(process.cwd(), 'src', 'db', 'schema.sql');
      const schema = readFileSync(schemaPath, 'utf-8');
      
      // Execute each statement separately
      const statements = schema.split(';').filter(s => s.trim());
      for (const statement of statements) {
        if (statement.trim()) {
          this.db.exec(statement);
        }
      }
      
      console.log('✅ Database initialized successfully');
    } catch (error) {
      console.error('❌ Database initialization error:', error);
      throw error;
    }
  }

  /**
   * Add a new track to the database
   */
  addTrack(track: NewTrack): Track {
    if (!this.db) throw new Error('Database not initialized');
    
    const stmt = this.db.prepare(`
      INSERT INTO tracks (
        title, artist, spotify_url, spotify_id,
        emotion, valence, energy, tempo, genre,
        mood_description, dominant_instruments, vocal_characteristics,
        duration, thumbnail_url
      ) VALUES (
        @title, @artist, @spotify_url, @spotify_id,
        @emotion, @valence, @energy, @tempo, @genre,
        @mood_description, @dominant_instruments, @vocal_characteristics,
        @duration, @thumbnail_url
      )
    `);

    const result = stmt.run({
      title: track.title,
      artist: track.artist || null,
      spotify_url: track.spotify_url,
      spotify_id: track.spotify_id,
      emotion: track.emotion,
      valence: track.valence ?? null,
      energy: track.energy ?? null,
      tempo: track.tempo ?? null,
      genre: track.genre || null,
      mood_description: track.mood_description || null,
      dominant_instruments: track.dominant_instruments || null,
      vocal_characteristics: track.vocal_characteristics || null,
      duration: track.duration ?? null,
      thumbnail_url: track.thumbnail_url || null,
    });
    
    return this.getTrack(result.lastInsertRowid as number)!;
  }

  /**
   * Get a track by ID
   */
  getTrack(id: number): Track | null {
    if (!this.db) throw new Error('Database not initialized');
    
    const stmt = this.db.prepare('SELECT * FROM tracks WHERE id = ?');
    return stmt.get(id) as Track | null;
  }

  /**
   * Get all tracks
   */
  getAllTracks(): Track[] {
    if (!this.db) throw new Error('Database not initialized');
    
    const stmt = this.db.prepare('SELECT * FROM tracks ORDER BY added_at DESC');
    return stmt.all() as Track[];
  }

  /**
   * Get tracks by emotion
   */
  getTracksByEmotion(emotion: string): Track[] {
    if (!this.db) throw new Error('Database not initialized');
    
    const stmt = this.db.prepare('SELECT * FROM tracks WHERE emotion = ? ORDER BY added_at DESC');
    return stmt.all(emotion) as Track[];
  }

  /**
   * Update track
   */
  updateTrack(id: number, updates: Partial<Track>): boolean {
    if (!this.db) throw new Error('Database not initialized');
    
    const fields = Object.keys(updates).filter(k => k !== 'id');
    if (fields.length === 0) return false;
    
    const setClause = fields.map(f => `${f} = @${f}`).join(', ');
    const stmt = this.db.prepare(`UPDATE tracks SET ${setClause} WHERE id = @id`);
    
    const result = stmt.run({ id, ...updates });
    return result.changes > 0;
  }

  /**
   * Delete track
   */
  deleteTrack(id: number): boolean {
    if (!this.db) throw new Error('Database not initialized');
    
    const stmt = this.db.prepare('DELETE FROM tracks WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Increment play count
   */
  incrementPlayCount(id: number): void {
    if (!this.db) throw new Error('Database not initialized');
    
    const stmt = this.db.prepare(`
      UPDATE tracks 
      SET play_count = play_count + 1, 
          last_played_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `);
    stmt.run(id);
  }

  /**
   * Get track count by emotion
   */
  getEmotionCounts(): Record<string, number> {
    if (!this.db) throw new Error('Database not initialized');
    
    const stmt = this.db.prepare('SELECT emotion, COUNT(*) as count FROM tracks GROUP BY emotion');
    const rows = stmt.all() as { emotion: string; count: number }[];
    
    return rows.reduce((acc, row) => {
      acc[row.emotion] = row.count;
      return acc;
    }, {} as Record<string, number>);
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

// Singleton instance
let dbInstance: DatabaseService | null = null;

export function getDatabase(): DatabaseService {
  if (!dbInstance) {
    dbInstance = new DatabaseService();
  }
  return dbInstance;
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}


