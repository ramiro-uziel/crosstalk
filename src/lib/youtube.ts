import { createServerFn } from '@tanstack/react-start'

export const searchYouTube = createServerFn({ method: 'POST' })
  .inputValidator((d: string) => d)
  .handler(async ({ data: query }) => {
    const apiKey = process.env.VITE_YOUTUBE_API_KEY
    if (!apiKey) {
      throw new Error('YouTube API key not configured')
    }

    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&videoCategoryId=10&maxResults=1&key=${apiKey}`

    const response = await fetch(searchUrl)
    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.error?.message || 'YouTube search failed')
    }

    return { videoId: (result.items?.[0]?.id?.videoId as string) || null }
  })
