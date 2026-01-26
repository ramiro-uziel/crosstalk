import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { Track, Emotion } from '../types/track'

interface GalaxyVisualizationProps {
  tracks: Track[]
  onTrackClick?: (track: Track) => void
}

const EMOTION_COLORS: Record<Emotion, string> = {
  joy: '#FFD700',
  sadness: '#4169E1',
  anger: '#DC143C',
  fear: '#8B008B',
  love: '#FF1493',
  surprise: '#FF8C00',
  calm: '#00CED1',
  nostalgia: '#9370DB',
}

const EMOTION_POSITIONS: Record<Emotion, [number, number, number]> = {
  joy: [8, 0, 0],
  sadness: [-8, 0, 0],
  anger: [0, 8, 0],
  fear: [0, -8, 0],
  love: [5.7, 5.7, 0],
  surprise: [-5.7, 5.7, 0],
  calm: [5.7, -5.7, 0],
  nostalgia: [-5.7, -5.7, 0],
}

export function GalaxyVisualization({ tracks, onTrackClick }: GalaxyVisualizationProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const trackMeshesRef = useRef<Map<number, THREE.Mesh>>(new Map())

  useEffect(() => {
    if (!containerRef.current) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x000000)
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(
      75,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      1000
    )
    camera.position.z = 25
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight)
    containerRef.current.appendChild(renderer.domElement)
    rendererRef.current = renderer

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3)
    scene.add(ambientLight)

    const pointLight = new THREE.PointLight(0xffffff, 1, 100)
    pointLight.position.set(0, 0, 10)
    scene.add(pointLight)

    Object.entries(EMOTION_POSITIONS).forEach(([emotion, position]) => {
      const color = EMOTION_COLORS[emotion as Emotion]
      const geometry = new THREE.SphereGeometry(0.8, 32, 32)
      const material = new THREE.MeshStandardMaterial({
        color: color,
        emissive: color,
        emissiveIntensity: 0.5,
      })
      const star = new THREE.Mesh(geometry, material)
      star.position.set(...position)
      scene.add(star)

      const glowGeometry = new THREE.SphereGeometry(1.2, 32, 32)
      const glowMaterial = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.2,
      })
      const glow = new THREE.Mesh(glowGeometry, glowMaterial)
      glow.position.set(...position)
      scene.add(glow)
    })

    const handleResize = () => {
      if (!containerRef.current || !camera || !renderer) return
      camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight)
    }

    window.addEventListener('resize', handleResize)

    let rotation = 0
    const animate = () => {
      requestAnimationFrame(animate)
      rotation += 0.001

      trackMeshesRef.current.forEach((mesh, trackId) => {
        const track = tracks.find(t => t.id === trackId)
        if (!track) return

        const starPos = EMOTION_POSITIONS[track.emotion]
        const orbitRadius = 2 + (trackId % 3) * 0.5
        const speed = 0.5 + (trackId % 5) * 0.1
        const angle = rotation * speed + trackId

        mesh.position.x = starPos[0] + Math.cos(angle) * orbitRadius
        mesh.position.y = starPos[1] + Math.sin(angle) * orbitRadius
        mesh.position.z = starPos[2] + Math.sin(angle * 2) * 0.5
      })

      scene.rotation.y = rotation * 0.1

      renderer.render(scene, camera)
    }

    animate()

    return () => {
      window.removeEventListener('resize', handleResize)
      renderer.dispose()
      containerRef.current?.removeChild(renderer.domElement)
    }
  }, [])

  useEffect(() => {
    if (!sceneRef.current) return

    const currentTrackIds = new Set(tracks.map(t => t.id))
    const meshTrackIds = new Set(trackMeshesRef.current.keys())

    meshTrackIds.forEach(id => {
      if (!currentTrackIds.has(id)) {
        const mesh = trackMeshesRef.current.get(id)
        if (mesh) {
          sceneRef.current?.remove(mesh)
          trackMeshesRef.current.delete(id)
        }
      }
    })

    tracks.forEach(track => {
      if (!trackMeshesRef.current.has(track.id)) {
        const geometry = new THREE.SphereGeometry(0.3, 16, 16)
        const material = new THREE.MeshStandardMaterial({
          color: EMOTION_COLORS[track.emotion],
          emissive: EMOTION_COLORS[track.emotion],
          emissiveIntensity: 0.3,
        })
        const mesh = new THREE.Mesh(geometry, material)
        sceneRef.current?.add(mesh)
        trackMeshesRef.current.set(track.id, mesh)
      }
    })
  }, [tracks])

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ cursor: 'grab' }}
    />
  )
}
