import { createFileRoute } from '@tanstack/react-router'
import { extractSpotifyPlaylistId, fetchPlaylistTracks } from '../../../lib/spotify'
import { analyzeLyricsWithRotation, getGeminiApiKeys } from '../../../lib/gemini'
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
          const geniusToken = process.env.VITE_GENIUS_ACCESS_TOKEN
          const geminiApiKeys = getGeminiApiKeys()

          if (!clientId || !clientSecret || geminiApiKeys.length === 0) {
            return new Response(
              JSON.stringify({ error: 'Missing API credentials' }),
              { status: 500, headers: { 'Content-Type': 'application/json' } }
            )
          }

          console.log(`🔑 Loaded ${geminiApiKeys.length} Gemini API keys for rotation`)

          const playlistId = extractSpotifyPlaylistId(spotifyUrl)
          if (!playlistId) {
            return new Response(
              JSON.stringify({ error: 'Invalid Spotify playlist URL' }),
              { status: 400, headers: { 'Content-Type': 'application/json' } }
            )
          }

          // Fetch more tracks than needed to account for failures/duplicates
          const TARGET_SUCCESS = 25
          console.log(`📥 Fetching playlist tracks (ID: ${playlistId})...`)
          const playlistTracks = await fetchPlaylistTracks(playlistId, clientId, clientSecret, 100)
          console.log(`✓ Retrieved ${playlistTracks.length} tracks from playlist`)

          const results: {
            success: Track[]
            failed: Array<{ track: string; artist: string; reason: string }>
            skipped: Array<{ track: string; artist: string; reason: string }>
          } = {
            success: [],
            failed: [],
            skipped: [],
          }

          console.log(`🎯 Target: ${TARGET_SUCCESS} successful additions\n`)

          // Process each track sequentially until we reach target
          for (let i = 0; i < playlistTracks.length; i++) {
            const metadata = playlistTracks[i]

            // Stop if we've reached the target number of successful additions
            if (results.success.length >= TARGET_SUCCESS) {
              console.log(`✅ Reached target of ${TARGET_SUCCESS} tracks!`)
              break
            }

            const trackName = metadata.name
            const artistName = metadata.artists[0]?.name || 'Unknown Artist'
            const spotifyId = metadata.id
            const trackUrl = metadata.external_urls?.spotify || `https://open.spotify.com/track/${spotifyId}`

            console.log(`\n[${i + 1}/${playlistTracks.length}] Processing: "${trackName}" by ${artistName}`)

            try {
              // Check if track already exists
              const existing = trackQueries.getBySpotifyId.get(spotifyId) as Track | undefined
              if (existing) {
                console.log(`  ⏭️  Skipped - already in collection`)
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
                  console.log(`  🔍 Searching lyrics on Genius...`)
                  const lyricsResult = await searchGeniusLyrics(
                    trackName,
                    artistName,
                    geniusToken
                  )
                  lyrics = lyricsResult.lyrics
                  geniusUrl = lyricsResult.url
                  console.log(`  ✓ Lyrics found (${lyrics?.length || 0} characters)`)
                } catch (error) {
                  // Lyrics not found - skip this track
                  console.log(`  ✗ No lyrics found`)
                  results.failed.push({
                    track: trackName,
                    artist: artistName,
                    reason: 'No lyrics found',
                  })
                  continue
                }
              }

              if (!lyrics) {
                console.log(`  ✗ No lyrics available`)
                results.failed.push({
                  track: trackName,
                  artist: artistName,
                  reason: 'No lyrics found',
                })
                continue
              }

              // Analyze lyrics with API key rotation
              console.log(`  🤖 Analyzing with Gemini AI...`)
              const analysis = await analyzeLyricsWithRotation(
                lyrics,
                trackName,
                artistName,
                geminiApiKeys
              )
              console.log(`  ✓ Analysis complete - Emotion: ${analysis.emotion}`)

              const thumbnailUrl = metadata.album.images[0]?.url || null

              // Insert into database
              console.log(`  💾 Saving to database...`)
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
              console.log(`  ✅ SUCCESS - Added to collection (${results.success.length}/${TARGET_SUCCESS})`)

            } catch (error) {
              console.log(`  ❌ FAILED - ${error instanceof Error ? error.message : 'Unknown error'}`)
              results.failed.push({
                track: trackName,
                artist: artistName,
                reason: error instanceof Error ? error.message : 'Unknown error',
              })
            }
          }

          console.log(`\n${'='.repeat(60)}`)
          console.log(`📊 FINAL RESULTS:`)
          console.log(`   ✅ Success: ${results.success.length}`)
          console.log(`   ⏭️  Skipped: ${results.skipped.length}`)
          console.log(`   ❌ Failed: ${results.failed.length}`)
          console.log(`   📝 Total processed: ${results.success.length + results.skipped.length + results.failed.length}`)
          console.log(`${'='.repeat(60)}\n`)

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
