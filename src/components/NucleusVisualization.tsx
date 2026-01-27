import { useEffect, useRef, useCallback, useMemo, useImperativeHandle, forwardRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { useExtractColors } from 'react-extract-colors'
import type { Track } from '../types/track'

// Helper component to extract colors for a single track
interface TrackColorsExtractorProps {
  track: Track
  onColorsExtracted: (trackId: number, colors: { dominant: string; darker: string; lighter: string }) => void
}

function TrackColorsExtractor({ track, onColorsExtracted }: TrackColorsExtractorProps) {
  const { dominantColor, darkerColor, lighterColor, loading } = useExtractColors(track.thumbnail_url || '', {
    maxColors: 5,
    format: 'hex',
  })

  useEffect(() => {
    if (!loading && dominantColor) {
      onColorsExtracted(track.id, {
        dominant: dominantColor,
        darker: darkerColor || dominantColor,
        lighter: lighterColor || dominantColor,
      })
    }
  }, [loading, dominantColor, darkerColor, lighterColor, track.id, onColorsExtracted])

  return null
}

interface OrbitInfo {
  orbitIndex: number
  tracks: Track[]
}

interface NucleusVisualizationProps {
  tracks: Track[]
  onOrbitClick?: (orbitInfo: OrbitInfo | null) => void
  onTrackClick?: (track: Track) => void
  onNucleusClick?: () => void
  isAudioPlaying?: boolean
  audioEnergy?: number
  audioTempo?: number
}

// Orbit radii
const ORBIT_RADII = [1.0, 1.3, 1.6, 1.9]

// Orbit tilts (like an atom) - symmetric tilts
const ORBIT_TILTS = [
  { x: 0, z: 0 },                              // Orbit 1: flat (equatorial)
  { x: Math.PI * 0.25, z: 0 },                 // Orbit 2: tilted 45° forward
  { x: -Math.PI * 0.25, z: 0 },                // Orbit 3: tilted 45° backward (symmetric to 2)
  { x: 0, z: Math.PI * 0.25 },                 // Orbit 4: tilted 45° right
]

// Track orbit speeds (how fast tracks move along their orbit)
const TRACK_SPEEDS = [0.25, 0.22, 0.19, 0.17]

// Factory function to create fresh shader uniforms
const createDitheringShader = () => ({
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2() },
    ditherStrength: { value: 0.6 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float ditherStrength;
    varying vec2 vUv;

    // 8x8 Bayer matrix
    const int bayerMatrix[64] = int[64](
       0, 32,  8, 40,  2, 34, 10, 42,
      48, 16, 56, 24, 50, 18, 58, 26,
      12, 44,  4, 36, 14, 46,  6, 38,
      60, 28, 52, 20, 62, 30, 54, 22,
       3, 35, 11, 43,  1, 33,  9, 41,
      51, 19, 59, 27, 49, 17, 57, 25,
      15, 47,  7, 39, 13, 45,  5, 37,
      63, 31, 55, 23, 61, 29, 53, 21
    );

    float getBayerValue(vec2 coord) {
      int x = int(mod(coord.x, 8.0));
      int y = int(mod(coord.y, 8.0));
      return float(bayerMatrix[y * 8 + x]) / 64.0;
    }

    void main() {
      vec4 texColor = texture2D(tDiffuse, vUv);
      vec2 fragCoord = vUv * resolution * 5.0;

      // Get luminance
      float luminance = dot(texColor.rgb, vec3(0.299, 0.587, 0.114));
      
      // Calculate saturation
      float maxC = max(max(texColor.r, texColor.g), texColor.b);
      float minC = min(min(texColor.r, texColor.g), texColor.b);
      float saturation = maxC > 0.0 ? (maxC - minC) / maxC : 0.0;

      // Get Bayer threshold
      float bayerValue = getBayerValue(fragCoord);
      float threshold = bayerValue * ditherStrength;

      // Dither with some scatter in dark areas
      float ditherMask = 0.25 + smoothstep(0.02, 0.25, luminance) * 0.85;
      float dithered = (luminance > threshold ? 1.0 : 0.0) * ditherMask;
      
      // Blend between dithered B&W and original color based on saturation and brightness
      // Colorful areas (like album art and aura) keep their color
      float colorBlend = smoothstep(0.08, 0.25, saturation) * smoothstep(0.05, 0.2, luminance);
      vec3 finalColor = mix(vec3(dithered), texColor.rgb, colorBlend);

      gl_FragColor = vec4(finalColor, 1.0);
    }
  `,
})

export interface NucleusVisualizationHandle {
  resetCamera: () => void
  getTrackScreenPosition: (trackId: number) => { x: number; y: number } | null
}

export const NucleusVisualization = forwardRef<NucleusVisualizationHandle, NucleusVisualizationProps>(function NucleusVisualization({ tracks, onOrbitClick, onTrackClick, onNucleusClick, isAudioPlaying, audioEnergy, audioTempo }, ref) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const composerRef = useRef<EffectComposer | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const trackPointsRef = useRef<Map<number, { group: THREE.Group; track: Track; orbitIndex: number; initialAngle: number; billboard: THREE.Mesh; glassMaterial: THREE.ShaderMaterial }>>(new Map())
  const orbitGroupsRef = useRef<THREE.Group[]>([])
  const nucleusRef = useRef<THREE.Group | null>(null)
  const animationIdRef = useRef<number | null>(null)
  const followedTrackIdRef = useRef<number | null>(null)
  const trackColorsRef = useRef<Map<number, { dominant: string; darker: string; lighter: string }>>(new Map())

  // Keep audio state in refs for animation loop
  const isAudioPlayingRef = useRef(false)
  const audioEnergyRef = useRef(0.5)
  const audioTempoRef = useRef(120)

  useEffect(() => {
    isAudioPlayingRef.current = isAudioPlaying || false
    audioEnergyRef.current = audioEnergy ?? 0.5
    audioTempoRef.current = audioTempo ?? 120
  }, [isAudioPlaying, audioEnergy, audioTempo])

  useImperativeHandle(ref, () => ({
    resetCamera: () => {
      followedTrackIdRef.current = null
      const camera = cameraRef.current
      const controls = controlsRef.current
      if (!camera || !controls) return
      const targetPos = new THREE.Vector3(2, 1.5, 2)
      const targetLookAt = new THREE.Vector3(0, 0, 0)
      const animateReset = () => {
        const distPos = camera.position.distanceTo(targetPos)
        const distLook = controls.target.distanceTo(targetLookAt)
        if (distPos > 0.01 || distLook > 0.01) {
          camera.position.lerp(targetPos, 0.05)
          controls.target.lerp(targetLookAt, 0.05)
          requestAnimationFrame(animateReset)
        }
      }
      animateReset()
    },
    getTrackScreenPosition: (trackId: number) => {
      const camera = cameraRef.current
      const renderer = rendererRef.current
      const trackPoint = trackPointsRef.current.get(trackId)

      if (!camera || !renderer || !trackPoint) return null

      // Get world position of the track
      const worldPos = new THREE.Vector3()
      trackPoint.group.getWorldPosition(worldPos)

      // Project to screen coordinates
      const screenPos = worldPos.clone().project(camera)

      // Convert to pixel coordinates
      const canvas = renderer.domElement
      const x = (screenPos.x * 0.5 + 0.5) * canvas.clientWidth
      const y = (-(screenPos.y * 0.5) + 0.5) * canvas.clientHeight

      return { x, y }
    },
  }))

  // Brighten a color if it's too dark
  const ensureVisibleColor = useCallback((hexColor: string, minLuminance = 0.25): THREE.Color => {
    const color = new THREE.Color(hexColor)
    const luminance = 0.299 * color.r + 0.587 * color.g + 0.114 * color.b
    
    if (luminance < minLuminance) {
      // Calculate how much to brighten
      const boost = minLuminance / Math.max(luminance, 0.01)
      color.r = Math.min(color.r * boost, 1.0)
      color.g = Math.min(color.g * boost, 1.0)
      color.b = Math.min(color.b * boost, 1.0)
    }
    
    return color
  }, [])

  // Callback for when colors are extracted
  const handleColorsExtracted = useCallback((trackId: number, colors: { dominant: string; darker: string; lighter: string }) => {
    // Ensure colors are visible by brightening if too dark
    const dominant = ensureVisibleColor(colors.dominant || '#888888', 0.3)
    const darker = ensureVisibleColor(colors.darker || colors.dominant || '#888888', 0.15)
    const lighter = ensureVisibleColor(colors.lighter || colors.dominant || '#aaaaaa', 0.4)
    
    const validColors = {
      dominant: `#${dominant.getHexString()}`,
      darker: `#${darker.getHexString()}`,
      lighter: `#${lighter.getHexString()}`,
    }
    
    trackColorsRef.current.set(trackId, validColors)
    
    // Update the glass material if the track sphere already exists
    const trackData = trackPointsRef.current.get(trackId)
    if (trackData && trackData.glassMaterial) {
      trackData.glassMaterial.uniforms.dominantColor.value.copy(dominant)
      trackData.glassMaterial.uniforms.darkerColor.value.copy(darker)
      trackData.glassMaterial.uniforms.lighterColor.value.copy(lighter)
    }
  }, [ensureVisibleColor])

  // Store callbacks in refs so they can be updated without recreating the scene
  const onOrbitClickRef = useRef(onOrbitClick)
  const onTrackClickRef = useRef(onTrackClick)
  const onNucleusClickRef = useRef(onNucleusClick)

  // Keep callback refs up to date
  useEffect(() => {
    onOrbitClickRef.current = onOrbitClick
  }, [onOrbitClick])

  useEffect(() => {
    onTrackClickRef.current = onTrackClick
  }, [onTrackClick])

  useEffect(() => {
    onNucleusClickRef.current = onNucleusClick
  }, [onNucleusClick])

  // Sort tracks by added_at (newest first)
  const sortedTracks = useMemo(() => {
    return [...tracks].sort((a, b) =>
      new Date(b.added_at).getTime() - new Date(a.added_at).getTime()
    )
  }, [tracks])

  // Distribute tracks across orbits (newest = inner, oldest = outer)
  const tracksByOrbit = useMemo(() => {
    const numOrbits = ORBIT_RADII.length
    const orbits: Track[][] = Array(numOrbits).fill(null).map(() => [])
    const tracksPerOrbit = Math.ceil(sortedTracks.length / numOrbits)

    sortedTracks.forEach((track, index) => {
      const orbitIndex = Math.min(Math.floor(index / Math.max(tracksPerOrbit, 1)), numOrbits - 1)
      orbits[orbitIndex].push(track)
    })

    return orbits
  }, [sortedTracks])

  // Store tracksByOrbit in ref for click handler
  const tracksByOrbitRef = useRef(tracksByOrbit)
  useEffect(() => {
    tracksByOrbitRef.current = tracksByOrbit
  }, [tracksByOrbit])

  // Create 3D diffraction spike nucleus:
  // Bright core sphere + thin cone spikes radiating in all directions
  // Rendered in grayscale so the post-processing dithering pass creates the stippled look
  const createNucleus = useCallback(() => {
    const group = new THREE.Group()

    // === CORE: bright glowing sphere with faded edges and noise displacement ===
    const coreGeo = new THREE.SphereGeometry(0.1, 32, 32)
    const coreMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0.0 },
        uAudioPulse: { value: 0.0 },
      },
      vertexShader: `
        uniform float uTime;
        uniform float uAudioPulse;
        varying vec3 vNormal;
        varying vec3 vViewDir;
        varying float vDisplacement;

        // Simplex noise for vertex displacement
        vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
        vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

        float snoise(vec3 v) {
          const vec2 C = vec2(1.0/6.0, 1.0/3.0);
          const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
          vec3 i  = floor(v + dot(v, C.yyy));
          vec3 x0 = v - i + dot(i, C.xxx);
          vec3 g = step(x0.yzx, x0.xyz);
          vec3 l = 1.0 - g;
          vec3 i1 = min(g.xyz, l.zxy);
          vec3 i2 = max(g.xyz, l.zxy);
          vec3 x1 = x0 - i1 + C.xxx;
          vec3 x2 = x0 - i2 + C.yyy;
          vec3 x3 = x0 - D.yyy;
          i = mod289(i);
          vec4 p = permute(permute(permute(
                    i.z + vec4(0.0, i1.z, i2.z, 1.0))
                  + i.y + vec4(0.0, i1.y, i2.y, 1.0))
                  + i.x + vec4(0.0, i1.x, i2.x, 1.0));
          float n_ = 0.142857142857;
          vec3 ns = n_ * D.wyz - D.xzx;
          vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
          vec4 x_ = floor(j * ns.z);
          vec4 y_ = floor(j - 7.0 * x_);
          vec4 x = x_ *ns.x + ns.yyyy;
          vec4 y = y_ *ns.x + ns.yyyy;
          vec4 h = 1.0 - abs(x) - abs(y);
          vec4 b0 = vec4(x.xy, y.xy);
          vec4 b1 = vec4(x.zw, y.zw);
          vec4 s0 = floor(b0)*2.0 + 1.0;
          vec4 s1 = floor(b1)*2.0 + 1.0;
          vec4 sh = -step(h, vec4(0.0));
          vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
          vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
          vec3 p0 = vec3(a0.xy, h.x);
          vec3 p1 = vec3(a0.zw, h.y);
          vec3 p2 = vec3(a1.xy, h.z);
          vec3 p3 = vec3(a1.zw, h.w);
          vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
          p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
          vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
          m = m * m;
          return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
        }

        void main() {
          vec3 pos = position;
          vec3 norm = normalize(normal);

          // Noise displacement along normal (rippling peaks)
          float t = uTime * 0.8;
          float n1 = snoise(pos * 5.0 + vec3(t, 0.0, t * 0.3)) * 0.02;
          float n2 = snoise(pos * 10.0 + vec3(0.0, t * 1.2, t * 0.5)) * 0.012;
          float disp = (n1 + n2) * (1.0 + uAudioPulse * 1.5);
          pos += norm * disp;

          vDisplacement = disp;
          vNormal = normalize(normalMatrix * norm);
          vec4 mv = modelViewMatrix * vec4(pos, 1.0);
          vViewDir = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform float uAudioPulse;
        varying vec3 vNormal;
        varying vec3 vViewDir;
        varying float vDisplacement;
        void main() {
          float facing = abs(dot(vViewDir, vNormal));
          float edge = 1.0 - facing;

          // Soft faded edges
          float edgeFade = smoothstep(0.95, 0.4, edge);

          float fresnel = pow(edge, 2.0);
          float b = 0.9 + fresnel * 0.1 + uAudioPulse * 0.1;

          // Brighten peaks slightly
          b += vDisplacement * 3.0;

          float alpha = edgeFade;
          gl_FragColor = vec4(vec3(b), alpha);
        }
      `,
      transparent: true,
      depthWrite: true,
    })
    const core = new THREE.Mesh(coreGeo, coreMat)
    core.userData.isCore = true
    group.add(core)

    // === INNER GLOW: slightly larger transparent sphere with soft edges ===
    const glowGeo = new THREE.SphereGeometry(0.16, 20, 20)
    const glowMat = new THREE.ShaderMaterial({
      uniforms: {
        uAudioPulse: { value: 0.0 },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vViewDir;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vViewDir = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform float uAudioPulse;
        varying vec3 vNormal;
        varying vec3 vViewDir;
        void main() {
          float facing = abs(dot(vViewDir, vNormal));
          float rim = 1.0 - facing;

          // Fade out towards the edges so no hard silhouette
          float edgeFade = smoothstep(1.0, 0.25, rim);

          float glow = pow(rim, 1.5) * (0.5 + uAudioPulse * 0.2);
          float alpha = glow * edgeFade;
          gl_FragColor = vec4(vec3(glow), alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const glowSphere = new THREE.Mesh(glowGeo, glowMat)
    glowSphere.userData.isGlow = true
    group.add(glowSphere)

    // === SPIKES: thin cones radiating outward in chaotic directions ===
    // Shared spike material: brightness fades from base (bright) to tip (dim)
    // so the dithering pass creates the stippled gradient naturally
    const spikeMat = new THREE.ShaderMaterial({
      uniforms: {
        uAudioPulse: { value: 0.0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uAudioPulse;
        varying vec2 vUv;
        void main() {
          // vUv.y goes 0 (base) to 1 (tip) on a ConeGeometry
          float fade = 1.0 - vUv.y;
          // More gradual brightness falloff for enhanced dithering effect
          float brightness = pow(fade, 1.2) * (0.7 + uAudioPulse * 0.2);
          gl_FragColor = vec4(vec3(brightness), 1.0);
        }
      `,
      depthWrite: true,
      side: THREE.DoubleSide,
    })

    // Pseudo-random helper
    const hash = (n: number) => {
      const s = Math.sin(n) * 43758.5453123
      return s - Math.floor(s)
    }

    // Create 3 rotating spike layers for dynamic effect
    const spikeLayer1 = new THREE.Group()
    const spikeLayer2 = new THREE.Group()
    const spikeLayer3 = new THREE.Group()
    spikeLayer1.userData.isSpikeLayer = true
    spikeLayer1.userData.rotationSpeed = 0.08
    spikeLayer2.userData.isSpikeLayer = true
    spikeLayer2.userData.rotationSpeed = -0.05
    spikeLayer3.userData.isSpikeLayer = true
    spikeLayer3.userData.rotationSpeed = 0.12
    group.add(spikeLayer1, spikeLayer2, spikeLayer3)

    // Layer 1: 8 primary spikes - uniform length with minimal variation
    for (let i = 0; i < 8; i++) {
      const az = (i / 8) * Math.PI * 2 + hash(i * 7.3) * 0.3
      const el = (hash(i * 11.1) - 0.5) * Math.PI * 0.6
      const len = 0.18 + hash(i * 7.3) * 0.03  // Shorter
      const thickness = 0.018 + hash(i * 3.1) * 0.004  // Wider

      const geo = new THREE.ConeGeometry(thickness, len, 4, 1, true)
      geo.translate(0, len / 2, 0)
      const spike = new THREE.Mesh(geo, spikeMat)

      const dir = new THREE.Vector3(
        Math.cos(az) * Math.cos(el),
        Math.sin(el),
        Math.sin(az) * Math.cos(el)
      ).normalize()
      spike.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
      spike.position.copy(dir.multiplyScalar(0.08))
      spike.userData.isSpike = true
      spike.userData.baseLen = len
      spikeLayer1.add(spike)

      // Add curved base sphere
      const baseGeo = new THREE.SphereGeometry(thickness * 1.3, 6, 6)
      const baseSphere = new THREE.Mesh(baseGeo, spikeMat)
      baseSphere.position.copy(spike.position)
      baseSphere.userData.isSpike = true
      spikeLayer1.add(baseSphere)
    }

    // Layer 2: 12 secondary spikes - uniform length
    for (let i = 0; i < 12; i++) {
      const az = (i / 12) * Math.PI * 2 + hash(i * 13.7) * 0.4
      const el = (hash(i * 29.3) - 0.5) * Math.PI * 0.7
      const len = 0.14 + hash(i * 19.1) * 0.03  // Shorter
      const thickness = 0.014 + hash(i * 11.3) * 0.003  // Wider

      const geo = new THREE.ConeGeometry(thickness, len, 3, 1, true)
      geo.translate(0, len / 2, 0)
      const spike = new THREE.Mesh(geo, spikeMat)

      const dir = new THREE.Vector3(
        Math.cos(az) * Math.cos(el),
        Math.sin(el),
        Math.sin(az) * Math.cos(el)
      ).normalize()
      spike.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
      spike.position.copy(dir.multiplyScalar(0.07))
      spike.userData.isSpike = true
      spike.userData.baseLen = len
      spikeLayer2.add(spike)

      // Add curved base sphere
      const baseGeo = new THREE.SphereGeometry(thickness * 1.3, 5, 5)
      const baseSphere = new THREE.Mesh(baseGeo, spikeMat)
      baseSphere.position.copy(spike.position)
      baseSphere.userData.isSpike = true
      spikeLayer2.add(baseSphere)
    }

    // Layer 3: 16 tertiary spikes - uniform length, thinnest
    for (let i = 0; i < 16; i++) {
      const az = (i / 16) * Math.PI * 2 + hash(i * 31.3) * 0.5
      const el = (hash(i * 47.9) - 0.5) * Math.PI * 0.75
      const len = 0.11 + hash(i * 53.1) * 0.02  // Shorter
      const thickness = 0.010 + hash(i * 67.7) * 0.003  // Wider

      const geo = new THREE.ConeGeometry(thickness, len, 3, 1, true)
      geo.translate(0, len / 2, 0)
      const spike = new THREE.Mesh(geo, spikeMat)

      const dir = new THREE.Vector3(
        Math.cos(az) * Math.cos(el),
        Math.sin(el),
        Math.sin(az) * Math.cos(el)
      ).normalize()
      spike.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
      spike.position.copy(dir.multiplyScalar(0.06))
      spike.userData.isSpike = true
      spike.userData.baseLen = len
      spikeLayer3.add(spike)

      // Add curved base sphere
      const baseGeo = new THREE.SphereGeometry(thickness * 1.3, 5, 5)
      const baseSphere = new THREE.Mesh(baseGeo, spikeMat)
      baseSphere.position.copy(spike.position)
      baseSphere.userData.isSpike = true
      spikeLayer3.add(baseSphere)
    }

    // === DYNAMIC DOT MESH SURFACE: Fishing net sphere with noise distortion ===
    const dotCount = 2400  // More dots for tighter mesh
    const dotPositions = new Float32Array(dotCount * 3)
    const dotOriginalPositions = new Float32Array(dotCount * 3)

    // Create dots in a tight spherical grid (fishing net pattern)
    const netRadius = 0.18  // Tightly wraps the nucleus core

    for (let i = 0; i < dotCount; i++) {
      const i3 = i * 3

      // Fibonacci sphere distribution for even point spacing (net-like)
      const phi = Math.acos(1 - 2 * (i + 0.5) / dotCount)
      const theta = Math.PI * (1 + Math.sqrt(5)) * i

      dotPositions[i3] = Math.sin(phi) * Math.cos(theta) * netRadius
      dotPositions[i3 + 1] = Math.sin(phi) * Math.sin(theta) * netRadius
      dotPositions[i3 + 2] = Math.cos(phi) * netRadius

      // Store original positions for noise calculation
      dotOriginalPositions[i3] = dotPositions[i3]
      dotOriginalPositions[i3 + 1] = dotPositions[i3 + 1]
      dotOriginalPositions[i3 + 2] = dotPositions[i3 + 2]
    }

    const dotGeometry = new THREE.BufferGeometry()
    dotGeometry.setAttribute('position', new THREE.BufferAttribute(dotPositions, 3))
    dotGeometry.setAttribute('originalPosition', new THREE.BufferAttribute(dotOriginalPositions, 3))

    const dotMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0.0 },
        uAudioPulse: { value: 0.0 },
      },
      vertexShader: `
        uniform float uTime;
        uniform float uAudioPulse;
        attribute vec3 originalPosition;
        varying float vBrightness;

        // 3D Simplex-like noise function
        vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
        vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

        float snoise(vec3 v) {
          const vec2 C = vec2(1.0/6.0, 1.0/3.0);
          const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

          vec3 i  = floor(v + dot(v, C.yyy));
          vec3 x0 = v - i + dot(i, C.xxx);

          vec3 g = step(x0.yzx, x0.xyz);
          vec3 l = 1.0 - g;
          vec3 i1 = min(g.xyz, l.zxy);
          vec3 i2 = max(g.xyz, l.zxy);

          vec3 x1 = x0 - i1 + C.xxx;
          vec3 x2 = x0 - i2 + C.yyy;
          vec3 x3 = x0 - D.yyy;

          i = mod289(i);
          vec4 p = permute(permute(permute(
                    i.z + vec4(0.0, i1.z, i2.z, 1.0))
                  + i.y + vec4(0.0, i1.y, i2.y, 1.0))
                  + i.x + vec4(0.0, i1.x, i2.x, 1.0));

          float n_ = 0.142857142857;
          vec3 ns = n_ * D.wyz - D.xzx;

          vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

          vec4 x_ = floor(j * ns.z);
          vec4 y_ = floor(j - 7.0 * x_);

          vec4 x = x_ *ns.x + ns.yyyy;
          vec4 y = y_ *ns.x + ns.yyyy;
          vec4 h = 1.0 - abs(x) - abs(y);

          vec4 b0 = vec4(x.xy, y.xy);
          vec4 b1 = vec4(x.zw, y.zw);

          vec4 s0 = floor(b0)*2.0 + 1.0;
          vec4 s1 = floor(b1)*2.0 + 1.0;
          vec4 sh = -step(h, vec4(0.0));

          vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
          vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;

          vec3 p0 = vec3(a0.xy, h.x);
          vec3 p1 = vec3(a0.zw, h.y);
          vec3 p2 = vec3(a1.xy, h.z);
          vec3 p3 = vec3(a1.zw, h.w);

          vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
          p0 *= norm.x;
          p1 *= norm.y;
          p2 *= norm.z;
          p3 *= norm.w;

          vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
          m = m * m;
          return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
        }

        void main() {
          vec3 pos = originalPosition;

          // Multi-octave noise for rippling distortion (slow, organic)
          float noiseScale = 5.0;
          float timeScale = uTime * 0.35;

          float noise1 = snoise(pos * noiseScale + vec3(timeScale, 0.0, timeScale * 0.3)) * 0.04;
          float noise2 = snoise(pos * noiseScale * 2.0 + vec3(0.0, timeScale * 1.3, timeScale * 0.5)) * 0.025;
          float noise3 = snoise(pos * noiseScale * 3.5 + vec3(timeScale * 0.6, timeScale * 0.3, 0.0)) * 0.015;

          float noiseAmount = noise1 + noise2 + noise3;
          float pulseMultiplier = 1.0 + uAudioPulse * 1.5;

          // Distort along the normal direction (expand/contract) - stronger ripple
          vec3 normal = normalize(pos);
          pos += normal * noiseAmount * pulseMultiplier;

          // Vary brightness based on noise displacement
          vBrightness = 0.5 + noiseAmount * pulseMultiplier * 8.0;

          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = 1.8 * (1.0 + uAudioPulse * 0.4);
        }
      `,
      fragmentShader: `
        varying float vBrightness;

        void main() {
          // Circular point shape
          vec2 center = gl_PointCoord - 0.5;
          float dist = length(center);
          if (dist > 0.5) discard;

          // Soft edges for net-like appearance
          float alpha = 1.0 - smoothstep(0.2, 0.5, dist);
          float brightness = clamp(vBrightness, 0.35, 0.85);

          gl_FragColor = vec4(vec3(brightness), alpha * 0.6);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })

    const dotMesh = new THREE.Points(dotGeometry, dotMaterial)
    dotMesh.userData.isDotMesh = true
    group.add(dotMesh)

    return group
  }, [])

  // Create orbital ring as points inside a tilted group
  const createOrbitGroup = useCallback((radius: number, orbitIndex: number, pointCount: number = 200) => {
    const group = new THREE.Group()

    // Apply tilt to the group
    const tilt = ORBIT_TILTS[orbitIndex] || { x: 0, z: 0 }
    group.rotation.x = tilt.x
    group.rotation.z = tilt.z

    // Create the ring points
    const positions = new Float32Array(pointCount * 3)

    for (let i = 0; i < pointCount; i++) {
      const i3 = i * 3
      const angle = (i / pointCount) * Math.PI * 2
      positions[i3] = Math.cos(angle) * radius
      positions[i3 + 1] = 0
      positions[i3 + 2] = Math.sin(angle) * radius
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

    const material = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.008,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.3,
    })

    const ring = new THREE.Points(geometry, material)
    group.add(ring)

    return group
  }, [])

  // Glass sphere shader material with colored gradient
  const createGlassMaterial = useCallback(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        dominantColor: { value: new THREE.Color(1.0, 0.5, 0.5) },
        darkerColor: { value: new THREE.Color(0.5, 0.2, 0.2) },
        lighterColor: { value: new THREE.Color(1.0, 0.8, 0.8) },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        varying vec2 vUv;
        
        void main() {
          vUv = uv;
          vNormal = normalize(normalMatrix * normal);
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vViewPosition = -mvPosition.xyz;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 dominantColor;
        uniform vec3 darkerColor;
        uniform vec3 lighterColor;
        
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        varying vec2 vUv;
        
        void main() {
          vec3 viewDir = normalize(vViewPosition);
          float facing = abs(dot(viewDir, vNormal));
          float edge = 1.0 - facing;
          
          // Three-way gradient: darker at bottom -> dominant in middle -> lighter at top
          vec3 gradientColor;
          if (vUv.y < 0.5) {
            gradientColor = mix(darkerColor, dominantColor, vUv.y * 2.0);
          } else {
            gradientColor = mix(dominantColor, lighterColor, (vUv.y - 0.5) * 2.0);
          }
          
          // Very soft edges - gradual fade from center to rim
          float edgeFade = smoothstep(1.0, 0.3, edge);
          float alpha = 0.85 * edgeFade * edgeFade;
          
          gl_FragColor = vec4(gradientColor, alpha);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  }, [])

  // Album art shader with blur, rounded corners, and color
  const createAlbumArtMaterial = useCallback(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        map: { value: null },
        hasTexture: { value: 0.0 },
        blurAmount: { value: 0.012 },
        borderRadius: { value: 0.5 },
      },
      vertexShader: `
        varying vec2 vUv;
        
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D map;
        uniform float hasTexture;
        uniform float blurAmount;
        uniform float borderRadius;
        
        varying vec2 vUv;
        
        // Rounded rectangle SDF
        float roundedRect(vec2 p, vec2 size, float radius) {
          vec2 d = abs(p) - size + radius;
          return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)) - radius;
        }
        
        // Box blur with multiple samples
        vec4 blur(sampler2D tex, vec2 uv, float amount) {
          vec4 color = vec4(0.0);
          float total = 0.0;
          
          // 9-tap blur
          for (float x = -1.0; x <= 1.0; x += 1.0) {
            for (float y = -1.0; y <= 1.0; y += 1.0) {
              vec2 offset = vec2(x, y) * amount;
              color += texture2D(tex, uv + offset);
              total += 1.0;
            }
          }
          
          // Additional samples for smoother blur
          for (float x = -2.0; x <= 2.0; x += 2.0) {
            for (float y = -2.0; y <= 2.0; y += 2.0) {
              vec2 offset = vec2(x, y) * amount * 0.7;
              color += texture2D(tex, uv + offset) * 0.5;
              total += 0.5;
            }
          }
          
          return color / total;
        }
        
        void main() {
          // Calculate rounded rectangle mask with soft faded edges
          vec2 centeredUv = vUv - 0.5;
          float dist = roundedRect(centeredUv, vec2(0.5), borderRadius);
          
          // Soft fade from center to edge
          float edgeFade = 1.0 - smoothstep(-0.15, 0.0, dist);
          
          // Additional radial fade for softer look
          float radialDist = length(centeredUv) * 2.0;
          float radialFade = 1.0 - smoothstep(0.5, 1.0, radialDist);
          
          float alpha = edgeFade * radialFade;
          
          vec4 color;
          if (hasTexture > 0.5) {
            // Apply blur to texture
            color = blur(map, vUv, blurAmount);
          } else {
            // Fallback white
            color = vec4(1.0, 1.0, 1.0, 1.0);
          }
          
          // Output with faded edges and full color
          gl_FragColor = vec4(color.rgb, alpha * color.a);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
      depthTest: true,
    })
  }, [])

  // Create track sphere with glass effect and album art billboard
  const createTrackSphere = useCallback((radius: number, angle: number, thumbnailUrl: string | null) => {
    const group = new THREE.Group()
    
    // Position the group on the orbit
    group.position.x = Math.cos(angle) * radius
    group.position.y = 0
    group.position.z = Math.sin(angle) * radius

    // Glass sphere (larger for more visible aura)
    const sphereGeometry = new THREE.SphereGeometry(0.18, 32, 32)
    const glassMaterial = createGlassMaterial()
    const glassSphere = new THREE.Mesh(sphereGeometry, glassMaterial)
    group.add(glassSphere)

    // Album art billboard (plane that always faces camera)
    const billboardGeometry = new THREE.PlaneGeometry(0.22, 0.22)
    const billboardMaterial = createAlbumArtMaterial()
    
    const billboard = new THREE.Mesh(billboardGeometry, billboardMaterial)
    group.add(billboard)

    // Load album art texture if available
    if (thumbnailUrl) {
      const textureLoader = new THREE.TextureLoader()
      textureLoader.crossOrigin = 'anonymous'
      textureLoader.load(
        thumbnailUrl,
        (texture) => {
          texture.minFilter = THREE.LinearMipmapLinearFilter
          texture.magFilter = THREE.LinearFilter
          texture.generateMipmaps = true
          billboardMaterial.uniforms.map.value = texture
          billboardMaterial.uniforms.hasTexture.value = 1.0
          billboardMaterial.needsUpdate = true
        },
        undefined,
        (error) => {
          console.warn('Failed to load album art:', error)
        }
      )
    }

    return { group, billboard, glassMaterial }
  }, [createGlassMaterial, createAlbumArtMaterial])

  // Initialize scene only once
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return

    const canvas = canvasRef.current
    const container = containerRef.current
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x000000)
    sceneRef.current = scene

    const sizes = {
      width: container.clientWidth,
      height: container.clientHeight,
    }

    // Camera
    const camera = new THREE.PerspectiveCamera(75, sizes.width / sizes.height, 0.1, 100)
    camera.position.set(2, 1.5, 2)
    scene.add(camera)
    cameraRef.current = camera

    // Controls
    const controls = new OrbitControls(camera, canvas)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controls.minDistance = 1
    controls.maxDistance = 15
    controls.minPolarAngle = 0
    controls.maxPolarAngle = Math.PI
    controlsRef.current = controls

    // Renderer
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    renderer.setSize(sizes.width, sizes.height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    rendererRef.current = renderer

    // Post-processing with fresh shader instance
    const composer = new EffectComposer(renderer)
    composerRef.current = composer

    const renderPass = new RenderPass(scene, camera)
    composer.addPass(renderPass)

    // Bloom pass
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(sizes.width, sizes.height),
      0.5,  // strength
      0.4,  // radius
      0.85  // threshold
    )
    composer.addPass(bloomPass)

    // Dithering pass - create fresh instance
    const ditheringShader = createDitheringShader()
    const ditheringPass = new ShaderPass(ditheringShader)
    ditheringPass.uniforms.resolution.value.set(sizes.width, sizes.height)
    composer.addPass(ditheringPass)

    // Create nucleus
    const nucleus = createNucleus()
    scene.add(nucleus)
    nucleusRef.current = nucleus

    // Create orbital groups (rings with tilts)
    const orbitGroups: THREE.Group[] = []
    ORBIT_RADII.forEach((radius, index) => {
      const group = createOrbitGroup(radius, index)
      scene.add(group)
      orbitGroups.push(group)
    })
    orbitGroupsRef.current = orbitGroups

    // Raycaster for interactions
    const raycaster = new THREE.Raycaster()
    raycaster.params.Points = { threshold: 0.25 } // Larger threshold for easier clicking on moving points
    const mouse = new THREE.Vector2()

    const onClick = (event: MouseEvent) => {
      const rect = container.getBoundingClientRect()
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

      raycaster.setFromCamera(mouse, camera)

      // Check track points first (intersect with the group's children - the glass spheres)
      const trackPointsArray = Array.from(trackPointsRef.current.values())
      const trackMeshes = trackPointsArray.flatMap(tp => tp.group.children.filter(c => c instanceof THREE.Mesh))
      const trackIntersects = raycaster.intersectObjects(trackMeshes)

      if (trackIntersects.length > 0) {
        const intersectedMesh = trackIntersects[0].object as THREE.Mesh
        const trackData = trackPointsArray.find(tp => tp.group.children.includes(intersectedMesh))
        if (trackData) {
          // Start following this track
          followedTrackIdRef.current = trackData.track.id
          if (onTrackClickRef.current) {
            onTrackClickRef.current(trackData.track)
          }
        }
        return
      }

      // Check nucleus center (core + glow + spikes)
      if (nucleusRef.current) {
        const nucleusMeshes: THREE.Object3D[] = []
        nucleusRef.current.traverse(child => {
          if (child instanceof THREE.Mesh) {
            nucleusMeshes.push(child)
          }
        })
        const nucleusIntersects = raycaster.intersectObjects(nucleusMeshes)
        if (nucleusIntersects.length > 0) {
          onNucleusClickRef.current?.()
          return
        }
      }

      // Check orbit rings (they're inside groups)
      const orbitRingMeshes = orbitGroups.map(g => g.children[0]).filter(Boolean)
      const orbitIntersects = raycaster.intersectObjects(orbitRingMeshes)
      if (orbitIntersects.length > 0) {
        const intersectedRing = orbitIntersects[0].object
        const orbitIndex = orbitRingMeshes.indexOf(intersectedRing)
        if (orbitIndex !== -1 && onOrbitClickRef.current) {
          onOrbitClickRef.current({
            orbitIndex: orbitIndex + 1,
            tracks: tracksByOrbitRef.current[orbitIndex] || [],
          })
        }
        return
      }

      // Clicked empty space - stop following and reset camera
      followedTrackIdRef.current = null
      
      // Smoothly reset camera to default view
      const resetCamera = () => {
        const targetPos = new THREE.Vector3(2, 1.5, 2)
        const targetLookAt = new THREE.Vector3(0, 0, 0)
        
        const animateReset = () => {
          const distToTarget = camera.position.distanceTo(targetPos)
          const distToLookAt = controls.target.distanceTo(targetLookAt)
          
          if (distToTarget > 0.01 || distToLookAt > 0.01) {
            camera.position.lerp(targetPos, 0.05)
            controls.target.lerp(targetLookAt, 0.05)
            requestAnimationFrame(animateReset)
          }
        }
        animateReset()
      }
      resetCamera()
      
      onOrbitClickRef.current?.(null)
    }

    canvas.addEventListener('click', onClick)

    // Handle resize
    const handleResize = () => {
      if (!container) return
      sizes.width = container.clientWidth
      sizes.height = container.clientHeight
      camera.aspect = sizes.width / sizes.height
      camera.updateProjectionMatrix()
      renderer.setSize(sizes.width, sizes.height)
      composer.setSize(sizes.width, sizes.height)
      ditheringPass.uniforms.resolution.value.set(sizes.width, sizes.height)
    }

    window.addEventListener('resize', handleResize)

    // Animation loop
    const clock = new THREE.Clock()

    const animate = () => {
      const elapsedTime = clock.getElapsedTime()

      // Animate nucleus: 3D diffraction spike core + spikes
      if (nucleusRef.current) {
        // Compute audio pulse from tempo and energy
        let targetPulse = 0
        if (isAudioPlayingRef.current) {
          const bps = audioTempoRef.current / 60.0
          const energy = audioEnergyRef.current
          const beat = Math.sin(elapsedTime * bps * Math.PI * 2)
          const halfBeat = Math.sin(elapsedTime * bps * Math.PI * 4) * 0.3
          targetPulse = (Math.pow(Math.max(beat, 0.0), 2.0) + Math.pow(Math.max(halfBeat, 0.0), 2.0) * 0.3) * energy
        }

        nucleusRef.current.children.forEach(child => {
          // Rotate spike layers independently for dynamic effect
          if (child instanceof THREE.Group && child.userData.isSpikeLayer) {
            const speed = child.userData.rotationSpeed || 0.1
            child.rotation.y = elapsedTime * speed
            child.rotation.x = Math.sin(elapsedTime * speed * 0.5) * 0.15
            child.rotation.z = Math.cos(elapsedTime * speed * 0.3) * 0.1

            // Update materials in spike layer
            child.children.forEach(spike => {
              if (!(spike instanceof THREE.Mesh)) return
              const mat = spike.material as THREE.ShaderMaterial

              if (mat.uniforms.uAudioPulse) {
                mat.uniforms.uAudioPulse.value += (targetPulse - mat.uniforms.uAudioPulse.value) * 0.2
              }

              // Scale spike lengths with pulse
              if (spike.userData.isSpike && spike.userData.baseLen) {
                const pulse = mat.uniforms.uAudioPulse?.value || 0
                const s = 1.0 + pulse * 0.6
                spike.scale.set(1, s, 1)
              }
            })
          }

          // Animate dot mesh surface (THREE.Points, not Mesh)
          if (child instanceof THREE.Points && child.userData.isDotMesh) {
            const dotMat = child.material as THREE.ShaderMaterial
            if (dotMat.uniforms.uTime) {
              dotMat.uniforms.uTime.value = elapsedTime
            }
            if (dotMat.uniforms.uAudioPulse) {
              dotMat.uniforms.uAudioPulse.value += (targetPulse - dotMat.uniforms.uAudioPulse.value) * 0.2
            }
          }

          if (!(child instanceof THREE.Mesh)) return
          const mat = child.material as THREE.ShaderMaterial

          // Smoothly lerp audio pulse on all materials that have it
          if (mat.uniforms.uAudioPulse) {
            mat.uniforms.uAudioPulse.value += (targetPulse - mat.uniforms.uAudioPulse.value) * 0.2
          }
          if (mat.uniforms.uTime) {
            mat.uniforms.uTime.value = elapsedTime
          }

          // Scale core with pulse
          if (child.userData.isCore) {
            const s = 1.0 + mat.uniforms.uAudioPulse.value * 0.2
            child.scale.setScalar(s)
          }
        })
      }

      // Animate track points moving along their orbits
      let followedWorldPos: THREE.Vector3 | null = null
      
      trackPointsRef.current.forEach((trackData, trackId) => {
        const { group, billboard, orbitIndex, initialAngle } = trackData
        const radius = ORBIT_RADII[orbitIndex]
        const speed = TRACK_SPEEDS[orbitIndex] || 0.3

        // Calculate current angle - track moves along orbit
        const currentAngle = initialAngle + elapsedTime * speed

        // Update position along the circular orbit (in local space of tilted group)
        group.position.x = Math.cos(currentAngle) * radius
        group.position.y = Math.sin(elapsedTime * 0.8 + trackId * 0.5) * 0.02 // Subtle vertical bob
        group.position.z = Math.sin(currentAngle) * radius

        // Make billboard always face the camera
        const worldPos = new THREE.Vector3()
        group.getWorldPosition(worldPos)
        billboard.lookAt(camera.position)

        // If this is the followed track, get its world position
        if (trackId === followedTrackIdRef.current) {
          followedWorldPos = worldPos.clone()
        }
      })

      // Camera follow logic
      if (followedWorldPos) {
        // Position camera beyond the track, looking back towards nucleus
        // This keeps both the track and nucleus in view
        const nucleusCenter = new THREE.Vector3(0, 0, 0)
        const directionFromNucleus = followedWorldPos.clone().sub(nucleusCenter).normalize()
        
        // Place camera beyond the track, along the direction from nucleus
        const cameraDistance = 0.8
        const desiredCameraPos = followedWorldPos.clone().add(
          directionFromNucleus.multiplyScalar(cameraDistance)
        )
        // Add slight elevation
        desiredCameraPos.y += 0.3
        
        camera.position.lerp(desiredCameraPos, 0.03)
        
        // Look at a point between the track and nucleus to keep both in view
        const lookAtTarget = followedWorldPos.clone().lerp(nucleusCenter, 0.3)
        controls.target.lerp(lookAtTarget, 0.05)
      }

      controls.update()
      composer.render()
      animationIdRef.current = requestAnimationFrame(animate)
    }

    animate()

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize)
      canvas.removeEventListener('click', onClick)

      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current)
      }

      // Dispose nucleus group (billboard mesh)
      if (nucleusRef.current) {
        nucleusRef.current.children.forEach(child => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose()
            ;(child.material as THREE.Material).dispose()
          }
        })
        scene.remove(nucleusRef.current)
        nucleusRef.current = null
      }

      // Dispose track points first (remove from groups before disposing groups)
      trackPointsRef.current.forEach(({ group: trackGroup, orbitIndex }) => {
        const orbitGroup = orbitGroupsRef.current[orbitIndex]
        if (orbitGroup) {
          orbitGroup.remove(trackGroup)
        }
        trackGroup.children.forEach(child => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose()
            if (child.material instanceof THREE.Material) {
              child.material.dispose()
            }
          }
        })
      })
      trackPointsRef.current.clear()

      // Dispose orbit groups (now only contain the rings)
      orbitGroupsRef.current.forEach(group => {
        group.children.forEach(child => {
          if (child instanceof THREE.Points) {
            child.geometry.dispose()
            ;(child.material as THREE.Material).dispose()
          }
        })
        scene.remove(group)
      })
      orbitGroupsRef.current = []

      renderer.dispose()
      composer.dispose()
      controls.dispose()

      sceneRef.current = null
      cameraRef.current = null
      controlsRef.current = null
      composerRef.current = null
      rendererRef.current = null
    }
  }, [createNucleus, createOrbitGroup, createGlassMaterial]) // Only depends on stable callbacks

  // Update track points when tracks change - without recreating the scene
  useEffect(() => {
    const orbitGroups = orbitGroupsRef.current
    if (orbitGroups.length === 0) return

    // Clear existing track points from orbit groups
    trackPointsRef.current.forEach(({ group: trackGroup, orbitIndex }) => {
      trackGroup.children.forEach(child => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose()
          if (child.material instanceof THREE.Material) {
            child.material.dispose()
          }
        }
      })
      const orbitGroup = orbitGroups[orbitIndex]
      if (orbitGroup) {
        orbitGroup.remove(trackGroup)
      }
    })
    trackPointsRef.current.clear()

    // Create new track spheres with staggered initial angles
    tracksByOrbit.forEach((orbitTracks, orbitIndex) => {
      const radius = ORBIT_RADII[orbitIndex]
      const orbitGroup = orbitGroups[orbitIndex]
      if (!orbitGroup) return

      orbitTracks.forEach((track, trackIndex) => {
        // Distribute tracks evenly around the orbit with some randomness
        const baseAngle = (trackIndex / Math.max(orbitTracks.length, 1)) * Math.PI * 2
        const randomOffset = (Math.random() - 0.5) * 0.5 // Add some randomness
        const initialAngle = baseAngle + randomOffset

        const { group, billboard, glassMaterial } = createTrackSphere(radius, initialAngle, track.thumbnail_url)
        orbitGroup.add(group) // Add to orbit group so it inherits the tilt
        
        // Apply pre-extracted colors if available
        const existingColors = trackColorsRef.current.get(track.id)
        if (existingColors) {
          glassMaterial.uniforms.dominantColor.value.set(existingColors.dominant)
          glassMaterial.uniforms.darkerColor.value.set(existingColors.darker)
          glassMaterial.uniforms.lighterColor.value.set(existingColors.lighter)
        }
        
        trackPointsRef.current.set(track.id, { group, billboard, glassMaterial, track, orbitIndex, initialAngle })
      })
    })
  }, [tracksByOrbit, createTrackSphere])

  return (
    <div ref={containerRef} className="w-full h-full">
      <canvas ref={canvasRef} className="nucleus-canvas" />
      {/* Hidden color extractors for each track */}
      {tracks.map(track => track.thumbnail_url && (
        <TrackColorsExtractor
          key={track.id}
          track={track}
          onColorsExtracted={handleColorsExtracted}
        />
      ))}
    </div>
  )
})
