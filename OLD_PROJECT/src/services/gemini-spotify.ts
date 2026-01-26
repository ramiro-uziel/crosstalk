/**
 * Gemini Spotify Audio Analysis Service
 * Analyzes Spotify tracks and extracts emotional/musical metadata
 * Using the new @google/genai package with structured output
 */
import { GoogleGenAI, Type } from '@google/genai';

export interface SpotifyAnalysis {
  // Basic info
  title: string;
  artist?: string;
  duration?: number;
  thumbnail?: string;

  // Emotional analysis
  emotion: string; // joy, sadness, anger, fear, love, surprise, calm, nostalgia
  emotionConfidence: number; // 0-1

  // Musical features
  valence: number; // 0-1 (negative to positive)
  energy: number; // 0-1 (calm to energetic)
  tempo?: number; // BPM
  genre?: string;
  moodDescription: string;

  // Detailed analysis
  dominantInstruments?: string;
  vocalCharacteristics?: string;
}

export interface SpotifyMetadata {
  id: string;
  url: string;
  title?: string;
  artist?: string;
  thumbnail?: string;
  duration?: number;
}

interface SpotifyAPIResponse {
  name: string;
  artists: Array<{
    name: string;
  }>;
  album: {
    images: Array<{
      url: string;
      height: number;
      width: number;
    }>;
  };
  duration_ms: number;
  preview_url: string | null;
}

/**
 * Extract Spotify track ID from URL or URI
 */
export function extractSpotifyId(url: string | undefined | null): string | null {
  if (!url) return null;

  const patterns = [
    /spotify:track:([a-zA-Z0-9]{22})/,
    /open\.spotify\.com\/track\/([a-zA-Z0-9]{22})/,
    /^([a-zA-Z0-9]{22})$/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }

  return null;
}

/**
 * Validate Spotify URL or URI
 */
export function isValidSpotifyUrl(url: string): boolean {
  return extractSpotifyId(url) !== null;
}

/**
 * Get Spotify access token using Client Credentials flow
 */
async function getSpotifyAccessToken(
  clientId: string,
  clientSecret: string
): Promise<string> {
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + btoa(`${clientId}:${clientSecret}`)
    },
    body: 'grant_type=client_credentials'
  });

  if (!response.ok) {
    throw new Error('Failed to get Spotify access token');
  }

  const data = await response.json();
  return data.access_token;
}

/**
 * Fetch Spotify track metadata using Spotify Web API
 */
export async function fetchSpotifyMetadata(
  trackId: string,
  clientId: string,
  clientSecret: string
): Promise<SpotifyMetadata> {
  try {
    // Get access token
    const accessToken = await getSpotifyAccessToken(clientId, clientSecret);

    // Fetch track data
    const url = `https://api.spotify.com/v1/tracks/${trackId}`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Track not found');
      }
      throw new Error(`Spotify API error: ${response.status}`);
    }

    const data: SpotifyAPIResponse = await response.json();

    // Get the best quality image
    const thumbnail = data.album.images.length > 0
      ? data.album.images[0].url
      : undefined;

    // Convert duration from milliseconds to seconds
    const durationSeconds = Math.floor(data.duration_ms / 1000);

    return {
      id: trackId,
      url: `https://open.spotify.com/track/${trackId}`,
      title: data.name,
      artist: data.artists.map(a => a.name).join(', '),
      thumbnail,
      duration: durationSeconds,
    };
  } catch (error) {
    console.error('Failed to fetch Spotify metadata:', error);
    throw error;
  }
}

/**
 * Analyze Spotify track with Gemini using structured output
 * Now with Spotify Web API for accurate metadata
 */
export async function analyzeSpotifyTrack(
  url: string,
  geminiApiKey: string,
  spotifyClientId?: string,
  spotifyClientSecret?: string
): Promise<SpotifyAnalysis> {
  const trackId = extractSpotifyId(url);
  if (!trackId) {
    throw new Error('Invalid Spotify URL or URI');
  }

  // Step 1: Fetch accurate metadata from Spotify Web API
  let metadata: SpotifyMetadata | null = null;
  if (spotifyClientId && spotifyClientSecret) {
    try {
      metadata = await fetchSpotifyMetadata(trackId, spotifyClientId, spotifyClientSecret);
      console.log('Spotify metadata fetched:', metadata);
    } catch (error) {
      console.warn('Failed to fetch Spotify metadata, continuing with Gemini-only analysis:', error);
    }
  }

  // Step 2: Use Gemini for emotional/musical analysis
  const ai = new GoogleGenAI({ apiKey: geminiApiKey });

  // Define the emotion enum
  const EmotionEnum = {
    joy: 'joy',
    sadness: 'sadness',
    anger: 'anger',
    fear: 'fear',
    love: 'love',
    surprise: 'surprise',
    calm: 'calm',
    nostalgia: 'nostalgia'
  };

  const spotifyEmbedUrl = `https://open.spotify.com/embed/track/${trackId}`;

  const prompt = `
Analyze this Spotify track's music and audio content.

${metadata ? `The track title is: "${metadata.title}" by ${metadata.artist}` : ''}

Requirements:
1. Determine the PRIMARY emotion of the music (choose the single most dominant one)
2. Analyze musical characteristics: tempo (BPM), energy level, emotional valence
3. Identify the music genre (be specific, e.g., "Electronic Dance Music", "Indie Rock", "Classical Piano")
4. Describe the overall mood and feeling
5. Note the dominant instruments present
6. Describe vocal characteristics (or mark as instrumental if no vocals)

Focus on the MUSIC and emotional content, not spoken dialogue or other sounds.
Be precise with the emotion - choose the ONE most prominent emotion from the list.
Valence: 0.0 = very sad/negative, 1.0 = very happy/positive
Energy: 0.0 = very calm/low energy, 1.0 = very energetic/intense
`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          {
            fileData: {
              fileUri: spotifyEmbedUrl,
            },
          },
          {
            text: prompt,
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            emotion: {
              type: Type.STRING,
              description: "The single most dominant emotion in the music",
              enum: Object.values(EmotionEnum),
            },
            emotionConfidence: {
              type: Type.NUMBER,
              description: "Confidence in the emotion classification (0.0-1.0)",
            },
            valence: {
              type: Type.NUMBER,
              description: "Emotional valence: 0.0=very negative, 1.0=very positive",
            },
            energy: {
              type: Type.NUMBER,
              description: "Energy level: 0.0=very calm, 1.0=very energetic",
            },
            tempo: {
              type: Type.INTEGER,
              description: "Estimated tempo in BPM",
              nullable: true,
            },
            genre: {
              type: Type.STRING,
              description: "Primary music genre (be specific)",
            },
            moodDescription: {
              type: Type.STRING,
              description: "Brief description of the overall mood and feeling",
            },
            dominantInstruments: {
              type: Type.STRING,
              description: "Comma-separated list of main instruments heard",
              nullable: true,
            },
            vocalCharacteristics: {
              type: Type.STRING,
              description: "Description of vocals, or 'instrumental' if none",
            },
          },
          required: [
            "emotion",
            "emotionConfidence",
            "valence",
            "energy",
            "genre",
            "moodDescription",
            "vocalCharacteristics",
          ],
        },
      },
    });

    const analysisText = response.text || '';
    console.log('Gemini response:', analysisText);

    if (!analysisText) {
      throw new Error('Empty response from Gemini');
    }

    // Parse the structured JSON response
    const analysis = JSON.parse(analysisText);

    // Combine Spotify metadata with Gemini analysis
    return {
      title: metadata?.title || 'Unknown Title',
      artist: metadata?.artist || undefined,
      duration: metadata?.duration || undefined,
      thumbnail: metadata?.thumbnail || undefined,
      emotion: analysis.emotion,
      emotionConfidence: analysis.emotionConfidence,
      valence: analysis.valence,
      energy: analysis.energy,
      tempo: analysis.tempo || undefined,
      genre: analysis.genre || undefined,
      moodDescription: analysis.moodDescription,
      dominantInstruments: analysis.dominantInstruments || undefined,
      vocalCharacteristics: analysis.vocalCharacteristics || undefined,
    };
  } catch (error) {
    console.error('Gemini analysis error:', error);

    // Handle specific error types
    if (error instanceof Error) {
      const errorMsg = error.message;

      // Rate limit error
      if (errorMsg.includes('429') || errorMsg.includes('quota')) {
        throw new Error('⏱️ Rate limit reached. Please wait a minute and try again, or upgrade to a paid Gemini API plan for higher limits.');
      }

      // Invalid API key
      if (errorMsg.includes('401') || errorMsg.includes('API key')) {
        throw new Error('🔑 Invalid API key. Please check your VITE_GEMINI_API_KEY in the .env file.');
      }

      // Network error
      if (errorMsg.includes('fetch') || errorMsg.includes('network')) {
        throw new Error('🌐 Network error. Please check your internet connection and try again.');
      }

      // JSON parsing error
      if (errorMsg.includes('JSON') || errorMsg.includes('parse')) {
        throw new Error('⚠️ Could not parse Gemini response. The track might be unavailable or the model returned invalid data.');
      }

      // Track access error
      if (errorMsg.includes('403') || errorMsg.includes('access')) {
        throw new Error('🚫 Cannot access track. It may be private or unavailable in your region.');
      }

      throw new Error(`Failed to analyze: ${errorMsg.split('\n')[0]}`);
    }

    throw new Error('Failed to analyze track: Unknown error');
  }
}

/**
 * Get Spotify track metadata
 * If Spotify credentials are provided, fetches from Spotify Web API
 * Otherwise returns basic metadata from URL
 */
export async function getSpotifyMetadata(
  url: string,
  clientId?: string,
  clientSecret?: string
): Promise<SpotifyMetadata | null> {
  const trackId = extractSpotifyId(url);
  if (!trackId) return null;

  // If Spotify credentials provided, fetch full metadata
  if (clientId && clientSecret) {
    try {
      return await fetchSpotifyMetadata(trackId, clientId, clientSecret);
    } catch (error) {
      console.warn('Failed to fetch Spotify metadata, returning basic info:', error);
    }
  }

  // Fallback to basic metadata
  return {
    id: trackId,
    url: `https://open.spotify.com/track/${trackId}`,
  };
}

/**
 * Map emotion to color (matching galaxy emotions)
 */
export function getEmotionColor(emotion: string): string {
  const emotionColors: Record<string, string> = {
    joy: '#FFD700',      // Gold
    sadness: '#4169E1',  // Royal Blue
    anger: '#DC143C',    // Crimson
    fear: '#800080',     // Purple
    love: '#FF69B4',     // Hot Pink
    surprise: '#FF8C00', // Dark Orange
    calm: '#00CED1',     // Dark Turquoise
    nostalgia: '#DDA0DD' // Plum
  };

  return emotionColors[emotion.toLowerCase()] || '#FFFFFF';
}

/**
 * Batch analyze multiple Spotify URLs
 */
export async function analyzeSpotifyPlaylist(
  urls: string[],
  geminiApiKey: string,
  spotifyClientId?: string,
  spotifyClientSecret?: string,
  onProgress?: (current: number, total: number) => void
): Promise<SpotifyAnalysis[]> {
  const results: SpotifyAnalysis[] = [];

  for (let i = 0; i < urls.length; i++) {
    try {
      const analysis = await analyzeSpotifyTrack(urls[i], geminiApiKey, spotifyClientId, spotifyClientSecret);
      results.push(analysis);

      if (onProgress) {
        onProgress(i + 1, urls.length);
      }

      // Rate limiting: wait 2 seconds between requests
      if (i < urls.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (error) {
      console.error(`Failed to analyze ${urls[i]}:`, error);
      // Continue with other URLs
    }
  }

  return results;
}
