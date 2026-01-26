import { createFileRoute } from '@tanstack/react-router'
import { searchGeniusLyrics } from '../../../lib/genius'

export const Route = createFileRoute('/api/lyrics/search')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { title, artist } = await request.json()
          const geniusToken = process.env.GENIUS_ACCESS_TOKEN

          if (!geniusToken) {
            return new Response(
              JSON.stringify({ error: 'Genius API token not configured' }),
              { status: 500, headers: { 'Content-Type': 'application/json' } }
            )
          }

          const result = await searchGeniusLyrics(title, artist, geniusToken)

          return new Response(
            JSON.stringify(result),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        } catch (error) {
          console.error('Error searching lyrics:', error)
          return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          )
        }
      },
    },
  },
})
