export interface ChatMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  nucleus_name: string | null
  emotion?: string | null
}

export interface NucleusMetadata {
  id: number
  name: string
  description: string | null
  updated_at: string
  dominant_emotion: string | null
}

export interface TrackRecommendation {
  spotifyUrl: string
  title: string
  artist: string
  reason: string
  targetEmotion: string
}
