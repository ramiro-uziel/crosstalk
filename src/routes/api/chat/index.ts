import { createFileRoute } from '@tanstack/react-router'
import { chatQueries, nucleusQueries } from '../../../lib/database'
import type { ChatMessage, NucleusMetadata } from '../../../types/chat'

export const Route = createFileRoute('/api/chat/')({
  server: {
    handlers: {
      GET: async () => {
        try {
          const messages = chatQueries.getAll.all() as ChatMessage[]
          const nucleus = nucleusQueries.get.get() as NucleusMetadata

          return new Response(
            JSON.stringify({ messages, nucleus }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        } catch (error) {
          console.error('Error fetching chat messages:', error)
          return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          )
        }
      },
      DELETE: async () => {
        try {
          chatQueries.deleteAll.run()
          return new Response(
            JSON.stringify({ success: true }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        } catch (error) {
          console.error('Error clearing chat messages:', error)
          return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          )
        }
      },
    },
  },
})
