import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { Music, Sparkles, Plus, Trash2, MessageCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { GalaxyVisualization } from '../components/GalaxyVisualization'
import { NucleusChat } from '../components/NucleusChat'
import { EmotionChat } from '../components/EmotionChat'
import type { Track } from '../types/track'
import '../styles/galaxy.css'

interface FocusedEmotionInfo {
  emotion: {
    name: string
    color: string
  }
  tracks: Track[]
}

export const Route = createFileRoute('/')({ component: App })

function App() {
  const [tracks, setTracks] = useState<Track[]>([])
  const [spotifyUrl, setSpotifyUrl] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nucleusName, setNucleusName] = useState('The Nucleus')
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null)

  // Galaxy focus state
  const [focusedEmotion, setFocusedEmotion] = useState<FocusedEmotionInfo | null>(null)
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null)

  // Emotion chat state
  const [isEmotionChatOpen, setIsEmotionChatOpen] = useState(false)

  // Track card expansion state
  const [expandedTracks, setExpandedTracks] = useState<Set<number>>(new Set())

  const toggleTrackExpanded = (trackId: number) => {
    setExpandedTracks(prev => {
      const next = new Set(prev)
      if (next.has(trackId)) {
        next.delete(trackId)
      } else {
        next.add(trackId)
      }
      return next
    })
  }

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

  const handleEmotionFocus = (
    info: FocusedEmotionInfo | null,
    screenPosition: { x: number; y: number } | null
  ) => {
    setFocusedEmotion(info)
    setTooltipPosition(screenPosition)
    if (!info) {
      setIsEmotionChatOpen(false)
    }
  }

  const groupedByEmotion = tracks.reduce((acc, track) => {
    if (!acc[track.emotion]) acc[track.emotion] = []
    acc[track.emotion].push(track)
    return acc
  }, {} as Record<string, Track[]>)

  return (
    <div className="galaxy-container">
      {/* Galaxy takes full screen minus sidebar width */}
      <div className="fixed inset-0 right-80">
        <GalaxyVisualization
          tracks={tracks}
          onEmotionFocus={handleEmotionFocus}
          onTrackClick={setSelectedTrack}
        />
      </div>

      {/* Header */}
      <header className="fixed top-0 left-0 right-80 z-50 bg-black/80 backdrop-blur-sm border-b border-white/10 p-4">
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
            className="flex items-center gap-2 px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/50 rounded-lg transition-colors text-white"
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
            className="px-6 py-2 bg-cyan-500 hover:bg-cyan-600 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-2 font-semibold text-white"
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

      {/* Sidebar */}
      <div className="fixed right-0 top-0 w-80 h-screen bg-black/90 backdrop-blur-sm border-l border-white/10 overflow-y-auto z-40 pt-36">
        <div className="p-4">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-white">
            <Sparkles className="w-5 h-5 text-cyan-400" />
            Track Collection
          </h2>

          {Object.entries(groupedByEmotion).map(([emotion, emotionTracks]) => (
            <div key={emotion} className="mb-4">
              <h3 className="text-sm font-semibold text-gray-400 mb-2 capitalize">
                {emotion} ({emotionTracks.length})
              </h3>
              <div className="space-y-2">
                {emotionTracks.map(track => {
                  const isExpanded = expandedTracks.has(track.id)
                  return (
                    <div
                      key={track.id}
                      className="bg-white/5 border border-white/10 rounded-lg p-3 hover:bg-white/10 transition-colors group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm text-white truncate">{track.title}</p>
                          <p className="text-xs text-gray-400 truncate">{track.artist}</p>
                          {track.genre && (
                            <p className="text-xs text-cyan-400 mt-1">{track.genre}</p>
                          )}
                        </div>
                        <button
                          onClick={() => deleteTrack(track.id)}
                          className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-400 transition-all flex-shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      {track.mood_description && (
                        <div className="mt-2">
                          <p className={`text-xs text-gray-300 ${isExpanded ? '' : 'line-clamp-2'}`}>
                            {track.mood_description}
                          </p>
                          {track.mood_description.length > 100 && (
                            <button
                              onClick={() => toggleTrackExpanded(track.id)}
                              className="text-xs text-cyan-400 hover:text-cyan-300 mt-1 flex items-center gap-1"
                            >
                              {isExpanded ? (
                                <>
                                  <ChevronUp className="w-3 h-3" />
                                  Show less
                                </>
                              ) : (
                                <>
                                  <ChevronDown className="w-3 h-3" />
                                  Show more
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      )}
                      {track.vocal_characteristics && (
                        <p className={`text-xs text-gray-400 mt-1 ${isExpanded ? '' : 'hidden'}`}>
                          <span className="text-gray-500">Style:</span> {track.vocal_characteristics}
                        </p>
                      )}
                      {track.lyrics && (
                        <a
                          href={track.genius_url || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-purple-400 hover:underline mt-2 inline-block"
                        >
                          View lyrics
                        </a>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          {tracks.length === 0 && (
            <div className="text-center text-gray-500 py-12">
              <Music className="w-12 h-12 mx-auto mb-4 text-gray-600" />
              <p className="text-white">No tracks yet</p>
              <p className="text-sm mt-2">Add a Spotify track to begin</p>
            </div>
          )}
        </div>
      </div>

      {/* Connection line and tooltip */}
      {focusedEmotion && tooltipPosition && (
        <>
          <svg
            className="connection-line"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
              zIndex: 999,
            }}
          >
            <defs>
              <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" style={{ stopColor: focusedEmotion.emotion.color, stopOpacity: 0.8 }} />
                <stop offset="100%" style={{ stopColor: focusedEmotion.emotion.color, stopOpacity: 0.2 }} />
              </linearGradient>
            </defs>
            <line
              x1={tooltipPosition.x - 200}
              y1={tooltipPosition.y + 50}
              x2={tooltipPosition.x}
              y2={tooltipPosition.y}
              stroke="url(#lineGradient)"
              strokeWidth="2"
              strokeDasharray="4 4"
            />
          </svg>

          <div
            className="star-tooltip"
            style={{
              left: tooltipPosition.x,
              top: tooltipPosition.y,
            }}
            onClick={e => {
              e.stopPropagation()
              e.nativeEvent.stopImmediatePropagation()
            }}
          >
            <div className="tooltip-header">
              <div
                className="tooltip-icon"
                style={{ background: focusedEmotion.emotion.color }}
              />
              <h3 className="tooltip-title">{focusedEmotion.emotion.name}</h3>
            </div>
            <div className="tooltip-divider" />
            <div className="tooltip-content">
              <p className="tooltip-label">Orbiting Tracks</p>
              {focusedEmotion.tracks.length > 0 ? (
                <ul className="tooltip-songs">
                  {focusedEmotion.tracks.map(track => (
                    <li
                      key={track.id}
                      className="tooltip-song"
                      style={{ cursor: 'pointer' }}
                    >
                      <span
                        className="song-bullet"
                        style={{ color: focusedEmotion.emotion.color }}
                      >
                        *
                      </span>
                      <div className="song-info">
                        <div className="song-title">{track.title}</div>
                        {track.artist && <div className="song-artist">{track.artist}</div>}
                        {track.genre && (
                          <div className="song-meta">
                            {track.genre} {track.tempo ? ` - ${track.tempo} BPM` : ''}
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="tooltip-empty">No tracks yet. Add one!</p>
              )}

              {/* Talk to Emotion button */}
              <button
                onClick={() => setIsEmotionChatOpen(true)}
                className="w-full mt-4 px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                style={{
                  background: `${focusedEmotion.emotion.color}20`,
                  border: `1px solid ${focusedEmotion.emotion.color}50`,
                  color: focusedEmotion.emotion.color,
                }}
              >
                <MessageCircle className="w-4 h-4" />
                Talk to {focusedEmotion.emotion.name}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Nucleus Chat */}
      <NucleusChat
        nucleusName={nucleusName}
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
      />

      {/* Emotion Chat */}
      {focusedEmotion && (
        <EmotionChat
          emotion={focusedEmotion.emotion.name.toLowerCase()}
          emotionColor={focusedEmotion.emotion.color}
          isOpen={isEmotionChatOpen}
          onClose={() => setIsEmotionChatOpen(false)}
        />
      )}
    </div>
  )
}
