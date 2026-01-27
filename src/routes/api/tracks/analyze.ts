import { createFileRoute } from '@tanstack/react-router'
import { extractSpotifyTrackId, fetchSpotifyMetadata } from '../../../lib/spotify'
import { analyzeLyrics } from '../../../lib/gemini'
import { searchGeniusLyrics } from '../../../lib/genius'
import { trackQueries } from '../../../lib/database'
import type { Track } from '../../../types/track'

export const Route = createFileRoute('/api/tracks/analyze')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { spotifyUrl } = await request.json()

          const clientId = process.env.VITE_SPOTIFY_CLIENT_ID
          const clientSecret = process.env.VITE_SPOTIFY_CLIENT_SECRET
          const geminiApiKey = process.env.VITE_GEMINI_API_KEY
          const geniusToken = process.env.VITE_GENIUS_ACCESS_TOKEN

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

          // Step 1: Fetch Spotify metadata
          const metadata = await fetchSpotifyMetadata(trackId, clientId, clientSecret)

          // Step 2: Search Genius for lyrics
          let lyrics = null
          let geniusUrl = null

          if (geniusToken) {
            const lyricsResult = await searchGeniusLyrics(
              metadata.name,
              metadata.artists[0]?.name || '',
              geniusToken
            )
            console.log(lyricsResult);
            lyrics = lyricsResult.lyrics
            geniusUrl = lyricsResult.url
          }

          // Step 3: If no lyrics, return 422 error
          if (!lyrics) {
            return new Response(
              JSON.stringify({ error: 'No lyrics found for this track. Unable to analyze emotion.' }),
              { status: 422, headers: { 'Content-Type': 'application/json' } }
            )
          }

          // Step 4: Analyze lyrics with Gemini
          const analysis = await analyzeLyrics(
            lyrics,
            metadata.name,
            metadata.artists[0]?.name || '',
            geminiApiKey
          )

          const thumbnailUrl = metadata.album.images[0]?.url || null

          const result = trackQueries.insert.run(
            trackId,
            spotifyUrl,
            metadata.name,
            metadata.artists[0]?.name || null,
            lyrics,
            geniusUrl,
            metadata.preview_url ? 1 : 0,
            analysis.emotion,
            analysis.valence,
            analysis.energy,
            analysis.tempo || null,
            analysis.genre,
            analysis.mood_description,
            analysis.dominant_instruments || null,
            analysis.vocal_characteristics,
            metadata.duration_ms,
            thumbnailUrl,
            metadata.preview_url || null
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
