import { createFileRoute } from '@tanstack/react-router'
import { trackQueries } from '../../../lib/database'
import type { Track } from '../../../types/track'

export const Route = createFileRoute('/api/tracks/')({
  server: {
    handlers: {
      GET: async () => {
        try {
          const tracks = trackQueries.getAll.all() as Track[]

          return new Response(
            JSON.stringify({ tracks }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        } catch (error) {
          console.error('Error fetching tracks:', error)
          return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          )
        }
      },

      DELETE: async ({ request }) => {
        try {
          const { id } = await request.json()

          trackQueries.delete.run(id)

          return new Response(
            JSON.stringify({ success: true }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        } catch (error) {
          console.error('Error deleting track:', error)
          return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          )
        }
      },
    },
  },
})
