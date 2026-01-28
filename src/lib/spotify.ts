import type { SpotifyMetadata } from '../types/track'

let accessToken: string | null = null
let tokenExpiry: number = 0

async function getAccessToken(clientId: string, clientSecret: string): Promise<string> {
  if (accessToken && Date.now() < tokenExpiry) {
    return accessToken
  }

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
    },
    body: 'grant_type=client_credentials',
  })

  if (!response.ok) {
    throw new Error(`Failed to get Spotify access token: ${response.statusText}`)
  }

  const data = await response.json()
  accessToken = data.access_token
  tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000

  return accessToken
}

// Fetch user's top tracks (this is what Spotify uses for "On Repeat")
export async function fetchUserTopTracks(
  userAccessToken: string,
  limit = 15
): Promise<SpotifyMetadata[]> {
  const response = await fetch(
    `https://api.spotify.com/v1/me/top/tracks?limit=${limit}&time_range=short_term`,
    {
      headers: {
        'Authorization': `Bearer ${userAccessToken}`,
      },
    }
  )

  if (!response.ok) {
    throw new Error(`Failed to fetch top tracks: ${response.statusText}`)
  }

  const data = await response.json()
  return data.items as SpotifyMetadata[]
}

// Get user's profile
export async function fetchUserProfile(userAccessToken: string) {
  const response = await fetch('https://api.spotify.com/v1/me', {
    headers: {
      'Authorization': `Bearer ${userAccessToken}`,
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch user profile: ${response.statusText}`)
  }

  return await response.json()
}

export function extractSpotifyTrackId(url: string): string | null {
  const regex = /track\/([a-zA-Z0-9]+)/
  const match = url.match(regex)
  return match ? match[1] : null
}

export async function fetchSpotifyMetadata(
  trackId: string,
  clientId: string,
  clientSecret: string
): Promise<SpotifyMetadata> {
  const token = await getAccessToken(clientId, clientSecret)

  const response = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch Spotify metadata: ${response.statusText}`)
  }

  const data = await response.json()
  return data as SpotifyMetadata
}

export async function downloadPreviewMp3(previewUrl: string): Promise<Buffer> {
  const response = await fetch(previewUrl)

  if (!response.ok) {
    throw new Error(`Failed to download preview MP3: ${response.statusText}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}
