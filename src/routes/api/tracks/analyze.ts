import { createFileRoute } from '@tanstack/react-router'
import { extractSpotifyTrackId, fetchSpotifyMetadata, downloadPreviewMp3 } from '../../../lib/spotify'
import { analyzeAudioFile, analyzeSpotifyEmbed } from '../../../lib/gemini'
import { searchGeniusLyrics } from '../../../lib/genius'
import { trackQueries } from '../../../lib/database'
import type { Track } from '../../../types/track'

export const Route = createFileRoute('/api/tracks/analyze')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { spotifyUrl } = await request.json()

          const clientId = process.env.SPOTIFY_CLIENT_ID
          const clientSecret = process.env.SPOTIFY_CLIENT_SECRET
          const geminiApiKey = process.env.GEMINI_API_KEY
          const geniusToken = process.env.GENIUS_ACCESS_TOKEN

          if (!clientId || !clientSecret || !geminiApiKey) {
            return new Response(
              JSON.stringify({ error: 'Missing API credentials' }),
              { status: 500, headers: { 'Content-Type': 'application/json' } }
            )
          }

          const trackId = extractSpotifyTrackId(spotifyUrl)
          if (!trackId) {
            return new Response(
              JSON.stringify({ error: 'Invalid Spotify URL' }),
              { status: 400, headers: { 'Content-Type': 'application/json' } }
            )
          }

          const existing = trackQueries.getBySpotifyId.get(trackId) as Track | undefined
          if (existing) {
            return new Response(
              JSON.stringify({ error: 'Track already exists', track: existing }),
              { status: 409, headers: { 'Content-Type': 'application/json' } }
            )
          }

          const metadata = await fetchSpotifyMetadata(trackId, clientId, clientSecret)

          let analysis
          let hasPreview = false

          if (metadata.preview_url) {
            try {
              const audioBuffer = await downloadPreviewMp3(metadata.preview_url)
              analysis = await analyzeAudioFile(audioBuffer, geminiApiKey)
              hasPreview = true
            } catch (error) {
              console.error('Failed to analyze audio file, falling back to embed:', error)
              analysis = await analyzeSpotifyEmbed(spotifyUrl, geminiApiKey)
            }
          } else {
            analysis = await analyzeSpotifyEmbed(spotifyUrl, geminiApiKey)
          }

          let lyrics = null
          let geniusUrl = null

          if (geniusToken) {
            const lyricsResult = await searchGeniusLyrics(
              metadata.name,
              metadata.artists[0]?.name || '',
              geniusToken
            )
            lyrics = lyricsResult.lyrics
            geniusUrl = lyricsResult.url
          }

          const thumbnailUrl = metadata.album.images[0]?.url || null

          const result = trackQueries.insert.run(
            trackId,
            spotifyUrl,
            metadata.name,
            metadata.artists[0]?.name || null,
            lyrics,
            geniusUrl,
            hasPreview ? 1 : 0,
            analysis.emotion,
            analysis.valence,
            analysis.energy,
            analysis.tempo,
            analysis.genre,
            analysis.mood_description,
            analysis.dominant_instruments,
            analysis.vocal_characteristics,
            metadata.duration_ms,
            thumbnailUrl
          )

          const track = trackQueries.getById.get(result.lastInsertRowid) as Track

          return new Response(
            JSON.stringify({ track }),
            { status: 201, headers: { 'Content-Type': 'application/json' } }
          )
        } catch (error) {
          console.error('Error analyzing track:', error)
          return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          )
        }
      },
    },
  },
})
