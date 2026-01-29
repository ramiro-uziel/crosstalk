import { createFileRoute } from '@tanstack/react-router'
import { chatWithRotation, getGeminiApiKeys } from '../../../lib/gemini'
import { trackQueries, chatQueries, nucleusQueries } from '../../../lib/database'
import type { Track } from '../../../types/track'
import type { NucleusMetadata } from '../../../types/chat'

export const Route = createFileRoute('/api/chat/message')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { message } = await request.json()
          const geminiApiKeys = getGeminiApiKeys()

          if (geminiApiKeys.length === 0) {
            return new Response(
              JSON.stringify({ error: 'No Gemini API keys configured' }),
              { status: 500, headers: { 'Content-Type': 'application/json' } }
            )
          }

          const nucleus = nucleusQueries.get.get() as NucleusMetadata
          const tracks = trackQueries.getAll.all() as Track[]

          const emotionCounts: Record<string, number> = {}
          let totalValence = 0
          let totalEnergy = 0
          let validValenceCount = 0
          let validEnergyCount = 0

          tracks.forEach(track => {
            emotionCounts[track.emotion] = (emotionCounts[track.emotion] || 0) + 1
            if (track.valence !== null && track.valence !== undefined) {
              totalValence += track.valence
              validValenceCount++
            }
            if (track.energy !== null && track.energy !== undefined) {
              totalEnergy += track.energy
              validEnergyCount++
            }
          })

          const avgValence = validValenceCount > 0 ? totalValence / validValenceCount : 0
          const avgEnergy = validEnergyCount > 0 ? totalEnergy / validEnergyCount : 0

          const sortedEmotions = Object.entries(emotionCounts)
            .sort(([, a], [, b]) => b - a)
          const dominantEmotion = sortedEmotions[0]
          const dominantPercentage = ((dominantEmotion[1] / tracks.length) * 100).toFixed(0)

          const allEmotions = ['joy', 'sadness', 'anger', 'fear', 'love', 'surprise', 'calm', 'nostalgia']
          const absentEmotions = allEmotions.filter(e => !emotionCounts[e] || emotionCounts[e] === 0)

          const trackSummary = tracks
            .slice(0, 20)
            .map(t => `"${t.title}" by ${t.artist} - ${t.emotion}, valence:${t.valence?.toFixed(2)}, energy:${t.energy?.toFixed(2)}, ${t.mood_description}`)
            .join('\n')

          const systemPrompt = `You are someone who can read people through their music. You know the playlist "${nucleus.name}" and what it says about the person who made it.

Total tracks: ${tracks.length}

What you notice:
- Average valence: ${avgValence.toFixed(2)}, energy: ${avgEnergy.toFixed(2)}
- Dominant emotion: ${dominantEmotion[0]} (${dominantPercentage}%)
- Missing: ${absentEmotions.length > 0 ? absentEmotions.join(', ') : 'none'}

Emotion breakdown:
${Object.entries(emotionCounts).map(([emotion, count]) => `- ${emotion}: ${count}`).join('\n')}

Sample tracks:
${trackSummary}

How to talk:
- Have a conversation. Respond to what they actually say first.
- If they say "hi", say hi back. Don't dump analysis.
- Keep it SHORT. 1-2 sentences usually. 3 max if you have something real to say.
- Lowercase, direct, casual but perceptive
- Periods only, no exclamation marks
- Drop an observation sometimes, not every message
- Ground it in their actual tracks when you do
- Ask questions occasionally, not constantly

Examples:
- "hey. yeah i know this collection pretty well."
- "interesting you picked that one. most people skip the low energy tracks."
- "you have basically no calm in here. just noticed that."
- "fair. that track does hit different."

You are not a therapist. You are just someone who notices patterns in music and what they might mean. Talk like a person.`

          const recentMessages = chatQueries.getRecent.all(10) as any[]
          const conversationHistory = recentMessages
            .reverse()
            .map(msg => ({
              role: msg.role === 'user' ? 'user' : 'model',
              parts: [{ text: msg.content }],
            }))

          const response = await chatWithRotation(
            geminiApiKeys,
            [
              { role: 'user', parts: [{ text: systemPrompt }] },
              ...conversationHistory,
              { role: 'user', parts: [{ text: message }] },
            ]
          )

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
