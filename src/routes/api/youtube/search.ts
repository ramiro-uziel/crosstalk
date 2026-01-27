import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/youtube/search')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url)
          const query = url.searchParams.get('q')

          if (!query) {
            return new Response(
              JSON.stringify({ error: 'Missing query parameter' }),
              { status: 400, headers: { 'Content-Type': 'application/json' } }
            )
          }

          const apiKey = process.env.VITE_YOUTUBE_API_KEY
          if (!apiKey) {
            return new Response(
              JSON.stringify({ error: 'YouTube API key not configured' }),
              { status: 500, headers: { 'Content-Type': 'application/json' } }
            )
          }

          const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&videoCategoryId=10&maxResults=1&key=${apiKey}`

          const response = await fetch(searchUrl)
          const data = await response.json()

          if (!response.ok) {
            return new Response(
              JSON.stringify({ error: data.error?.message || 'YouTube search failed' }),
              { status: response.status, headers: { 'Content-Type': 'application/json' } }
            )
          }

          const videoId = data.items?.[0]?.id?.videoId || null

          return new Response(
            JSON.stringify({ videoId }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        } catch (error) {
          console.error('YouTube search error:', error)
          return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          )
        }
      },
    },
  },
})
