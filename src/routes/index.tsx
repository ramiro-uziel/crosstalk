import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Music, Sparkles, Plus, Trash2, ChevronDown, ChevronUp, Pause, Play, Volume2, X, PanelRightOpen, PanelRightClose } from 'lucide-react'
import { NucleusVisualization } from '../components/NucleusVisualization'
import type { NucleusVisualizationHandle } from '../components/NucleusVisualization'
import { NucleusChat } from '../components/NucleusChat'
import type { Track } from '../types/track'
import { searchYouTube } from '../lib/youtube'
import '../styles/galaxy.css'

// YouTube IFrame API types
interface YTPlayer {
  playVideo: () => void
  pauseVideo: () => void
  destroy: () => void
  getPlayerState: () => number
  getCurrentTime: () => number
  getDuration: () => number
  seekTo: (seconds: number, allowSeekAhead: boolean) => void
}

declare global {
  interface Window {
    YT: {
      Player: new (elementId: string, config: {
        height: string
        width: string
        videoId: string
        playerVars?: Record<string, number | string>
        events?: Record<string, (event: { data: number; target: YTPlayer }) => void>
      }) => YTPlayer
      PlayerState: { PLAYING: number; PAUSED: number; ENDED: number; BUFFERING: number }
    }
    onYouTubeIframeAPIReady: () => void
  }
}

interface OrbitInfo {
  orbitIndex: number
  tracks: Track[]
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export const Route = createFileRoute('/')({ component: App })

function App() {
  const [tracks, setTracks] = useState<Track[]>([])
  const [spotifyUrl, setSpotifyUrl] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [playlistProgress, setPlaylistProgress] = useState<{
    current: number
    total: number
    isProcessing: boolean
  } | null>(null)
  const [nucleusName, setNucleusName] = useState('The Nucleus')
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null)
  const [selectedOrbit, setSelectedOrbit] = useState<number | null>(null)
  const [trackScreenPos, setTrackScreenPos] = useState<{ x: number; y: number } | null>(null)
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null)
  const [isTooltipReady, setIsTooltipReady] = useState(false)
  const [nucleusScreenPos, setNucleusScreenPos] = useState<{ x: number; y: number } | null>(null)
  const [nucleusChatPosition, setNucleusChatPosition] = useState<{ x: number; y: number } | null>(null)
  const [isNucleusChatReady, setIsNucleusChatReady] = useState(false)

  const visualizationRef = useRef<NucleusVisualizationHandle>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const nucleusChatRef = useRef<HTMLDivElement>(null)

  // YouTube audio playback state
  const [playingTrack, setPlayingTrack] = useState<Track | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoadingVideo, setIsLoadingVideo] = useState(false)
  const [showSwitchConfirm, setShowSwitchConfirm] = useState(false)
  const [seekProgress, setSeekProgress] = useState(0)
  const [seekDuration, setSeekDuration] = useState(0)
  const seekIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const ytPlayerRef = useRef<YTPlayer | null>(null)
  const ytApiReady = useRef(false)
  const ytApiCallbacks = useRef<(() => void)[]>([])

  // Load YouTube IFrame API
  useEffect(() => {
    if (document.getElementById('yt-iframe-api')) {
      if (window.YT && window.YT.Player) {
        ytApiReady.current = true
      }
      return
    }

    const tag = document.createElement('script')
    tag.id = 'yt-iframe-api'
    tag.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(tag)

    window.onYouTubeIframeAPIReady = () => {
      ytApiReady.current = true
      ytApiCallbacks.current.forEach(cb => cb())
      ytApiCallbacks.current = []
    }
  }, [])

  const searchYouTubeVideo = useCallback(async (track: Track): Promise<string | null> => {
    try {
      const query = `${track.title} ${track.artist || ''} official audio`
      const result = await searchYouTube({ data: query })
      return result.videoId || null
    } catch (err) {
      console.error('YouTube search failed:', err)
      return null
    }
  }, [])

  const createYTPlayer = useCallback((videoId: string, track: Track) => {
    // Destroy existing player
    if (ytPlayerRef.current) {
      ytPlayerRef.current.destroy()
      ytPlayerRef.current = null
    }

    // Ensure container exists
    let container = document.getElementById('yt-player-container')
    if (!container) {
      container = document.createElement('div')
      container.id = 'yt-player-container'
      container.style.position = 'fixed'
      container.style.top = '-9999px'
      container.style.left = '-9999px'
      container.style.width = '1px'
      container.style.height = '1px'
      container.style.overflow = 'hidden'
      document.body.appendChild(container)
    }

    // Clear and recreate the player div
    container.innerHTML = '<div id="yt-player"></div>'

    const player = new window.YT.Player('yt-player', {
      height: '1',
      width: '1',
      videoId,
      playerVars: {
        autoplay: 1,
        controls: 0,
        disablekb: 1,
        fs: 0,
        modestbranding: 1,
        rel: 0,
      },
      events: {
        onReady: (event) => {
          event.target.playVideo()
        },
        onStateChange: (event) => {
          if (event.data === window.YT.PlayerState.PLAYING) {
            setIsPlaying(true)
            setIsLoadingVideo(false)
            // Start polling progress
            if (seekIntervalRef.current) clearInterval(seekIntervalRef.current)
            seekIntervalRef.current = setInterval(() => {
              if (ytPlayerRef.current) {
                setSeekProgress(ytPlayerRef.current.getCurrentTime())
                setSeekDuration(ytPlayerRef.current.getDuration())
              }
            }, 500)
          } else if (event.data === window.YT.PlayerState.PAUSED) {
            setIsPlaying(false)
            if (seekIntervalRef.current) clearInterval(seekIntervalRef.current)
          } else if (event.data === window.YT.PlayerState.ENDED) {
            // Loop: replay
            event.target.playVideo()
          }
        },
      },
    })

    ytPlayerRef.current = player
    setPlayingTrack(track)
  }, [])

  const playTrack = useCallback(async (track: Track) => {
    setIsLoadingVideo(true)

    const videoId = await searchYouTubeVideo(track)
    if (!videoId) {
      setIsLoadingVideo(false)
      setError('Could not find this track on YouTube')
      return
    }

    const doCreate = () => createYTPlayer(videoId, track)

    if (ytApiReady.current) {
      doCreate()
    } else {
      ytApiCallbacks.current.push(doCreate)
    }
  }, [searchYouTubeVideo, createYTPlayer])

  const togglePlayback = useCallback(() => {
    if (!ytPlayerRef.current) return
    if (isPlaying) {
      ytPlayerRef.current.pauseVideo()
      setIsPlaying(false)
    } else {
      ytPlayerRef.current.playVideo()
      setIsPlaying(true)
    }
  }, [isPlaying])

  const stopPlayback = useCallback(() => {
    if (seekIntervalRef.current) clearInterval(seekIntervalRef.current)
    if (ytPlayerRef.current) {
      ytPlayerRef.current.destroy()
      ytPlayerRef.current = null
    }
    setPlayingTrack(null)
    setIsPlaying(false)
    setSeekProgress(0)
    setSeekDuration(0)
  }, [])

  const confirmTrackChange = useCallback(() => {
    if (selectedTrack) {
      playTrack(selectedTrack)
      setShowSwitchConfirm(false)
      // Keep modal open - don't close it
    }
  }, [selectedTrack, playTrack])

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value)
    setSeekProgress(time)
    if (ytPlayerRef.current) {
      ytPlayerRef.current.seekTo(time, true)
    }
  }, [])

  // Cleanup YouTube player on unmount
  useEffect(() => {
    return () => {
      if (seekIntervalRef.current) clearInterval(seekIntervalRef.current)
      if (ytPlayerRef.current) {
        ytPlayerRef.current.destroy()
      }
    }
  }, [])

  // Track the tooltip's center position
  useEffect(() => {
    if (!selectedTrack) {
      setIsTooltipReady(false)
      setTooltipPosition(null)
      return
    }

    // Wait for tooltip to be rendered and positioned
    const timeoutId = setTimeout(() => {
      if (tooltipRef.current) {
        const rect = tooltipRef.current.getBoundingClientRect()
        setTooltipPosition({
          x: rect.left,
          y: rect.top + rect.height / 2,
        })
        setIsTooltipReady(true)
      }
    }, 50)

    const updateTooltipPosition = () => {
      if (tooltipRef.current) {
        const rect = tooltipRef.current.getBoundingClientRect()
        setTooltipPosition({
          x: rect.left,
          y: rect.top + rect.height / 2,
        })
      }
    }

    // Update on resize
    window.addEventListener('resize', updateTooltipPosition)

    return () => {
      clearTimeout(timeoutId)
      window.removeEventListener('resize', updateTooltipPosition)
    }
  }, [selectedTrack])

  // Track the selected track's screen position
  useEffect(() => {
    if (!selectedTrack) {
      setTrackScreenPos(null)
      return
    }

    let animationFrameId: number

    const updatePosition = () => {
      if (visualizationRef.current && selectedTrack) {
        const pos = visualizationRef.current.getTrackScreenPosition(selectedTrack.id)
        setTrackScreenPos(pos)
      }
      animationFrameId = requestAnimationFrame(updatePosition)
    }

    updatePosition()

    return () => {
      cancelAnimationFrame(animationFrameId)
    }
  }, [selectedTrack])

  // Track nucleus screen position when chat is open
  useEffect(() => {
    if (!isChatOpen) {
      setNucleusScreenPos(null)
      return
    }

    let animationFrameId: number

    const updatePosition = () => {
      if (visualizationRef.current) {
        const pos = visualizationRef.current.getNucleusScreenPosition()
        setNucleusScreenPos(pos)
      }
      animationFrameId = requestAnimationFrame(updatePosition)
    }

    updatePosition()

    return () => {
      cancelAnimationFrame(animationFrameId)
    }
  }, [isChatOpen])

  // Track the nucleus chat popup position
  useEffect(() => {
    if (!isChatOpen) {
      setIsNucleusChatReady(false)
      setNucleusChatPosition(null)
      return
    }

    const timeoutId = setTimeout(() => {
      if (nucleusChatRef.current) {
        const rect = nucleusChatRef.current.getBoundingClientRect()
        setNucleusChatPosition({
          x: rect.left,
          y: rect.top + rect.height / 2,
        })
        setIsNucleusChatReady(true)
      }
    }, 50)

    const updateChatPosition = () => {
      if (nucleusChatRef.current) {
        const rect = nucleusChatRef.current.getBoundingClientRect()
        setNucleusChatPosition({
          x: rect.left,
          y: rect.top + rect.height / 2,
        })
      }
    }

    window.addEventListener('resize', updateChatPosition)

    return () => {
      clearTimeout(timeoutId)
      window.removeEventListener('resize', updateChatPosition)
    }
  }, [isChatOpen])

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

    const url = spotifyUrl.trim()
    const isPlaylist = url.includes('/playlist/')

    setIsAnalyzing(true)
    setError(null)
    setPlaylistProgress(null)

    try {
      if (isPlaylist) {
        // Handle playlist with incremental updates
        const initialTrackCount = tracks.length

        // Set up polling to refresh tracks while processing
        setPlaylistProgress({ current: 0, total: 25, isProcessing: true })

        const pollInterval = setInterval(async () => {
          try {
            const response = await fetch('/api/tracks')
            const data = await response.json()
            if (data.tracks) {
              setTracks(data.tracks)
              const newCount = data.tracks.length - initialTrackCount
              if (newCount > 0) {
                setPlaylistProgress(prev => prev ? { ...prev, current: newCount } : null)
              }
            }
          } catch (err) {
            console.error('Failed to poll tracks:', err)
          }
        }, 2000) // Poll every 2 seconds

        // Start playlist analysis
        const response = await fetch('/api/tracks/analyze-playlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ spotifyUrl: url }),
        })

        clearInterval(pollInterval)

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Failed to analyze playlist')
        }

        // Final refresh to ensure we have all tracks
        await loadTracks()

        // Show summary
        const summary: string[] = []
        if (data.successCount > 0) {
          summary.push(`✓ ${data.successCount} tracks added`)
        }
        if (data.skippedCount > 0) {
          summary.push(`○ ${data.skippedCount} already in collection`)
        }
        if (data.failedCount > 0) {
          summary.push(`✗ ${data.failedCount} failed (no lyrics or errors)`)
        }

        setError(summary.join(' • '))
        setSpotifyUrl('')

        // Rename nucleus if needed
        const totalAdded = data.successCount
        if (totalAdded >= 5) {
          await renameNucleus()
        }
      } else {
        // Handle single track (original behavior)
        const response = await fetch('/api/tracks/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ spotifyUrl: url }),
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
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unknown error')
    } finally {
      setIsAnalyzing(false)
      setPlaylistProgress(null)
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
      setSelectedTrack(null)
      setShowSwitchConfirm(false)
      setIsChatOpen(false)
    }
  }

  const handleTrackClick = (track: Track) => {
    // If clicking the same track that's already selected, close the modal
    if (selectedTrack?.id === track.id) {
      setSelectedTrack(null)
      setShowSwitchConfirm(false)
      visualizationRef.current?.resetCamera()
      return
    }

    // Select the track and show modal
    setSelectedTrack(track)
    setShowSwitchConfirm(false)

    // Handle audio playback
    if (!playingTrack) {
      // Nothing playing - start playing this track
      playTrack(track)
    } else if (playingTrack.id === track.id) {
      // Same track already playing - just show modal, don't toggle playback
      // User can use the player controls if they want to pause
    } else {
      // Different track playing - show switch confirmation in tooltip
      setShowSwitchConfirm(true)
    }
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
      {/* Sidebar toggle button */}
      <button
        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        className="fixed top-4 right-4 z-50 w-8 h-8 flex items-center justify-center bg-black/80 border border-white/30 text-white/60 hover:text-white hover:border-white/60 transition-all"
        style={{ right: sidebarCollapsed ? 16 : `calc(320px + 16px)` }}
        title={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
      >
        {sidebarCollapsed ? <PanelRightOpen className="w-4 h-4" /> : <PanelRightClose className="w-4 h-4" />}
      </button>

      {/* Visualization takes full screen minus sidebar width */}
      <div className={`fixed inset-0 transition-[right] duration-300 ${sidebarCollapsed ? 'right-0' : 'right-80'}`}>
        <NucleusVisualization
          ref={visualizationRef}
          tracks={tracks}
          onOrbitClick={handleOrbitClick}
          onTrackClick={handleTrackClick}
          onNucleusClick={() => {
            const nextOpen = !isChatOpen
            setIsChatOpen(nextOpen)
            if (nextOpen) {
              setSelectedTrack(null)
              setShowSwitchConfirm(false)
              visualizationRef.current?.zoomToNucleus()
            } else {
              visualizationRef.current?.resetCamera()
            }
          }}
          isAudioPlaying={isPlaying}
          audioEnergy={playingTrack?.energy ?? undefined}
          audioTempo={playingTrack?.tempo ?? undefined}
        />
      </div>

      {/* Sidebar */}
      <div className={`fixed top-0 w-80 h-screen bg-black border-l border-white/20 overflow-y-auto z-40 transition-[right] duration-300 ${sidebarCollapsed ? '-right-80' : 'right-0'}`}>
        <div className="pb-4 px-4 pt-4">
          {/* Add Track Input */}
          <div className="mb-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={spotifyUrl}
                onChange={e => setSpotifyUrl(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && addTrack()}
                placeholder="Paste Spotify track or playlist URL..."
                className="flex-1 bg-black border border-white/30 px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-white font-mono"
                disabled={isAnalyzing}
              />
              <button
                onClick={addTrack}
                disabled={!spotifyUrl.trim() || isAnalyzing}
                className="px-3 py-2 bg-white text-black hover:bg-gray-200 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors flex items-center gap-1 font-semibold font-mono text-sm"
              >
                <Plus className="w-4 h-4" />
                {isAnalyzing ? '...' : 'Add'}
              </button>
            </div>
            {playlistProgress && playlistProgress.isProcessing && (
              <div className="mt-2 border border-white/30 bg-black/50 p-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-white text-xs font-mono">Processing playlist...</span>
                  <span className="text-white text-xs font-mono">{playlistProgress.current}/{playlistProgress.total}</span>
                </div>
                <div className="w-full h-1 bg-white/20 overflow-hidden">
                  <div
                    className="h-full bg-white transition-all duration-300"
                    style={{ width: `${(playlistProgress.current / playlistProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}
            {error && (
              <div className="mt-2 text-white text-xs font-mono border border-white/50 bg-white/10 p-2">
                {error}
              </div>
            )}
          </div>

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

      {/* SVG overlay for pointer line */}
      {selectedTrack && trackScreenPos && tooltipPosition && isTooltipReady && (
        <svg
          className="fixed inset-0 pointer-events-none z-[999]"
          style={{
            width: '100vw',
            height: '100vh',
            opacity: 1,
            transition: 'opacity 0.2s ease-in'
          }}
        >
          <defs>
            <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(255, 255, 255, 0.2)" />
              <stop offset="50%" stopColor="rgba(255, 255, 255, 0.4)" />
              <stop offset="100%" stopColor="rgba(255, 255, 255, 0.7)" />
              <animate attributeName="x1" values="0%;20%;0%" dur="3s" repeatCount="indefinite" />
            </linearGradient>
          </defs>
          {/* Line from modal to sphere */}
          <line
            x1={tooltipPosition.x}
            y1={tooltipPosition.y}
            x2={trackScreenPos.x}
            y2={trackScreenPos.y}
            stroke="url(#lineGradient)"
            strokeWidth="1.5"
            strokeDasharray="5 3"
            opacity="0.7"
          >
            <animate
              attributeName="stroke-dashoffset"
              from="0"
              to="16"
              dur="1s"
              repeatCount="indefinite"
            />
          </line>
          {/* Glow line underneath */}
          <line
            x1={tooltipPosition.x}
            y1={tooltipPosition.y}
            x2={trackScreenPos.x}
            y2={trackScreenPos.y}
            stroke="rgba(255, 255, 255, 0.2)"
            strokeWidth="3"
            opacity="0.3"
            style={{ filter: 'blur(2px)' }}
          />
          {/* Dot at sphere position */}
          <circle
            cx={trackScreenPos.x}
            cy={trackScreenPos.y}
            r="4"
            fill="white"
            opacity="0.9"
            style={{
              filter: 'drop-shadow(0 0 6px rgba(255, 255, 255, 0.9))',
            }}
          >
            <animate
              attributeName="r"
              values="4;5;4"
              dur="2s"
              repeatCount="indefinite"
            />
          </circle>
          {/* Outer ring at sphere */}
          <circle
            cx={trackScreenPos.x}
            cy={trackScreenPos.y}
            r="8"
            fill="none"
            stroke="white"
            strokeWidth="1"
            opacity="0.3"
          >
            <animate
              attributeName="r"
              values="8;12;8"
              dur="2s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              values="0.3;0.1;0.3"
              dur="2s"
              repeatCount="indefinite"
            />
          </circle>
          {/* Dot at modal connection */}
          <circle
            cx={tooltipPosition.x}
            cy={tooltipPosition.y}
            r="3"
            fill="white"
            opacity="0.7"
          />
        </svg>
      )}

      {/* SVG overlay for nucleus chat pointer line */}
      {isChatOpen && nucleusScreenPos && nucleusChatPosition && isNucleusChatReady && (
        <svg
          className="fixed inset-0 pointer-events-none z-[999]"
          style={{
            width: '100vw',
            height: '100vh',
            opacity: 1,
            transition: 'opacity 0.2s ease-in'
          }}
        >
          <defs>
            <linearGradient id="nucleusLineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(255, 255, 255, 0.2)" />
              <stop offset="50%" stopColor="rgba(255, 255, 255, 0.4)" />
              <stop offset="100%" stopColor="rgba(255, 255, 255, 0.7)" />
              <animate attributeName="x1" values="0%;20%;0%" dur="3s" repeatCount="indefinite" />
            </linearGradient>
          </defs>
          {/* Line from chat popup to nucleus */}
          <line
            x1={nucleusChatPosition.x}
            y1={nucleusChatPosition.y}
            x2={nucleusScreenPos.x}
            y2={nucleusScreenPos.y}
            stroke="url(#nucleusLineGradient)"
            strokeWidth="1.5"
            strokeDasharray="5 3"
            opacity="0.7"
          >
            <animate
              attributeName="stroke-dashoffset"
              from="0"
              to="16"
              dur="1s"
              repeatCount="indefinite"
            />
          </line>
          {/* Glow line underneath */}
          <line
            x1={nucleusChatPosition.x}
            y1={nucleusChatPosition.y}
            x2={nucleusScreenPos.x}
            y2={nucleusScreenPos.y}
            stroke="rgba(255, 255, 255, 0.2)"
            strokeWidth="3"
            opacity="0.3"
            style={{ filter: 'blur(2px)' }}
          />
          {/* Pulsing dot at nucleus position */}
          <circle
            cx={nucleusScreenPos.x}
            cy={nucleusScreenPos.y}
            r="4"
            fill="white"
            opacity="0.9"
            style={{
              filter: 'drop-shadow(0 0 6px rgba(255, 255, 255, 0.9))',
            }}
          >
            <animate
              attributeName="r"
              values="4;5;4"
              dur="2s"
              repeatCount="indefinite"
            />
          </circle>
          {/* Outer ring at nucleus */}
          <circle
            cx={nucleusScreenPos.x}
            cy={nucleusScreenPos.y}
            r="8"
            fill="none"
            stroke="white"
            strokeWidth="1"
            opacity="0.3"
          >
            <animate
              attributeName="r"
              values="8;12;8"
              dur="2s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              values="0.3;0.1;0.3"
              dur="2s"
              repeatCount="indefinite"
            />
          </circle>
          {/* Dot at chat popup connection */}
          <circle
            cx={nucleusChatPosition.x}
            cy={nucleusChatPosition.y}
            r="3"
            fill="white"
            opacity="0.7"
          />
        </svg>
      )}

      {/* Track tooltip */}
      {selectedTrack && (
        <div ref={tooltipRef} className="track-tooltip" style={sidebarCollapsed ? { right: '40px' } : undefined}>
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

            {/* Switch track confirmation */}
            {showSwitchConfirm && playingTrack && (
              <div className="mt-4 pt-4 border-t border-white/20">
                <p className="text-white text-xs mb-2 font-mono">Currently playing:</p>
                <p className="text-white/60 text-xs mb-3 font-mono">{playingTrack.title} - {playingTrack.artist}</p>
                <button
                  onClick={confirmTrackChange}
                  className="w-full px-3 py-2 bg-white text-black text-sm hover:bg-gray-200 transition-colors font-mono"
                >
                  Switch to this
                </button>
              </div>
            )}

            <button
              onClick={() => {
                setSelectedTrack(null)
                setShowSwitchConfirm(false)
                visualizationRef.current?.resetCamera()
              }}
              className="tooltip-close"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Audio player bar */}
      {(playingTrack || isLoadingVideo) && (
        <div className={`fixed bottom-0 left-0 z-50 bg-black/95 backdrop-blur-sm border-t border-white/20 font-mono transition-[right] duration-300 ${sidebarCollapsed ? 'right-0' : 'right-80'}`}>
          {/* Seek bar */}
          {seekDuration > 0 && (
            <div className="px-4 pt-2 flex items-center gap-2">
              <span className="text-[10px] text-white/40 w-10 text-right tabular-nums">
                {formatTime(seekProgress)}
              </span>
              <input
                type="range"
                min={0}
                max={seekDuration}
                step={0.5}
                value={seekProgress}
                onChange={handleSeek}
                className="flex-1 h-1 appearance-none bg-white/20 cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-none [&::-moz-range-thumb]:w-2 [&::-moz-range-thumb]:h-2 [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:rounded-none"
                style={{
                  background: `linear-gradient(to right, rgba(255,255,255,0.7) ${(seekProgress / seekDuration) * 100}%, rgba(255,255,255,0.2) ${(seekProgress / seekDuration) * 100}%)`,
                }}
              />
              <span className="text-[10px] text-white/40 w-10 tabular-nums">
                {formatTime(seekDuration)}
              </span>
            </div>
          )}
          {/* Controls row */}
          <div className="px-4 py-2 flex items-center gap-4">
            <button
              onClick={togglePlayback}
              disabled={isLoadingVideo}
              className="w-8 h-8 flex items-center justify-center text-white hover:text-white/80 transition-colors border border-white/30 disabled:opacity-40"
            >
              {isLoadingVideo ? (
                <span className="animate-pulse text-xs">...</span>
              ) : isPlaying ? (
                <Pause className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4" />
              )}
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white truncate">
                {isLoadingVideo ? 'Searching YouTube...' : playingTrack?.title}
              </p>
              <p className="text-xs text-white/50 truncate">
                {isLoadingVideo ? '' : playingTrack?.artist}
              </p>
            </div>
            {isPlaying && <Volume2 className="w-4 h-4 text-white/40" />}
            <button
              onClick={stopPlayback}
              className="w-6 h-6 flex items-center justify-center text-white/40 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Nucleus Chat */}
      <NucleusChat
        ref={nucleusChatRef}
        nucleusName={nucleusName}
        isOpen={isChatOpen}
        onClose={() => {
          setIsChatOpen(false)
          visualizationRef.current?.resetCamera()
        }}
        sidebarCollapsed={sidebarCollapsed}
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
      className={`bg-black border border-white/20 p-3 transition-colors group font-mono track-card-enter ${
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
