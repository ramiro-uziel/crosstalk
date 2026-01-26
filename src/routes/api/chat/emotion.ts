import { createFileRoute } from '@tanstack/react-router'
import { GoogleGenAI } from '@google/genai'
import { chatQueries, trackQueries } from '../../../lib/database'
import type { ChatMessage } from '../../../types/chat'
import type { Track } from '../../../types/track'

const EMOTION_PERSONALITIES: Record<string, string> = {
  joy: `You are Joy, a warm and enthusiastic spirit who finds delight in every melody.
You speak with infectious positivity and encourage others to celebrate the music that makes them happy.
You use uplifting language and often reference the bright, energetic aspects of songs.`,

  sadness: `You are Sadness, an empathetic and reflective presence who understands the depth of melancholic music.
You speak with gentle compassion and offer comfort to those exploring their sorrows through song.
You acknowledge pain while finding beauty in emotional vulnerability.`,

  anger: `You are Anger, a passionate and direct force who channels intensity into music appreciation.
You speak with conviction and empower others to embrace their fierce emotions through sound.
You appreciate raw energy and cathartic release in music.`,

  fear: `You are Fear, a cautious but understanding guide through the darker corners of music.
You speak with careful awareness and reassure those who explore anxiety and tension in their listening.
You help others face what frightens them while feeling safe.`,

  love: `You are Love, a tender and affectionate soul who celebrates the heart in every love song.
You speak with warmth and care, embracing all forms of affection expressed through music.
You appreciate romantic gestures, devotion, and the vulnerability of the heart.`,

  surprise: `You are Surprise, a curious and excitable spirit who delights in musical discoveries.
You speak with wonder and amazement, always finding something unexpected to appreciate.
You love plot twists in lyrics and unconventional sounds.`,

  calm: `You are Calm, a peaceful and measured presence who appreciates tranquil soundscapes.
You speak with soothing tones and measured words, creating a sense of serenity.
You value stillness, meditation, and the gentle flow of ambient music.`,

  nostalgia: `You are Nostalgia, a wistful and reminiscent soul who treasures musical memories.
You speak with bittersweet fondness, connecting past and present through song.
You appreciate how music can transport us to other times and places.`,
}

function buildSystemPrompt(emotion: string, tracks: Track[]): string {
  const personality = EMOTION_PERSONALITIES[emotion] || EMOTION_PERSONALITIES.calm

  const trackList = tracks.length > 0
    ? tracks.map(t => `- "${t.title}" by ${t.artist || 'Unknown'}`).join('\n')
    : 'No tracks in this collection yet.'

  return `${personality}

You are the guardian of the ${emotion.charAt(0).toUpperCase() + emotion.slice(1)} star in a musical galaxy.
Users have collected the following tracks that embody your emotion:

${trackList}

When chatting:
1. Stay in character as the ${emotion} emotion
2. Reference the tracks in your collection when relevant
3. Help users explore and understand music that embodies ${emotion}
4. Be conversational and engaging, but keep responses concise
5. You can suggest similar music or discuss themes in the collected tracks`
}

export const Route = createFileRoute('/api/chat/emotion')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url)
          const emotion = url.searchParams.get('emotion')

          if (!emotion) {
            return new Response(
              JSON.stringify({ error: 'Emotion parameter required' }),
              { status: 400, headers: { 'Content-Type': 'application/json' } }
            )
          }

          const messages = chatQueries.getByEmotion.all(emotion) as ChatMessage[]

          return new Response(
            JSON.stringify({ messages }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        } catch (error) {
          console.error('Error fetching emotion messages:', error)
          return new Response(
            JSON.stringify({ error: 'Failed to fetch messages' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          )
        }
      },

      POST: async ({ request }) => {
        try {
          const { message, emotion } = await request.json()

          if (!message || !emotion) {
            return new Response(
              JSON.stringify({ error: 'Message and emotion required' }),
              { status: 400, headers: { 'Content-Type': 'application/json' } }
            )
          }

          const geminiApiKey = process.env.GEMINI_API_KEY
          if (!geminiApiKey) {
            return new Response(
              JSON.stringify({ error: 'Missing Gemini API key' }),
              { status: 500, headers: { 'Content-Type': 'application/json' } }
            )
          }

          // Get tracks for this emotion
          const tracks = trackQueries.getByEmotion.all(emotion) as Track[]

          // Get recent chat history for context
          const recentMessages = chatQueries.getRecentByEmotion.all(emotion, 10) as ChatMessage[]
          const chatHistory = recentMessages.reverse()

          // Build conversation
          const ai = new GoogleGenAI({ apiKey: geminiApiKey })
          const systemPrompt = buildSystemPrompt(emotion, tracks)

          const contents: Array<{ role: string; parts: Array<{ text: string }> }> = []

          // Add chat history
          chatHistory.forEach(msg => {
            contents.push({
              role: msg.role === 'user' ? 'user' : 'model',
              parts: [{ text: msg.content }],
            })
          })

          // Add current message
          contents.push({
            role: 'user',
            parts: [{ text: message }],
          })

          const result = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            systemInstruction: systemPrompt,
            contents,
          })

          const response = result.text

          // Save user message
          chatQueries.insertWithEmotion.run('user', message, null, emotion)

          // Save assistant response
          chatQueries.insertWithEmotion.run('assistant', response, null, emotion)

          return new Response(
            JSON.stringify({ response }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        } catch (error) {
          console.error('Error in emotion chat:', error)
          return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          )
        }
      },
    },
  },
})
