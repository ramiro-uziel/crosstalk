import { GoogleGenAI } from '@google/genai'
import type { AnalysisResult, Emotion } from '../types/track'

// Get all available Gemini API keys from environment
export function getGeminiApiKeys(): string[] {
  return [
    process.env.VITE_GEMINI_API_KEY_1,
    process.env.VITE_GEMINI_API_KEY_2,
    process.env.VITE_GEMINI_API_KEY_3,
    process.env.VITE_GEMINI_API_KEY_4,
    process.env.VITE_GEMINI_API_KEY_5,
    process.env.VITE_GEMINI_API_KEY_6,
  ].filter((key): key is string => !!key)
}

// Generic wrapper for API key rotation
export async function withApiKeyRotation<T>(
  apiKeys: string[],
  operation: (apiKey: string) => Promise<T>
): Promise<T> {
  let lastError: Error | null = null

  for (let i = 0; i < apiKeys.length; i++) {
    try {
      const result = await operation(apiKeys[i])
      if (i > 0) {
        console.log(`  ℹ️  Used API key ${i + 1} after ${i} failed attempt(s)`)
      }
      return result
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error')
      console.log(`  ⚠️  API key ${i + 1} failed: ${lastError.message}`)

      if (i < apiKeys.length - 1) {
        console.log(`  🔄 Trying next API key...`)
      }
    }
  }

  throw new Error(`All ${apiKeys.length} Gemini API keys failed. Last error: ${lastError?.message}`)
}

const LYRICS_ANALYSIS_PROMPT = `Analyze these song lyrics and provide an emotional and stylistic analysis.

Song: "{title}" by {artist}

Lyrics:
{lyrics}

Return your response in the following JSON format:
{
  "emotion": "<one of: joy, sadness, anger, fear, love, surprise, calm, nostalgia>",
  "valence": <0.0 to 1.0>,
  "energy": <0.0 to 1.0>,
  "genre": "<inferred genre from lyrical style>",
  "mood_description": "<2-3 sentence description of the emotional content and themes>",
  "vocal_characteristics": "<description of the lyrical style, writing approach, and poetic devices>"
}

Guidelines:
- emotion: Choose the PRIMARY emotion from the 8 options that best represents the lyrics
- valence: 0.0 = negative/sad themes, 1.0 = positive/uplifting themes
- energy: 0.0 = calm/introspective, 1.0 = intense/passionate
- genre: Infer from lyrical style (e.g., "indie folk", "hip-hop", "alternative rock", "pop ballad")
- mood_description: Capture the emotional essence and themes explored in the lyrics
- vocal_characteristics: Describe the writing style, metaphors used, narrative approach

Return ONLY the JSON, no markdown formatting or additional text.`

const ANALYSIS_PROMPT = `Analyze this music track and provide a detailed emotional and musical analysis.

Return your response in the following JSON format:
{
  "emotion": "<one of: joy, sadness, anger, fear, love, surprise, calm, nostalgia>",
  "valence": <0.0 to 1.0>,
  "energy": <0.0 to 1.0>,
  "tempo": <estimated BPM as integer>,
  "genre": "<primary genre>",
  "mood_description": "<2-3 sentence description of the mood and feeling>",
  "dominant_instruments": "<comma-separated list of main instruments>",
  "vocal_characteristics": "<description of vocals, or 'instrumental' if no vocals>"
}

Guidelines:
- emotion: Choose the PRIMARY emotion from the 8 options that best represents the track
- valence: 0.0 = negative/sad, 1.0 = positive/happy
- energy: 0.0 = calm/peaceful, 1.0 = energetic/intense
- tempo: Estimated beats per minute
- genre: Be specific (e.g., "indie rock", "dark ambient", "neo-soul")
- mood_description: Capture the emotional essence and atmosphere
- dominant_instruments: List 3-5 main instruments you hear
- vocal_characteristics: Describe the singing style, tone, or mark as instrumental

Return ONLY the JSON, no markdown formatting or additional text.`

export async function analyzeAudioFile(
  audioBuffer: Buffer,
  apiKey: string
): Promise<AnalysisResult> {
  const ai = new GoogleGenAI({ apiKey })

  const uploadResult = await ai.files.upload({
    file: audioBuffer,
    config: { mimeType: 'audio/mpeg' },
  })

  const result = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      {
        role: 'user',
        parts: [
          { fileData: { fileUri: uploadResult.file.uri, mimeType: 'audio/mpeg' } },
          { text: ANALYSIS_PROMPT },
        ],
      },
    ],
  })

  const responseText = result.text
  const jsonMatch = responseText.match(/\{[\s\S]*\}/)

  if (!jsonMatch) {
    throw new Error('Failed to parse Gemini response as JSON')
  }

  const analysis = JSON.parse(jsonMatch[0]) as AnalysisResult
  return analysis
}

export async function analyzeSpotifyEmbed(
  spotifyUrl: string,
  apiKey: string
): Promise<AnalysisResult> {
  const ai = new GoogleGenAI({ apiKey })

  const embedPrompt = `I'm sharing a Spotify track URL: ${spotifyUrl}

${ANALYSIS_PROMPT}`

  const result = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: embedPrompt,
  })

  const responseText = result.text
  const jsonMatch = responseText.match(/\{[\s\S]*\}/)

  if (!jsonMatch) {
    throw new Error('Failed to parse Gemini response as JSON')
  }

  const analysis = JSON.parse(jsonMatch[0]) as AnalysisResult
  return analysis
}

export async function generateNucleusName(
  trackCount: number,
  topEmotions: string[],
  genres: string[],
  moodDescriptions: string[],
  apiKey: string
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey })

  const prompt = `Generate a short poetic name (2-4 words) for this music collection:
- ${trackCount} tracks
- Dominant emotions: ${topEmotions.join(', ')}
- Genres: ${genres.join(', ')}
- Sample moods: ${moodDescriptions.slice(0, 3).join(', ')}

Return ONLY the name, nothing else. Make it evocative and beautiful.`

  const result = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
  })

  return result.text.trim().replace(/["']/g, '')
}

export async function analyzeLyrics(
  lyrics: string,
  title: string,
  artist: string,
  apiKey: string
): Promise<AnalysisResult> {
  const ai = new GoogleGenAI({ apiKey })

  const prompt = LYRICS_ANALYSIS_PROMPT
    .replace('{title}', title)
    .replace('{artist}', artist)
    .replace('{lyrics}', lyrics)

  const result = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
  })

  const responseText = result.text
  const jsonMatch = responseText.match(/\{[\s\S]*\}/)

  if (!jsonMatch) {
    throw new Error('Failed to parse Gemini response as JSON')
  }

  const analysis = JSON.parse(jsonMatch[0]) as AnalysisResult
  return analysis
}

// Analyze lyrics with automatic API key rotation
export async function analyzeLyricsWithRotation(
  lyrics: string,
  title: string,
  artist: string,
  apiKeys: string[]
): Promise<AnalysisResult> {
  return withApiKeyRotation(apiKeys, (apiKey) =>
    analyzeLyrics(lyrics, title, artist, apiKey)
  )
}

// Generate nucleus name with API key rotation
export async function generateNucleusNameWithRotation(
  trackCount: number,
  topEmotions: string[],
  genres: string[],
  moodDescriptions: string[],
  apiKeys: string[]
): Promise<string> {
  return withApiKeyRotation(apiKeys, (apiKey) =>
    generateNucleusName(trackCount, topEmotions, genres, moodDescriptions, apiKey)
  )
}

// Chat with Gemini using API key rotation
export async function chatWithRotation(
  apiKeys: string[],
  contents: Array<{ role: string; parts: Array<{ text: string }> }>,
  systemInstruction?: string
): Promise<string> {
  return withApiKeyRotation(apiKeys, async (apiKey) => {
    const ai = new GoogleGenAI({ apiKey })
    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents,
      ...(systemInstruction && { systemInstruction }),
    })
    if (!result.text) {
      throw new Error('Empty response from Gemini')
    }
    return result.text
  })
}
