/**
 * React hook for managing galaxy tracks
 */
import { useState, useEffect, useCallback } from 'react';
import type { Track } from '../db/database';
import {
  analyzeSpotifyTrack,
  isValidSpotifyUrl,
  extractSpotifyId
} from '../services/gemini-spotify';

// Client-side track management (will call API routes in production)
export interface UseTracksOptions {
  apiKey?: string; // Gemini API key
  spotifyClientId?: string; // Spotify Client ID
  spotifyClientSecret?: string; // Spotify Client Secret
  autoLoad?: boolean;
}

export interface TracksByEmotion {
  [emotion: string]: Track[];
}

export function useTracks(options: UseTracksOptions = {}) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [tracksByEmotion, setTracksByEmotion] = useState<TracksByEmotion>({});
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load tracks from localStorage (since we're client-side only for now)
  const loadTracks = useCallback(() => {
    try {
      const stored = localStorage.getItem('galaxy-tracks');
      if (stored) {
        const loadedTracks = JSON.parse(stored) as any[];

        // Migration: Check if tracks have old YouTube URLs and clear them
        const hasOldTracks = loadedTracks.some(track =>
          'youtube_url' in track || 'youtube_id' in track
        );

        if (hasOldTracks) {
          console.warn('Detected old YouTube tracks. Clearing localStorage for migration to Spotify.');
          localStorage.removeItem('galaxy-tracks');
          setTracks([]);
          setTracksByEmotion({});
          setError('⚠️ Old YouTube tracks detected and cleared. Please add your tracks again using Spotify URLs.');
          return;
        }

        setTracks(loadedTracks as Track[]);

        // Group by emotion
        const grouped = loadedTracks.reduce((acc, track) => {
          if (!acc[track.emotion]) {
            acc[track.emotion] = [];
          }
          acc[track.emotion].push(track);
          return acc;
        }, {} as TracksByEmotion);

        setTracksByEmotion(grouped);
      }
    } catch (err) {
      console.error('Failed to load tracks:', err);
      setError('Failed to load tracks from storage');
    }
  }, []);

  // Save tracks to localStorage
  const saveTracks = useCallback((newTracks: Track[]) => {
    try {
      localStorage.setItem('galaxy-tracks', JSON.stringify(newTracks));
      setTracks(newTracks);
      
      // Update grouped tracks
      const grouped = newTracks.reduce((acc, track) => {
        if (!acc[track.emotion]) {
          acc[track.emotion] = [];
        }
        acc[track.emotion].push(track);
        return acc;
      }, {} as TracksByEmotion);
      
      setTracksByEmotion(grouped);
    } catch (err) {
      console.error('Failed to save tracks:', err);
      setError('Failed to save tracks to storage');
    }
  }, []);

  // Add a track from Spotify URL
  const addTrackFromSpotify = useCallback(async (spotifyUrl: string): Promise<Track | null> => {
    if (!options.apiKey) {
      setError('Gemini API key is required');
      return null;
    }

    if (!isValidSpotifyUrl(spotifyUrl)) {
      setError('Invalid Spotify URL');
      return null;
    }

    setIsAnalyzing(true);
    setError(null);

    try {
      // Analyze with Gemini and Spotify Web API
      const analysis = await analyzeSpotifyTrack(spotifyUrl, options.apiKey, options.spotifyClientId, options.spotifyClientSecret);

      // Create track object
      const newTrack: Track = {
        id: Date.now(), // Simple ID generation for client-side
        title: analysis.title,
        artist: analysis.artist || null,
        spotify_url: spotifyUrl,
        spotify_id: extractSpotifyId(spotifyUrl)!,
        emotion: analysis.emotion,
        valence: analysis.valence,
        energy: analysis.energy,
        tempo: analysis.tempo || null,
        genre: analysis.genre || null,
        mood_description: analysis.moodDescription,
        dominant_instruments: analysis.dominantInstruments || null,
        vocal_characteristics: analysis.vocalCharacteristics || null,
        duration: analysis.duration || null,
        thumbnail_url: analysis.thumbnail || null,
        added_at: new Date().toISOString(),
        last_played_at: null,
        play_count: 0,
        user_notes: null,
        favorite: false,
      };

      // Add to tracks - read current state from localStorage to avoid stale closure
      // This ensures we get the latest tracks even if state hasn't updated yet
      let currentTracks: Track[] = [];
      try {
        const stored = localStorage.getItem('galaxy-tracks');
        if (stored) {
          currentTracks = JSON.parse(stored) as Track[];
        }
      } catch {
        currentTracks = [];
      }

      const updatedTracks = [...currentTracks, newTrack];
      saveTracks(updatedTracks);

      return newTrack;
    } catch (err) {
      console.error('Failed to add track:', err);
      setError(err instanceof Error ? err.message : 'Failed to analyze Spotify track');
      return null;
    } finally {
      setIsAnalyzing(false);
    }
  }, [options.apiKey, options.spotifyClientId, options.spotifyClientSecret, saveTracks]); // Removed 'tracks' - we read directly from localStorage

  // Delete track
  const deleteTrack = useCallback((trackId: number) => {
    const updatedTracks = tracks.filter(t => t.id !== trackId);
    saveTracks(updatedTracks);
  }, [tracks, saveTracks]);

  // Update track
  const updateTrack = useCallback((trackId: number, updates: Partial<Track>) => {
    const updatedTracks = tracks.map(t => 
      t.id === trackId ? { ...t, ...updates } : t
    );
    saveTracks(updatedTracks);
  }, [tracks, saveTracks]);

  // Increment play count
  const playTrack = useCallback((trackId: number) => {
    const updatedTracks = tracks.map(t => 
      t.id === trackId 
        ? { 
            ...t, 
            play_count: t.play_count + 1,
            last_played_at: new Date().toISOString()
          }
        : t
    );
    saveTracks(updatedTracks);
  }, [tracks, saveTracks]);

  // Get tracks by emotion
  const getTracksByEmotion = useCallback((emotion: string): Track[] => {
    return tracksByEmotion[emotion] || [];
  }, [tracksByEmotion]);

  // Load on mount
  useEffect(() => {
    if (options.autoLoad !== false) {
      loadTracks();
    }
  }, [loadTracks, options.autoLoad]);

  return {
    tracks,
    tracksByEmotion,
    isAnalyzing,
    error,
    addTrackFromSpotify,
    deleteTrack,
    updateTrack,
    playTrack,
    getTracksByEmotion,
    loadTracks,
    clearError: () => setError(null),
  };
}

