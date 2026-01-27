import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useMemo } from 'react'
import { Music, Sparkles, Plus, Trash2, MessageCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { NucleusVisualization } from '../components/NucleusVisualization'
import { NucleusChat } from '../components/NucleusChat'
import type { Track } from '../types/track'
import '../styles/galaxy.css'

interface OrbitInfo {
  orbitIndex: number
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
  const [selectedOrbit, setSelectedOrbit] = useState<number | null>(null)

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

  const handleOrbitClick = (orbitInfo: OrbitInfo | null) => {
    if (orbitInfo) {
      setSelectedOrbit(orbitInfo.orbitIndex)
    } else {
      setSelectedOrbit(null)
    }
  }

  const handleTrackClick = (track: Track) => {
    setSelectedTrack(track)
  }

  // Sort tracks by added_at (newest first)
  const sortedTracks = useMemo(() => {
    return [...tracks].sort((a, b) =>
      new Date(b.added_at).getTime() - new Date(a.added_at).getTime()
    )
  }, [tracks])

  // Distribute tracks across orbits (newest = inner, oldest = outer)
  const tracksByOrbit = useMemo(() => {
    const orbits: Track[][] = Array(6).fill(null).map(() => [])
    const tracksPerOrbit = Math.ceil(sortedTracks.length / 6)

    sortedTracks.forEach((track, index) => {
      const orbitIndex = Math.min(Math.floor(index / Math.max(tracksPerOrbit, 1)), 5)
      orbits[orbitIndex].push(track)
    })

    return orbits
  }, [sortedTracks])

  // Filter tracks by selected orbit
  const filteredTracks = selectedOrbit !== null
    ? tracksByOrbit[selectedOrbit - 1] || []
    : sortedTracks

  return (
    <div className="nucleus-container">
      {/* Visualization takes full screen minus sidebar width */}
      <div className="fixed inset-0 right-80">
        <NucleusVisualization
          tracks={tracks}
          onOrbitClick={handleOrbitClick}
          onTrackClick={handleTrackClick}
        />
      </div>

      {/* Header */}
      <header className="fixed top-0 left-0 right-80 z-50 bg-black/90 backdrop-blur-sm border-b border-white/20 p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Music className="w-8 h-8 text-white" />
            <div>
              <h1 className="text-2xl font-bold text-white">
                {nucleusName}
              </h1>
            </div>
          </div>
          <button
            onClick={() => setIsChatOpen(!isChatOpen)}
            className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/30 transition-colors text-white font-mono"
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
            className="flex-1 bg-black border border-white/30 px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-white font-mono"
            disabled={isAnalyzing}
          />
          <button
            onClick={addTrack}
            disabled={!spotifyUrl.trim() || isAnalyzing}
            className="px-6 py-2 bg-white text-black hover:bg-gray-200 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors flex items-center gap-2 font-semibold font-mono"
          >
            <Plus className="w-5 h-5" />
            {isAnalyzing ? 'Analyzing...' : 'Add Track'}
          </button>
        </div>

        {error && (
          <div className="mt-2 text-white text-sm font-mono border border-white/50 bg-white/10 p-2">
            {error}
          </div>
        )}
      </header>

      {/* Sidebar */}
      <div className="fixed right-0 top-0 w-80 h-screen bg-black border-l border-white/20 overflow-y-auto z-40 pt-8">
        <div className="pb-4 px-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2 text-white font-mono">
              <Sparkles className="w-5 h-5" />
              {selectedOrbit !== null ? `Orbit ${selectedOrbit}` : 'All Tracks'}
            </h2>
            {selectedOrbit !== null && (
              <button
                onClick={() => setSelectedOrbit(null)}
                className="text-xs text-white/60 hover:text-white font-mono border border-white/30 px-2 py-1"
              >
                Clear Filter
              </button>
            )}
          </div>

          {/* Orbit navigation */}
          <div className="flex gap-1 mb-4 flex-wrap">
            {[1, 2, 3, 4, 5, 6].map(orbit => (
              <button
                key={orbit}
                onClick={() => setSelectedOrbit(selectedOrbit === orbit ? null : orbit)}
                className={`px-3 py-1 text-xs font-mono border transition-colors ${
                  selectedOrbit === orbit
                    ? 'bg-white text-black border-white'
                    : 'bg-black text-white border-white/30 hover:border-white'
                }`}
              >
                {orbit}
              </button>
            ))}
          </div>

          <div className="text-xs text-white/50 font-mono mb-4">
            Orbit 1: Newest | Orbit 6: Oldest
          </div>

          {/* Track list by orbit */}
          {selectedOrbit === null ? (
            // Show all tracks grouped by orbit
            tracksByOrbit.map((orbitTracks, orbitIndex) => (
              orbitTracks.length > 0 && (
                <div key={orbitIndex} className="mb-4">
                  <h3 className="text-sm font-semibold text-white/60 mb-2 font-mono border-b border-white/20 pb-1">
                    Orbit {orbitIndex + 1} ({orbitTracks.length})
                  </h3>
                  <div className="space-y-2">
                    {orbitTracks.map(track => (
                      <TrackCard
                        key={track.id}
                        track={track}
                        isExpanded={expandedTracks.has(track.id)}
                        onToggleExpand={() => toggleTrackExpanded(track.id)}
                        onDelete={() => deleteTrack(track.id)}
                        isSelected={selectedTrack?.id === track.id}
                      />
                    ))}
                  </div>
                </div>
              )
            ))
          ) : (
            // Show filtered tracks
            <div className="space-y-2">
              {filteredTracks.map(track => (
                <TrackCard
                  key={track.id}
                  track={track}
                  isExpanded={expandedTracks.has(track.id)}
                  onToggleExpand={() => toggleTrackExpanded(track.id)}
                  onDelete={() => deleteTrack(track.id)}
                  isSelected={selectedTrack?.id === track.id}
                />
              ))}
            </div>
          )}

          {tracks.length === 0 && (
            <div className="text-center text-white/50 py-12 font-mono">
              <Music className="w-12 h-12 mx-auto mb-4 text-white/30" />
              <p className="text-white">No tracks yet</p>
              <p className="text-sm mt-2">Add a Spotify track to begin</p>
            </div>
          )}
        </div>
      </div>

      {/* Track tooltip */}
      {selectedTrack && (
        <div className="track-tooltip">
          <div className="tooltip-header">
            <div className="tooltip-icon" />
            <h3 className="tooltip-title">{selectedTrack.title}</h3>
          </div>
          <div className="tooltip-divider" />
          <div className="tooltip-content">
            {selectedTrack.artist && (
              <p className="tooltip-artist">{selectedTrack.artist}</p>
            )}
            {selectedTrack.genre && (
              <p className="tooltip-genre">{selectedTrack.genre}</p>
            )}
            {selectedTrack.mood_description && (
              <p className="tooltip-mood">{selectedTrack.mood_description}</p>
            )}
            <button
              onClick={() => setSelectedTrack(null)}
              className="tooltip-close"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Nucleus Chat */}
      <NucleusChat
        nucleusName={nucleusName}
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
      />
    </div>
  )
}

interface TrackCardProps {
  track: Track
  isExpanded: boolean
  onToggleExpand: () => void
  onDelete: () => void
  isSelected: boolean
}

function TrackCard({ track, isExpanded, onToggleExpand, onDelete, isSelected }: TrackCardProps) {
  return (
    <div
      className={`bg-black border border-white/20 p-3 transition-colors group font-mono ${
        isSelected ? 'border-white' : 'hover:border-white/50'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm text-white truncate">{track.title}</p>
          <p className="text-xs text-white/60 truncate">{track.artist}</p>
          {track.genre && (
            <p className="text-xs text-white/40 mt-1">{track.genre}</p>
          )}
        </div>
        <button
          onClick={onDelete}
          className="opacity-0 group-hover:opacity-100 text-white/40 hover:text-white transition-all flex-shrink-0"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      {track.mood_description && (
        <div className="mt-2">
          <p className={`text-xs text-white/60 ${isExpanded ? '' : 'line-clamp-2'}`}>
            {track.mood_description}
          </p>
          {track.mood_description.length > 100 && (
            <button
              onClick={onToggleExpand}
              className="text-xs text-white/40 hover:text-white mt-1 flex items-center gap-1"
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
        <p className={`text-xs text-white/40 mt-1 ${isExpanded ? '' : 'hidden'}`}>
          <span className="text-white/30">Style:</span> {track.vocal_characteristics}
        </p>
      )}
      {track.lyrics && (
        <a
          href={track.genius_url || '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-white/50 hover:text-white hover:underline mt-2 inline-block"
        >
          View lyrics
        </a>
      )}
    </div>
  )
}
