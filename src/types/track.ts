export type Emotion = 'joy' | 'sadness' | 'anger' | 'fear' | 'love' | 'surprise' | 'calm' | 'nostalgia'

export interface Track {
  id: number
  spotify_id: string
  spotify_url: string
  title: string
  artist: string | null
  lyrics: string | null
  genius_url: string | null
  has_audio_preview: boolean
  emotion: Emotion
  valence: number | null
  energy: number | null
  tempo: number | null
  genre: string | null
  mood_description: string | null
  dominant_instruments: string | null
  vocal_characteristics: string | null
  duration: number | null
  thumbnail_url: string | null
  preview_url: string | null
  added_at: string
}

export interface SpotifyMetadata {
  id: string
  name: string
  artists: { name: string }[]
  preview_url: string | null
  duration_ms: number
  album: {
    images: { url: string; height: number; width: number }[]
  }
  external_urls?: {
    spotify: string
  }
}

export interface AnalysisResult {
  emotion: Emotion
  valence: number
  energy: number
  tempo: number
  genre: string
  mood_description: string
  dominant_instruments: string
  vocal_characteristics: string
}
