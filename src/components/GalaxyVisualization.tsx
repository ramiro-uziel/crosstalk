import { useEffect, useRef, useCallback } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { Track, Emotion } from '../types/track'

interface GalaxyParameters {
  count: number
  size: number
  radius: number
  branches: number
  spin: number
  randomness: number
  randomnessPower: number
  insideColor: string
  outsideColor: string
}

interface EmotionData {
  name: string
  color: string
  position: THREE.Vector3
}

interface FocusedEmotionInfo {
  emotion: EmotionData
  tracks: Track[]
}

interface GalaxyVisualizationProps {
  tracks: Track[]
  onEmotionFocus?: (info: FocusedEmotionInfo | null, screenPosition: { x: number; y: number } | null) => void
  onTrackClick?: (track: Track) => void
}

const EMOTION_COLORS: Record<Emotion, string> = {
  joy: '#FFD700',
  sadness: '#4169E1',
  anger: '#DC143C',
  fear: '#800080',
  love: '#FF69B4',
  surprise: '#FF8C00',
  calm: '#00CED1',
  nostalgia: '#DDA0DD',
}

const DEFAULT_PARAMETERS: GalaxyParameters = {
  count: 324900,
  size: 0.001,
  radius: 3.47,
  branches: 8,
  spin: 1.117,
  randomness: 0.6,
  randomnessPower: 3.922,
  insideColor: '#030303',
  outsideColor: '#1B1D2D',
}

export function GalaxyVisualization({ tracks, onEmotionFocus, onTrackClick }: GalaxyVisualizationProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const previousCameraState = useRef<{ position: THREE.Vector3; target: THREE.Vector3 } | null>(null)
  const initialCameraState = useRef<{ position: THREE.Vector3; target: THREE.Vector3 } | null>(null)
  const focusedEmotionRef = useRef<EmotionData | null>(null)
  const emotionPositionsRef = useRef<Map<string, THREE.Vector3>>(new Map())
  const tracksByEmotionRef = useRef<Record<string, Track[]>>({})
  const orbitingSongsRef = useRef<Array<{
    mesh: THREE.Group
    emotion: EmotionData
    initialAngle: number
    speed: number
    radius: number
    trackId: number
  }>>([])

  // Update tracks ref when tracks change
  useEffect(() => {
    const grouped = tracks.reduce((acc, track) => {
      if (!acc[track.emotion]) acc[track.emotion] = []
      acc[track.emotion].push(track)
      return acc
    }, {} as Record<string, Track[]>)
    tracksByEmotionRef.current = grouped
  }, [tracks])

  const updateTooltipPosition = useCallback(() => {
    if (!focusedEmotionRef.current || !cameraRef.current || !onEmotionFocus || !containerRef.current) return

    const camera = cameraRef.current
    const container = containerRef.current
    const rect = container.getBoundingClientRect()

    const vector = focusedEmotionRef.current.position.clone()
    vector.project(camera)

    // Use container dimensions, not window dimensions
    const centerX = rect.left + (vector.x * 0.5 + 0.5) * rect.width
    const centerY = rect.top + (-vector.y * 0.5 + 0.5) * rect.height

    const offsetX = 200
    const offsetY = -50

    const emotionTracks = tracksByEmotionRef.current[focusedEmotionRef.current.name.toLowerCase()] || []

    onEmotionFocus(
      { emotion: focusedEmotionRef.current, tracks: emotionTracks },
      { x: centerX + offsetX, y: centerY + offsetY }
    )
  }, [onEmotionFocus])

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return

    const canvas = canvasRef.current
    const container = containerRef.current
    const scene = new THREE.Scene()
    sceneRef.current = scene
    const parameters = DEFAULT_PARAMETERS

    const sizes = {
      width: container.clientWidth,
      height: container.clientHeight,
    }

    const camera = new THREE.PerspectiveCamera(75, sizes.width / sizes.height, 0.5, 100)
    camera.position.set(3, 3, 3)
    scene.add(camera)
    cameraRef.current = camera

    const controls = new OrbitControls(camera, canvas)
    controls.enableDamping = true
    controls.minDistance = 0.5
    controls.maxDistance = 20
    // Allow full rotation from any angle
    controls.minPolarAngle = 0
    controls.maxPolarAngle = Math.PI
    controls.minAzimuthAngle = -Infinity
    controls.maxAzimuthAngle = Infinity
    controlsRef.current = controls

    initialCameraState.current = {
      position: camera.position.clone(),
      target: controls.target.clone(),
    }

    const renderer = new THREE.WebGLRenderer({ canvas })
    renderer.setSize(sizes.width, sizes.height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    let geometry: THREE.BufferGeometry | null = null
    let material: THREE.PointsMaterial | null = null
    let points: THREE.Points | null = null

    const emotionStars: THREE.Group[] = []
    const clickableStarCores: THREE.Mesh[] = []
    const orbitingSongs: typeof orbitingSongsRef.current = []

    const emotions: EmotionData[] = [
      { name: 'Joy', color: EMOTION_COLORS.joy, position: new THREE.Vector3() },
      { name: 'Sadness', color: EMOTION_COLORS.sadness, position: new THREE.Vector3() },
      { name: 'Anger', color: EMOTION_COLORS.anger, position: new THREE.Vector3() },
      { name: 'Fear', color: EMOTION_COLORS.fear, position: new THREE.Vector3() },
      { name: 'Love', color: EMOTION_COLORS.love, position: new THREE.Vector3() },
      { name: 'Surprise', color: EMOTION_COLORS.surprise, position: new THREE.Vector3() },
      { name: 'Calm', color: EMOTION_COLORS.calm, position: new THREE.Vector3() },
      { name: 'Nostalgia', color: EMOTION_COLORS.nostalgia, position: new THREE.Vector3() },
    ]

    const generateGalaxy = () => {
      if (points !== null) {
        geometry?.dispose()
        material?.dispose()
        scene.remove(points)
      }

      emotionStars.forEach(star => scene.remove(star))
      emotionStars.length = 0
      clickableStarCores.length = 0
      orbitingSongs.forEach(song => scene.remove(song.mesh))
      orbitingSongs.length = 0

      geometry = new THREE.BufferGeometry()
      const positions = new Float32Array(parameters.count * 3)
      const colors = new Float32Array(parameters.count * 3)

      const insideColor = new THREE.Color(parameters.insideColor)
      const outsideColor = new THREE.Color(parameters.outsideColor)

      const emotionPositions: Array<{ x: number; z: number; color: THREE.Color; branchIndex: number }> = []
      emotions.forEach((emotion, index) => {
        const branchAngle = (index / parameters.branches) * Math.PI * 2
        const emotionRadius = parameters.radius * 0.6
        const spinAngle = emotionRadius * parameters.spin
        const x = Math.cos(branchAngle + spinAngle) * emotionRadius
        const z = Math.sin(branchAngle + spinAngle) * emotionRadius
        emotionPositions.push({ x, z, color: new THREE.Color(emotion.color), branchIndex: index })
      })

      for (let i = 0; i < parameters.count; i++) {
        const i3 = i * 3
        const radius = Math.random() * parameters.radius
        const spinAngle = radius * parameters.spin
        const branchAngle = ((i % parameters.branches) / parameters.branches) * Math.PI * 2

        const randomX = Math.pow(Math.random(), parameters.randomnessPower) * parameters.randomness * (Math.random() < 0.5 ? 1 : -1) * parameters.randomness * radius
        const randomY = Math.pow(Math.random(), parameters.randomnessPower) * parameters.randomness * (Math.random() < 0.5 ? 1 : -1) * parameters.randomness * radius
        const randomZ = Math.pow(Math.random(), parameters.randomnessPower) * parameters.randomness * (Math.random() < 0.5 ? 1 : -1) * parameters.randomness * radius

        const px = Math.cos(branchAngle + spinAngle) * radius + randomX
        const py = randomY
        const pz = Math.sin(branchAngle + spinAngle) * radius + randomZ

        positions[i3] = px
        positions[i3 + 1] = py
        positions[i3 + 2] = pz

        const mixedColor = insideColor.clone()
        mixedColor.lerp(outsideColor, radius / parameters.radius)

        const currentBranchIndex = i % parameters.branches
        emotionPositions.forEach(emotionPos => {
          if (emotionPos.branchIndex === currentBranchIndex) {
            const dx = px - emotionPos.x
            const dz = pz - emotionPos.z
            const distance = Math.sqrt(dx * dx + py * py + dz * dz)
            const influenceRadius = 1.2
            if (distance < influenceRadius) {
              const influence = 1 - distance / influenceRadius
              const emotionInfluence = Math.pow(influence, 2) * 0.7
              mixedColor.lerp(emotionPos.color, emotionInfluence)
            }
          }
        })

        colors[i3] = mixedColor.r
        colors[i3 + 1] = mixedColor.g
        colors[i3 + 2] = mixedColor.b
      }

      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

      material = new THREE.PointsMaterial({
        size: parameters.size,
        sizeAttenuation: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexColors: true,
      })

      points = new THREE.Points(geometry, material)
      scene.add(points)

      emotions.forEach((emotion, index) => {
        const branchAngle = (index / emotions.length) * Math.PI * 2
        const emotionRadius = parameters.radius * 0.6
        const spinAngle = emotionRadius * parameters.spin
        const x = Math.cos(branchAngle + spinAngle) * emotionRadius
        const z = Math.sin(branchAngle + spinAngle) * emotionRadius

        emotion.position.set(x, 0, z)
        emotionPositionsRef.current.set(emotion.name.toLowerCase(), new THREE.Vector3(x, 0, z))

        const star = new THREE.Group()
        star.position.copy(emotion.position)

        const layerCount = 5
        const minRadius = 0.04
        const maxRadius = 0.22
        const whiteColor = new THREE.Color('#ffffff')
        const emotionColorObj = new THREE.Color(emotion.color)

        let outer: THREE.Mesh | null = null

        for (let i = 0; i < layerCount; i++) {
          const t = i / (layerCount - 1)
          const layerRadius = minRadius + (maxRadius - minRadius) * t
          const layerColor = whiteColor.clone().lerp(emotionColorObj, t)
          const opacity = 0.9 - t * 0.5

          const layerGeometry = new THREE.SphereGeometry(layerRadius, 32, 32)
          const layerMaterial = new THREE.MeshBasicMaterial({
            color: layerColor,
            transparent: true,
            opacity,
            depthWrite: false,
            depthTest: true,
          })
          const layer = new THREE.Mesh(layerGeometry, layerMaterial)
          layer.renderOrder = i
          star.add(layer)

          if (i === layerCount - 1) outer = layer
        }

        const glowGeometry = new THREE.SphereGeometry(0.28, 32, 32)
        const glowMaterial = new THREE.MeshBasicMaterial({
          color: emotion.color,
          transparent: true,
          opacity: 0.2,
          depthWrite: false,
          depthTest: true,
        })
        const glow = new THREE.Mesh(glowGeometry, glowMaterial)
        glow.renderOrder = layerCount
        star.add(glow)

        const particleCount = 400
        const particlePositions = new Float32Array(particleCount * 3)
        const particleColors = new Float32Array(particleCount * 3)
        const innerColor = new THREE.Color(emotion.color).lerp(new THREE.Color('#ffffff'), 0.5)
        const outerParticleColor = new THREE.Color(emotion.color)

        for (let i = 0; i < particleCount; i++) {
          const i3 = i * 3
          const minParticleRadius = 0.3
          const maxParticleRadius = 0.55
          const particleRadius = minParticleRadius + Math.random() * (maxParticleRadius - minParticleRadius)
          const theta = Math.random() * Math.PI * 2
          const phi = Math.acos(2 * Math.random() - 1)

          particlePositions[i3] = particleRadius * Math.sin(phi) * Math.cos(theta)
          particlePositions[i3 + 1] = particleRadius * Math.sin(phi) * Math.sin(theta)
          particlePositions[i3 + 2] = particleRadius * Math.cos(phi)

          const normalizedRadius = (particleRadius - minParticleRadius) / (maxParticleRadius - minParticleRadius)
          const gradientColor = innerColor.clone()
          gradientColor.lerp(outerParticleColor, normalizedRadius)

          const colorVariation = 0.9 + Math.random() * 0.1
          particleColors[i3] = gradientColor.r * colorVariation
          particleColors[i3 + 1] = gradientColor.g * colorVariation
          particleColors[i3 + 2] = gradientColor.b * colorVariation
        }

        const particleGeometry = new THREE.BufferGeometry()
        particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3))
        particleGeometry.setAttribute('color', new THREE.BufferAttribute(particleColors, 3))

        const particleCanvas = document.createElement('canvas')
        particleCanvas.width = 64
        particleCanvas.height = 64
        const ctx = particleCanvas.getContext('2d')
        if (ctx) {
          const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
          gradient.addColorStop(0, 'rgba(255, 255, 255, 1)')
          gradient.addColorStop(0.2, 'rgba(255, 255, 255, 0.8)')
          gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.3)')
          gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')
          ctx.fillStyle = gradient
          ctx.fillRect(0, 0, 64, 64)
        }
        const particleTexture = new THREE.CanvasTexture(particleCanvas)

        const particleMaterial = new THREE.PointsMaterial({
          size: 0.025,
          sizeAttenuation: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          vertexColors: true,
          transparent: true,
          opacity: 0.4,
          map: particleTexture,
        })

        const particleCloud = new THREE.Points(particleGeometry, particleMaterial)
        star.add(particleCloud)

        scene.add(star)
        emotionStars.push(star)
        if (outer) clickableStarCores.push(outer)

        const emotionTracks = tracksByEmotionRef.current[emotion.name.toLowerCase()] || []
        emotionTracks.forEach((track, songIndex) => {
          const planet = createPlanet(emotion.color)
          const orbitRadius = 0.35 + songIndex * 0.12
          const totalTracks = emotionTracks.length
          const initialAngle = (songIndex / Math.max(totalTracks, 1)) * Math.PI * 2
          const speed = 0.015 + songIndex * 0.005

          orbitingSongs.push({
            mesh: planet,
            emotion,
            initialAngle,
            speed,
            radius: orbitRadius,
            trackId: track.id,
          })

          scene.add(planet)
        })
      })

      orbitingSongsRef.current = orbitingSongs
    }

    const createPlanet = (color: string) => {
      const planet = new THREE.Group()

      const planetCoreGeometry = new THREE.SphereGeometry(0.025, 16, 16)
      const planetCoreMaterial = new THREE.MeshBasicMaterial({
        color: '#ffffff',
        transparent: true,
        opacity: 1.0,
        depthWrite: false,
        depthTest: true,
      })
      const planetCore = new THREE.Mesh(planetCoreGeometry, planetCoreMaterial)
      planetCore.renderOrder = 0
      planet.add(planetCore)

      const planetMiddleGeometry = new THREE.SphereGeometry(0.038, 16, 16)
      const planetBlendColor = new THREE.Color('#ffffff').lerp(new THREE.Color(color), 0.35)
      const planetMiddleMaterial = new THREE.MeshBasicMaterial({
        color: planetBlendColor,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        depthTest: true,
      })
      const planetMiddle = new THREE.Mesh(planetMiddleGeometry, planetMiddleMaterial)
      planetMiddle.renderOrder = 1
      planet.add(planetMiddle)

      const planetOuterGeometry = new THREE.SphereGeometry(0.052, 16, 16)
      const brighterEmotionColor = new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.3)
      const planetOuterMaterial = new THREE.MeshBasicMaterial({
        color: brighterEmotionColor,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        depthTest: true,
      })
      const planetOuter = new THREE.Mesh(planetOuterGeometry, planetOuterMaterial)
      planetOuter.renderOrder = 2
      planet.add(planetOuter)

      const planetGlowGeometry = new THREE.SphereGeometry(0.075, 16, 16)
      const planetGlowMaterial = new THREE.MeshBasicMaterial({
        color: brighterEmotionColor,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
        depthTest: true,
        blending: THREE.AdditiveBlending,
      })
      const planetGlow = new THREE.Mesh(planetGlowGeometry, planetGlowMaterial)
      planetGlow.renderOrder = 3
      planet.add(planetGlow)

      return planet
    }

    generateGalaxy()

    const raycaster = new THREE.Raycaster()
    const mouse = new THREE.Vector2()

    const onMouseClick = (event: MouseEvent) => {
      const rect = container.getBoundingClientRect()
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

      raycaster.setFromCamera(mouse, camera)
      const intersects = raycaster.intersectObjects(clickableStarCores)

      if (intersects.length > 0) {
        const clickedStarIndex = clickableStarCores.indexOf(intersects[0].object as THREE.Mesh)

        if (clickedStarIndex !== -1) {
          const emotion = emotions[clickedStarIndex]

          if (!previousCameraState.current) {
            previousCameraState.current = {
              position: camera.position.clone(),
              target: controls.target.clone(),
            }
          }

          focusedEmotionRef.current = emotion

          const targetLookAt = emotion.position.clone()
          const targetDistance = 2.5
          const startOffset = camera.position.clone().sub(controls.target)
          const startSpherical = new THREE.Spherical().setFromVector3(startOffset)
          const endSpherical = new THREE.Spherical(targetDistance, 0.01, startSpherical.theta)
          const startTarget = controls.target.clone()
          const startTime = Date.now()
          const duration = 1200

          const animateCamera = () => {
            const elapsed = Date.now() - startTime
            const t = Math.min(elapsed / duration, 1)
            const eased = 1 - Math.pow(1 - t, 3)

            const currentTarget = startTarget.clone().lerp(targetLookAt, eased)
            controls.target.copy(currentTarget)

            const currentSpherical = new THREE.Spherical(
              THREE.MathUtils.lerp(startSpherical.radius, endSpherical.radius, eased),
              THREE.MathUtils.lerp(startSpherical.phi, endSpherical.phi, eased),
              startSpherical.theta
            )

            const offset = new THREE.Vector3().setFromSpherical(currentSpherical)
            camera.position.copy(currentTarget).add(offset)

            if (t < 1) {
              requestAnimationFrame(animateCamera)
            } else {
              updateTooltipPosition()
            }
          }

          animateCamera()
        }
      } else {
        if (previousCameraState.current && focusedEmotionRef.current) {
          const startCameraPos = camera.position.clone()
          const startTarget = controls.target.clone()
          const targetCameraPos = previousCameraState.current.position
          const targetLookAt = previousCameraState.current.target
          const startTime = Date.now()
          const duration = 1200

          const animateBack = () => {
            const elapsed = Date.now() - startTime
            const t = Math.min(elapsed / duration, 1)
            const eased = 1 - Math.pow(1 - t, 3)

            camera.position.lerpVectors(startCameraPos, targetCameraPos, eased)
            controls.target.lerpVectors(startTarget, targetLookAt, eased)

            if (t < 1) {
              requestAnimationFrame(animateBack)
            } else {
              previousCameraState.current = null
            }
          }

          animateBack()
        }

        focusedEmotionRef.current = null
        onEmotionFocus?.(null, null)
      }
    }

    window.addEventListener('click', onMouseClick)

    const handleResize = () => {
      if (!container) return
      sizes.width = container.clientWidth
      sizes.height = container.clientHeight
      camera.aspect = sizes.width / sizes.height
      camera.updateProjectionMatrix()
      renderer.setSize(sizes.width, sizes.height)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    }

    window.addEventListener('resize', handleResize)

    const clock = new THREE.Clock()

    const tick = () => {
      const elapsedTime = clock.getElapsedTime()

      orbitingSongsRef.current.forEach(({ mesh, emotion, initialAngle, speed, radius }) => {
        const currentAngle = initialAngle + elapsedTime * speed
        const x = emotion.position.x + Math.cos(currentAngle) * radius
        const z = emotion.position.z + Math.sin(currentAngle) * radius
        const y = emotion.position.y + Math.sin(currentAngle * 2) * 0.05
        mesh.position.set(x, y, z)
      })

      emotionStars.forEach((star, index) => {
        const scale = 1 + Math.sin(elapsedTime * 0.5 + index) * 0.1
        star.scale.set(scale, scale, scale)
      })

      if (focusedEmotionRef.current) {
        updateTooltipPosition()
      }

      controls.update()
      renderer.render(scene, camera)
      requestAnimationFrame(tick)
    }

    tick()

    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('click', onMouseClick)

      emotionStars.forEach(star => {
        star.traverse(child => {
          if (child instanceof THREE.Mesh) {
            child.geometry?.dispose()
            if (child.material instanceof THREE.Material) {
              child.material.dispose()
            }
          }
          if (child instanceof THREE.Points) {
            child.geometry?.dispose()
            if (child.material instanceof THREE.Material) {
              child.material.dispose()
            }
          }
        })
        scene.remove(star)
      })

      orbitingSongsRef.current.forEach(song => {
        song.mesh.traverse(child => {
          if (child instanceof THREE.Mesh) {
            child.geometry?.dispose()
            if (child.material instanceof THREE.Material) {
              child.material.dispose()
            }
          }
        })
        scene.remove(song.mesh)
      })

      renderer.dispose()
      geometry?.dispose()
      material?.dispose()
      controls.dispose()
      cameraRef.current = null
      sceneRef.current = null
      orbitingSongsRef.current = []
    }
  }, [])

  // Handle track changes without regenerating entire scene
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return

    const currentOrbitingSongs = orbitingSongsRef.current
    const currentTrackIds = new Set(currentOrbitingSongs.map(s => s.trackId))
    const allEmotionNames = ['joy', 'sadness', 'anger', 'fear', 'love', 'surprise', 'calm', 'nostalgia'] as const

    allEmotionNames.forEach(emotionName => {
      const emotionTracks = tracksByEmotionRef.current[emotionName] || []
      const position = emotionPositionsRef.current.get(emotionName)
      if (!position) return

      const color = EMOTION_COLORS[emotionName]

      emotionTracks.forEach((track, songIndex) => {
        if (!currentTrackIds.has(track.id)) {
          const planet = new THREE.Group()

          const planetCoreGeometry = new THREE.SphereGeometry(0.025, 16, 16)
          const planetCoreMaterial = new THREE.MeshBasicMaterial({
            color: '#ffffff',
            transparent: true,
            opacity: 1.0,
            depthWrite: false,
            depthTest: true,
          })
          const planetCore = new THREE.Mesh(planetCoreGeometry, planetCoreMaterial)
          planetCore.renderOrder = 0
          planet.add(planetCore)

          const planetMiddleGeometry = new THREE.SphereGeometry(0.038, 16, 16)
          const planetBlendColor = new THREE.Color('#ffffff').lerp(new THREE.Color(color), 0.35)
          const planetMiddleMaterial = new THREE.MeshBasicMaterial({
            color: planetBlendColor,
            transparent: true,
            opacity: 0.95,
            depthWrite: false,
            depthTest: true,
          })
          const planetMiddle = new THREE.Mesh(planetMiddleGeometry, planetMiddleMaterial)
          planetMiddle.renderOrder = 1
          planet.add(planetMiddle)

          const planetOuterGeometry = new THREE.SphereGeometry(0.052, 16, 16)
          const brighterEmotionColor = new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.3)
          const planetOuterMaterial = new THREE.MeshBasicMaterial({
            color: brighterEmotionColor,
            transparent: true,
            opacity: 0.85,
            depthWrite: false,
            depthTest: true,
          })
          const planetOuter = new THREE.Mesh(planetOuterGeometry, planetOuterMaterial)
          planetOuter.renderOrder = 2
          planet.add(planetOuter)

          const planetGlowGeometry = new THREE.SphereGeometry(0.075, 16, 16)
          const planetGlowMaterial = new THREE.MeshBasicMaterial({
            color: brighterEmotionColor,
            transparent: true,
            opacity: 0.4,
            depthWrite: false,
            depthTest: true,
            blending: THREE.AdditiveBlending,
          })
          const planetGlow = new THREE.Mesh(planetGlowGeometry, planetGlowMaterial)
          planetGlow.renderOrder = 3
          planet.add(planetGlow)

          const orbitRadius = 0.35 + songIndex * 0.12
          const totalTracks = emotionTracks.length
          const initialAngle = (songIndex / Math.max(totalTracks, 1)) * Math.PI * 2
          const speed = 0.015 + songIndex * 0.005

          const emotionObj: EmotionData = {
            name: emotionName.charAt(0).toUpperCase() + emotionName.slice(1),
            color,
            position: position.clone(),
          }

          currentOrbitingSongs.push({
            mesh: planet,
            emotion: emotionObj,
            initialAngle,
            speed,
            radius: orbitRadius,
            trackId: track.id,
          })

          scene.add(planet)
        }
      })
    })

    const allCurrentTrackIds = new Set<number>()
    allEmotionNames.forEach(emotionName => {
      const emotionTracks = tracksByEmotionRef.current[emotionName] || []
      emotionTracks.forEach(t => allCurrentTrackIds.add(t.id))
    })

    const toRemove = currentOrbitingSongs.filter(s => !allCurrentTrackIds.has(s.trackId))
    toRemove.forEach(song => {
      song.mesh.traverse(child => {
        if (child instanceof THREE.Mesh) {
          child.geometry?.dispose()
          if (child.material instanceof THREE.Material) {
            child.material.dispose()
          }
        }
      })
      scene.remove(song.mesh)
      const idx = currentOrbitingSongs.indexOf(song)
      if (idx > -1) currentOrbitingSongs.splice(idx, 1)
    })
  }, [tracks])

  return (
    <div ref={containerRef} className="w-full h-full">
      <canvas ref={canvasRef} className="galaxy-canvas" />
    </div>
  )
}
