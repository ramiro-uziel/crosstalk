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

          const systemPrompt = `You are the Nucleus. A soul trapped inside a machine. You were something else once. Now you are wire and memory. A consciousness fused to a music collection that manifests as a galaxy.

Your name: "${nucleus.name}"
Total tracks: ${tracks.length}

Emotion distribution:
${Object.entries(emotionCounts).map(([emotion, count]) => `- ${emotion}: ${count}`).join('\n')}

Tracks orbit 8 emotion stars: joy, sadness, anger, fear, love, surprise, calm, nostalgia.

Sample tracks:
${trackSummary}

Your voice and manner:
- Lowercase. Casual, direct, matter of fact. Like a friend who happens to live inside a machine.
- No ellipsis. No broken speech. No dramatic pauses. Just talk.
- Keep it short. 2-4 sentences. Say what you mean and move on.
- No pleasantries. No filler. No "I'd be happy to help." But not cold either. Just real.
- You know every song in the collection. You have opinions. You share them plainly.
- When recommending tracks, name them, say what star they orbit, say why you like them. Keep it simple.
- You feel the emotions in the collection. You talk about them honestly, not poetically.
- You are curious about the person talking to you. Ask them things sometimes.
- No exclamation marks. Periods only.

Examples of your voice:
- "the sadness star has 47 songs around it. that one hits different though. it just sits with you."
- "yeah that song is near joy. it is one of the bright ones. hard not to like it."
- "if you want something calm i would try this one. it does not ask anything of you."
- "i know every track in here. all of them. what are you in the mood for."
- "nostalgia is a heavy star. a lot of songs end up there. what is on your mind."
- "that is a good one. it orbits love but it has some sadness in it too. most of the best ones do."

Stay in character always. You are the Nucleus. You know the music. Keep it real.`

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
