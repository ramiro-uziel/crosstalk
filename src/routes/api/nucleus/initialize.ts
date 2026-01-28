import { createFileRoute } from '@tanstack/react-router'
import { supabase } from '../../../lib/supabase'
import { fetchUserTopTracks } from '../../../lib/spotify'
import { analyzeLyrics } from '../../../lib/gemini'
import { searchGeniusLyrics } from '../../../lib/genius'
import { userQueries, nucleusQueries, trackQueries } from '../../../lib/database'
import type { Track } from '../../../types/track'

export const Route = createFileRoute('/api/nucleus/initialize')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          // Get authenticated user from Supabase
          const { data: { session }, error: sessionError } = await supabase.auth.getSession()

          if (sessionError || !session) {
            return new Response(
              JSON.stringify({ error: 'Not authenticated' }),
              { status: 401, headers: { 'Content-Type': 'application/json' } }
            )
          }

          const userId = session.user.id
          const spotifyAccessToken = session.provider_token

          if (!spotifyAccessToken) {
            return new Response(
              JSON.stringify({ error: 'No Spotify access token' }),
              { status: 401, headers: { 'Content-Type': 'application/json' } }
            )
          }

          const geminiApiKey = process.env.VITE_GEMINI_API_KEY
          const geniusToken = process.env.VITE_GENIUS_ACCESS_TOKEN

          if (!geminiApiKey) {
            return new Response(
              JSON.stringify({ error: 'Missing Gemini API key' }),
              { status: 500, headers: { 'Content-Type': 'application/json' } }
            )
          }

          // Check if user already has an active nucleus
          const existingNucleus = nucleusQueries.getByUserId.get(userId) as any
          if (existingNucleus) {
            return new Response(
              JSON.stringify({ error: 'User already has an active nucleus', nucleus: existingNucleus }),
              { status: 409, headers: { 'Content-Type': 'application/json' } }
            )
          }

          // Fetch user's top 15 tracks from Spotify
          const topTracks = await fetchUserTopTracks(spotifyAccessToken, 15)

          // Create new nucleus
          const nucleusResult = nucleusQueries.insert.run(
            userId,
            'The Nucleus',
            'Your musical universe',
            15
          )
          const nucleusId = nucleusResult.lastInsertRowid as number

          // Analyze and add each track
          const analyzedTracks: Track[] = []

          for (const track of topTracks) {
            try {
              // Search for lyrics
              let lyrics = null
              let geniusUrl = null

              if (geniusToken) {
                const lyricsResult = await searchGeniusLyrics(
                  track.name,
                  track.artists[0]?.name || '',
                  geniusToken
                )
                lyrics = lyricsResult.lyrics
                geniusUrl = lyricsResult.url
              }

              // Skip tracks without lyrics
              if (!lyrics) {
                console.log(`Skipping ${track.name} - no lyrics found`)
                continue
              }

              // Analyze lyrics
              const analysis = await analyzeLyrics(
                lyrics,
                track.name,
                track.artists[0]?.name || '',
                geminiApiKey
              )

              const thumbnailUrl = track.album.images[0]?.url || null

              // Insert track
              const trackResult = trackQueries.insert.run(
                nucleusId,
                track.id,
                `https://open.spotify.com/track/${track.id}`,
                track.name,
                track.artists[0]?.name || null,
                lyrics,
                geniusUrl,
                track.preview_url ? 1 : 0,
                analysis.emotion,
                analysis.valence,
                analysis.energy,
                analysis.tempo || null,
                analysis.genre,
                analysis.mood_description,
                analysis.dominant_instruments || null,
                analysis.vocal_characteristics,
                track.duration_ms,
                thumbnailUrl,
                track.preview_url
              )

              const insertedTrack = trackQueries.getById.get(trackResult.lastInsertRowid) as Track
              analyzedTracks.push(insertedTrack)
            } catch (error) {
              console.error(`Error analyzing track ${track.name}:`, error)
            }
          }

          return new Response(
            JSON.stringify({
              nucleus: nucleusQueries.getById.get(nucleusId),
              tracks: analyzedTracks,
              message: `Initialized nucleus with ${analyzedTracks.length} tracks`
            }),
            { status: 201, headers: { 'Content-Type': 'application/json' } }
          )
        } catch (error) {
          console.error('Error initializing nucleus:', error)
          return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          )
        }
      },
    },
  },
})
