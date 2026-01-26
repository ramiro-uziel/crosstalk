import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { Music, Sparkles, Plus, Trash2, MessageCircle } from 'lucide-react'
import { GalaxyVisualization } from '../components/GalaxyVisualization'
import { NucleusChat } from '../components/NucleusChat'
import type { Track } from '../types/track'

export const Route = createFileRoute('/')({ component: App })

function App() {
  const [tracks, setTracks] = useState<Track[]>([])
  const [spotifyUrl, setSpotifyUrl] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nucleusName, setNucleusName] = useState('The Nucleus')
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null)

  useEffect(() => {
    loadTracks()
    loadNucleus()
  }, [])

  const loadTracks = async () => {
    try {
      const response = await fetch('/api/tracks')
      const data = await response.json()
      setTracks(data.tracks || [])
    } catch (error) {
      console.error('Failed to load tracks:', error)
    }
  }

  const loadNucleus = async () => {
    try {
      const response = await fetch('/api/chat')
      const data = await response.json()
      if (data.nucleus?.name) {
        setNucleusName(data.nucleus.name)
      }
    } catch (error) {
      console.error('Failed to load nucleus:', error)
    }
  }

  const addTrack = async () => {
    if (!spotifyUrl.trim()) return

    setIsAnalyzing(true)
    setError(null)

    try {
      const response = await fetch('/api/tracks/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spotifyUrl: spotifyUrl.trim() }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to analyze track')
      }

      setTracks(prev => [data.track, ...prev])
      setSpotifyUrl('')

      if (tracks.length > 0 && (tracks.length + 1) % 5 === 0) {
        await renameNucleus()
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unknown error')
    } finally {
      setIsAnalyzing(false)
    }
  }

  const deleteTrack = async (id: number) => {
    try {
      await fetch('/api/tracks', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })

      setTracks(prev => prev.filter(t => t.id !== id))
    } catch (error) {
      console.error('Failed to delete track:', error)
    }
  }

  const renameNucleus = async () => {
    try {
      const response = await fetch('/api/nucleus/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      const data = await response.json()
      if (data.name) {
        setNucleusName(data.name)
      }
    } catch (error) {
      console.error('Failed to rename nucleus:', error)
    }
  }

  const groupedByEmotion = tracks.reduce((acc, track) => {
    if (!acc[track.emotion]) acc[track.emotion] = []
    acc[track.emotion].push(track)
    return acc
  }, {} as Record<string, Track[]>)

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="flex h-screen">
        <div className="flex-1 flex flex-col">
          <header className="bg-gradient-to-r from-slate-900 to-slate-800 border-b border-white/10 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Music className="w-8 h-8 text-cyan-400" />
                <div>
                  <h1 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
                    {nucleusName}
                  </h1>
                  <p className="text-sm text-gray-400">{tracks.length} tracks orbiting</p>
                </div>
              </div>
              <button
                onClick={() => setIsChatOpen(!isChatOpen)}
                className="flex items-center gap-2 px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/50 rounded-lg transition-colors"
              >
                <MessageCircle className="w-5 h-5" />
                Chat
              </button>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={spotifyUrl}
                onChange={e => setSpotifyUrl(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && addTrack()}
                placeholder="Paste Spotify track URL..."
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50"
                disabled={isAnalyzing}
              />
              <button
                onClick={addTrack}
                disabled={!spotifyUrl.trim() || isAnalyzing}
                className="px-6 py-2 bg-cyan-500 hover:bg-cyan-600 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-2 font-semibold"
              >
                <Plus className="w-5 h-5" />
                {isAnalyzing ? 'Analyzing...' : 'Add Track'}
              </button>
            </div>

            {error && (
              <div className="mt-2 text-red-400 text-sm">
                {error}
              </div>
            )}
          </header>

          <div className="flex-1 relative">
            <GalaxyVisualization
              tracks={tracks}
              onTrackClick={setSelectedTrack}
            />
          </div>
        </div>

        <div className="w-80 bg-slate-900 border-l border-white/10 overflow-y-auto">
          <div className="p-4">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-cyan-400" />
              Track Collection
            </h2>

            {Object.entries(groupedByEmotion).map(([emotion, emotionTracks]) => (
              <div key={emotion} className="mb-4">
                <h3 className="text-sm font-semibold text-gray-400 mb-2 capitalize">
                  {emotion} ({emotionTracks.length})
                </h3>
                <div className="space-y-2">
                  {emotionTracks.map(track => (
                    <div
                      key={track.id}
                      className="bg-white/5 border border-white/10 rounded-lg p-3 hover:bg-white/10 transition-colors group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{track.title}</p>
                          <p className="text-xs text-gray-400 truncate">{track.artist}</p>
                          {track.genre && (
                            <p className="text-xs text-cyan-400 mt-1">{track.genre}</p>
                          )}
                        </div>
                        <button
                          onClick={() => deleteTrack(track.id)}
                          className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-400 transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      {track.mood_description && (
                        <p className="text-xs text-gray-500 mt-2 line-clamp-2">
                          {track.mood_description}
                        </p>
                      )}
                      {track.lyrics && (
                        <a
                          href={track.genius_url || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-purple-400 hover:underline mt-1 inline-block"
                        >
                          View lyrics
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {tracks.length === 0 && (
              <div className="text-center text-gray-500 py-12">
                <Music className="w-12 h-12 mx-auto mb-4 text-gray-600" />
                <p>No tracks yet</p>
                <p className="text-sm mt-2">Add a Spotify track to begin</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <NucleusChat
        nucleusName={nucleusName}
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
      />
    </div>
  )
}
