import { createFileRoute } from '@tanstack/react-router'
import { extractSpotifyPlaylistId, fetchPlaylistTracks } from '../../../lib/spotify'
import { analyzeLyrics } from '../../../lib/gemini'
import { searchGeniusLyrics } from '../../../lib/genius'
import { trackQueries } from '../../../lib/database'
import type { Track } from '../../../types/track'

export const Route = createFileRoute('/api/tracks/analyze-playlist')({
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

          const playlistId = extractSpotifyPlaylistId(spotifyUrl)
          if (!playlistId) {
            return new Response(
              JSON.stringify({ error: 'Invalid Spotify playlist URL' }),
              { status: 400, headers: { 'Content-Type': 'application/json' } }
            )
          }

          // Fetch up to 25 tracks from playlist
          const playlistTracks = await fetchPlaylistTracks(playlistId, clientId, clientSecret, 25)

          const results: {
            success: Track[]
            failed: Array<{ track: string; artist: string; reason: string }>
            skipped: Array<{ track: string; artist: string; reason: string }>
          } = {
            success: [],
            failed: [],
            skipped: [],
          }

          // Process each track sequentially
          for (const metadata of playlistTracks) {
            const trackName = metadata.name
            const artistName = metadata.artists[0]?.name || 'Unknown Artist'
            const spotifyId = metadata.id
            const trackUrl = metadata.external_urls?.spotify || `https://open.spotify.com/track/${spotifyId}`

            try {
              // Check if track already exists
              const existing = trackQueries.getBySpotifyId.get(spotifyId) as Track | undefined
              if (existing) {
                results.skipped.push({
                  track: trackName,
                  artist: artistName,
                  reason: 'Already in collection',
                })
                continue
              }

              // Search for lyrics
              let lyrics = null
              let geniusUrl = null

              if (geniusToken) {
                try {
                  const lyricsResult = await searchGeniusLyrics(
                    trackName,
                    artistName,
                    geniusToken
                  )
                  lyrics = lyricsResult.lyrics
                  geniusUrl = lyricsResult.url
                } catch (error) {
                  // Lyrics not found - skip this track
                  results.failed.push({
                    track: trackName,
                    artist: artistName,
                    reason: 'No lyrics found',
                  })
                  continue
                }
              }

              if (!lyrics) {
                results.failed.push({
                  track: trackName,
                  artist: artistName,
                  reason: 'No lyrics found',
                })
                continue
              }

              // Analyze lyrics
              const analysis = await analyzeLyrics(
                lyrics,
                trackName,
                artistName,
                geminiApiKey
              )

              const thumbnailUrl = metadata.album.images[0]?.url || null

              // Insert into database
              const result = trackQueries.insert.run(
                spotifyId,
                trackUrl,
                trackName,
                artistName,
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
              results.success.push(track)

            } catch (error) {
              results.failed.push({
                track: trackName,
                artist: artistName,
                reason: error instanceof Error ? error.message : 'Unknown error',
              })
            }
          }

          return new Response(
            JSON.stringify({
              totalProcessed: playlistTracks.length,
              successCount: results.success.length,
              failedCount: results.failed.length,
              skippedCount: results.skipped.length,
              tracks: results.success,
              failed: results.failed,
              skipped: results.skipped,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        } catch (error) {
          console.error('Error analyzing playlist:', error)
          return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          )
        }
      },
    },
  },
})
