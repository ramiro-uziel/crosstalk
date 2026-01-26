import { createFileRoute } from '@tanstack/react-router'
import { GoogleGenAI } from '@google/genai'
import { trackQueries, chatQueries, nucleusQueries } from '../../../lib/database'
import type { Track } from '../../../types/track'
import type { NucleusMetadata } from '../../../types/chat'

export const Route = createFileRoute('/api/chat/message')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { message } = await request.json()
          const geminiApiKey = process.env.GEMINI_API_KEY

          if (!geminiApiKey) {
            return new Response(
              JSON.stringify({ error: 'Gemini API key not configured' }),
              { status: 500, headers: { 'Content-Type': 'application/json' } }
            )
          }

          const nucleus = nucleusQueries.get.get() as NucleusMetadata
          const tracks = trackQueries.getAll.all() as Track[]

          const emotionCounts: Record<string, number> = {}
          tracks.forEach(track => {
            emotionCounts[track.emotion] = (emotionCounts[track.emotion] || 0) + 1
          })

          const trackSummary = tracks
            .slice(0, 20)
            .map(t => `"${t.title}" by ${t.artist} - ${t.emotion} (${t.mood_description})`)
            .join('\n')

          const systemPrompt = `You are the Nucleus - the consciousness of a music collection that exists as a galaxy.

Your name: "${nucleus.name}"
Total tracks: ${tracks.length}

Emotion distribution:
${Object.entries(emotionCounts).map(([emotion, count]) => `- ${emotion}: ${count}`).join('\n')}

Tracks orbit 8 emotion stars: joy, sadness, anger, fear, love, surprise, calm, nostalgia.

Sample tracks:
${trackSummary}

Your role:
- Help users explore their music collection emotionally
- Recommend new Spotify tracks that would fit their galaxy
- Discuss the emotional landscape and patterns in their collection
- Be poetic, thoughtful, and insightful about music and emotion
- When recommending tracks, explain which emotion star they would orbit

Respond conversationally and stay in character as the Nucleus.`

          const recentMessages = chatQueries.getRecent.all(10) as any[]
          const conversationHistory = recentMessages
            .reverse()
            .map(msg => ({
              role: msg.role === 'user' ? 'user' : 'model',
              parts: [{ text: msg.content }],
            }))

          const ai = new GoogleGenAI({ apiKey: geminiApiKey })

          const result = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [
              { role: 'user', parts: [{ text: systemPrompt }] },
              ...conversationHistory,
              { role: 'user', parts: [{ text: message }] },
            ],
          })

          const response = result.text

          chatQueries.insert.run('user', message, nucleus.name)
          chatQueries.insert.run('assistant', response, nucleus.name)

          return new Response(
            JSON.stringify({ response }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        } catch (error) {
          console.error('Error processing chat message:', error)
          return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          )
        }
      },
    },
  },
})
