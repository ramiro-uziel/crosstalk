interface GeniusSearchResponse {
  response: {
    hits: Array<{
      result: {
        id: number
        title: string
        url: string
        primary_artist: {
          name: string
        }
      }
    }>
  }
}

export async function searchGeniusLyrics(
  title: string,
  artist: string,
  accessToken: string
): Promise<{ lyrics: string | null; url: string | null }> {
  try {
    const searchQuery = encodeURIComponent(`${title} ${artist}`)
    const searchUrl = `https://api.genius.com/search?q=${searchQuery}`

    const response = await fetch(searchUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!response.ok) {
      console.error('Genius API search failed:', response.statusText)
      return { lyrics: null, url: null }
    }

    const data = await response.json() as GeniusSearchResponse

    if (!data.response.hits || data.response.hits.length === 0) {
      return { lyrics: null, url: null }
    }

    const song = data.response.hits[0].result
    const lyrics = await scrapeLyrics(song.url)

    return { lyrics, url: song.url }
  } catch (error) {
    console.error('Error searching Genius lyrics:', error)
    return { lyrics: null, url: null }
  }
}

async function scrapeLyrics(songUrl: string): Promise<string | null> {
  try {
    const response = await fetch(songUrl)
    const html = await response.text()

    const lyricsRegex = /<div[^>]*data-lyrics-container="true"[^>]*>([\s\S]*?)<\/div>/g
    const matches = [...html.matchAll(lyricsRegex)]

    if (matches.length === 0) {
      return null
    }

    let lyrics = matches
      .map(match => match[1])
      .join('\n\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#x27;/g, "'")
      .trim()

    return lyrics || null
  } catch (error) {
    console.error('Error scraping lyrics:', error)
    return null
  }
}
