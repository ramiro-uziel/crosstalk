import { createFileRoute } from '@tanstack/react-router'
import { generateNucleusName } from '../../../lib/gemini'
import { trackQueries, nucleusQueries } from '../../../lib/database'
import type { Track } from '../../../types/track'

export const Route = createFileRoute('/api/nucleus/rename')({
  server: {
    handlers: {
      POST: async () => {
        try {
          const geminiApiKey = process.env.GEMINI_API_KEY

          if (!geminiApiKey) {
            return new Response(
              JSON.stringify({ error: 'Gemini API key not configured' }),
              { status: 500, headers: { 'Content-Type': 'application/json' } }
            )
          }

          const tracks = trackQueries.getAll.all() as Track[]

          if (tracks.length === 0) {
            return new Response(
              JSON.stringify({ error: 'No tracks to analyze' }),
              { status: 400, headers: { 'Content-Type': 'application/json' } }
            )
          }

          const emotionCounts: Record<string, number> = {}
          const genres = new Set<string>()
          const moodDescriptions: string[] = []

          tracks.forEach(track => {
            emotionCounts[track.emotion] = (emotionCounts[track.emotion] || 0) + 1
            if (track.genre) genres.add(track.genre)
            if (track.mood_description) moodDescriptions.push(track.mood_description)
          })

          const topEmotions = Object.entries(emotionCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([emotion]) => emotion)

          const name = await generateNucleusName(
            tracks.length,
            topEmotions,
            Array.from(genres).slice(0, 5),
            moodDescriptions.slice(0, 5),
            geminiApiKey
          )

          nucleusQueries.updateName.run(name)

          const dominantEmotion = topEmotions[0]
          nucleusQueries.updateDominantEmotion.run(dominantEmotion)

          return new Response(
            JSON.stringify({ name, dominantEmotion }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        } catch (error) {
          console.error('Error renaming nucleus:', error)
          return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          )
        }
      },
    },
  },
})
