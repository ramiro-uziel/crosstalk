import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { useTracks, type TracksByEmotion } from "../hooks/useTracks";
import type { Track } from "../db/database";
import {
  isValidSpotifyUrl,
  extractSpotifyId,
} from "../services/gemini-spotify";
import { OrbitingSpinner } from "../components/OrbitingSpinner";
import "../styles/galaxy.css";

interface GalaxyParameters {
  count: number;
  size: number;
  radius: number;
  branches: number;
  spin: number;
  randomness: number;
  randomnessPower: number;
  insideColor: string;
  outsideColor: string;
}

interface Emotion {
  name: string;
  color: string;
  position: THREE.Vector3;
  songs: Track[]; // Changed from string[] to Track[]
}

export const Route = createFileRoute("/")({
  component: GalaxyPage,
});

function GalaxyPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const previousCameraState = useRef<{
    position: THREE.Vector3;
    target: THREE.Vector3;
  } | null>(null);
  const initialCameraState = useRef<{
    position: THREE.Vector3;
    target: THREE.Vector3;
  } | null>(null);
  const focusedEmotionRef = useRef<Emotion | null>(null);
  const emotionPositionsRef = useRef<Map<string, THREE.Vector3>>(new Map());
  const [showPanel, setShowPanel] = useState(false);
  const [selectedEmotion] = useState<Emotion | null>(null);
  const [focusedEmotion, setFocusedEmotion] = useState<Emotion | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // Track management
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  const spotifyClientId = import.meta.env.VITE_SPOTIFY_CLIENT_ID;
  const spotifyClientSecret = import.meta.env.VITE_SPOTIFY_CLIENT_SECRET;
  const {
    tracksByEmotion,
    error: trackError,
    addTrackFromSpotify,
    clearError,
  } = useTracks({ apiKey, spotifyClientId, spotifyClientSecret, autoLoad: true });

  // Add track UI state
  const [showAddTrack, setShowAddTrack] = useState(false);
  const [showTrackList, setShowTrackList] = useState(false);
  const [spotifyUrl, setSpotifyUrl] = useState("");

  // Background adding state
  const [backgroundAdding, setBackgroundAdding] = useState<{
    isAdding: boolean;
    url: string;
    trackId: string | null;
  }>({ isAdding: false, url: "", trackId: null });

  // Success modal state
  const [successModal, setSuccessModal] = useState<{
    show: boolean;
    track: Track | null;
  }>({ show: false, track: null });

  // Spotify player state
  const [currentTrack, setCurrentTrack] = useState<{
    trackId: string;
    title: string;
    isPlaying: boolean;
    emotion?: string;
  } | null>(null);
  const currentTrackRef = useRef<typeof currentTrack>(null); // Ref to track current track for async operations
  const playerContainerRef = useRef<HTMLDivElement>(null); // Ref for Spotify player container

  // Keep ref in sync with state
  useEffect(() => {
    currentTrackRef.current = currentTrack;
  }, [currentTrack]);

  // Separate state for temporary parameter changes (for sliders)
  const [tempParameters, setTempParameters] = useState<GalaxyParameters>({
    count: 324900,
    size: 0.001,
    radius: 3.47,
    branches: 8, // Matches the 8 emotion stars
    spin: 1.117,
    randomness: 0.6,
    randomnessPower: 3.922,
    insideColor: "#030303",
    outsideColor: "#1B1D2D",
  });

  // Debounced parameters that trigger galaxy regeneration
  const [parameters, setParameters] =
    useState<GalaxyParameters>(tempParameters);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Store tracks in a ref to avoid triggering scene regeneration on track changes
  const tracksByEmotionRef = useRef<TracksByEmotion>(tracksByEmotion);
  const orbitingSongsRef = useRef<
    Array<{
      mesh: THREE.Group;
      emotion: Emotion;
      initialAngle: number;
      speed: number;
      radius: number;
      trackId: number;
    }>
  >([]);
  const sceneRef = useRef<THREE.Scene | null>(null);

  // Update ref when tracks change (but don't trigger scene regen)
  useEffect(() => {
    tracksByEmotionRef.current = tracksByEmotion;
  }, [tracksByEmotion]);

  // Debug: Log tracks by emotion
  useEffect(() => {
    console.log("Tracks by emotion:", tracksByEmotion);
    Object.keys(tracksByEmotion).forEach((emotion) => {
      console.log(`${emotion}: ${tracksByEmotion[emotion].length} tracks`);
    });
  }, [tracksByEmotion]);

  const emotions: Emotion[] = [
    {
      name: "Joy",
      color: "#FFD700",
      position: new THREE.Vector3(0, 0, 0),
      songs: tracksByEmotion["joy"] || [],
    },
    {
      name: "Sadness",
      color: "#4169E1",
      position: new THREE.Vector3(0, 0, 0),
      songs: tracksByEmotion["sadness"] || [],
    },
    {
      name: "Anger",
      color: "#DC143C",
      position: new THREE.Vector3(0, 0, 0),
      songs: tracksByEmotion["anger"] || [],
    },
    {
      name: "Fear",
      color: "#800080",
      position: new THREE.Vector3(0, 0, 0),
      songs: tracksByEmotion["fear"] || [],
    },
    {
      name: "Love",
      color: "#FF69B4",
      position: new THREE.Vector3(0, 0, 0),
      songs: tracksByEmotion["love"] || [],
    },
    {
      name: "Surprise",
      color: "#FF8C00",
      position: new THREE.Vector3(0, 0, 0),
      songs: tracksByEmotion["surprise"] || [],
    },
    {
      name: "Calm",
      color: "#00CED1",
      position: new THREE.Vector3(0, 0, 0),
      songs: tracksByEmotion["calm"] || [],
    },
    {
      name: "Nostalgia",
      color: "#DDA0DD",
      position: new THREE.Vector3(0, 0, 0),
      songs: tracksByEmotion["nostalgia"] || [],
    },
  ];

  // Update Spotify iframe when track changes
  useEffect(() => {
    if (!currentTrack || !playerContainerRef.current) return;

    const container = playerContainerRef.current;
    const trackId = currentTrack.trackId;

    // Create Spotify Embed iframe
    container.innerHTML = `
      <iframe
        src="https://open.spotify.com/embed/track/${trackId}?utm_source=generator&autoplay=1"
        width="0"
        height="0"
        frameborder="0"
        allowfullscreen=""
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        loading="lazy"
        style="position: absolute; left: -9999px;"
      ></iframe>
    `;

    return () => {
      if (container) {
        container.innerHTML = "";
      }
    };
  }, [currentTrack?.trackId]);

  // Stop track
  const stopTrack = useCallback(() => {
    setCurrentTrack(null);
  }, []);

  // Play a specific track (without updating play count to avoid re-render)
  const handlePlayTrack = useCallback((track: Track, e?: React.MouseEvent) => {
    // Stop propagation to prevent camera reset
    if (e) {
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
    }

    const trackId = extractSpotifyId(track.spotify_url);
    if (trackId) {
      setCurrentTrack({
        trackId,
        title: track.title,
        isPlaying: true,
        emotion: track.emotion,
      });
      // Note: We intentionally don't call playTrack(track.id) here
      // because it updates tracksByEmotion state which triggers a full
      // scene re-render. Play count can be updated on track end instead.
    }
  }, []);

  // Handle adding track in background
  const handleAddTrack = async () => {
    if (!spotifyUrl || !isValidSpotifyUrl(spotifyUrl)) {
      return;
    }

    const trackId = extractSpotifyId(spotifyUrl);

    // Start background adding - close modal and show corner indicator
    setBackgroundAdding({ isAdding: true, url: spotifyUrl, trackId });
    setShowAddTrack(false);
    const urlToAdd = spotifyUrl;
    setSpotifyUrl("");

    // Start playing the track in background while analyzing
    if (trackId) {
      setCurrentTrack({
        trackId,
        title: "",
        isPlaying: true,
      });
    }

    // Add track in background
    const track = await addTrackFromSpotify(urlToAdd);

    // Stop background adding indicator
    setBackgroundAdding({ isAdding: false, url: "", trackId: null });

    if (track) {
      // Update track title and emotion if still playing
      // Use ref to avoid stale closure - currentTrack state may have changed during async operation
      if (currentTrackRef.current?.trackId === trackId) {
        setCurrentTrack((prev) =>
          prev ? { ...prev, title: track.title, emotion: track.emotion } : null
        );
      }
      // Show success modal
      setSuccessModal({ show: true, track });
    }
  };

  // Debounce tempParameters to parameters
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      setParameters(tempParameters);
    }, 300); // 300ms debounce

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [tempParameters]);

  // Update tooltip position when focused emotion changes or on animation frame
  useEffect(() => {
    if (!focusedEmotion || !cameraRef.current) return;

    let animationFrameId: number;

    const updateTooltip = () => {
      if (!focusedEmotion || !cameraRef.current) return;

      const camera = cameraRef.current;
      const vector = focusedEmotion.position.clone();
      vector.project(camera);

      // Convert to screen coordinates
      const centerX = (vector.x * 0.5 + 0.5) * window.innerWidth;
      const centerY = (-vector.y * 0.5 + 0.5) * window.innerHeight;

      // Offset the tooltip to the side to not obstruct the star
      // Position it to the right and slightly up
      const offsetX = 200; // pixels to the right
      const offsetY = -50; // pixels up

      setTooltipPosition({
        x: centerX + offsetX,
        y: centerY + offsetY,
      });

      animationFrameId = requestAnimationFrame(updateTooltip);
    };

    updateTooltip();

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [focusedEmotion]);

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const scene = new THREE.Scene();
    sceneRef.current = scene; // Store scene in ref for external access

    // Sizes
    const sizes = {
      width: window.innerWidth,
      height: window.innerHeight,
    };

    // Camera
    const camera = new THREE.PerspectiveCamera(
      75,
      sizes.width / sizes.height,
      0.5,
      100
    );
    camera.position.x = 3;
    camera.position.y = 3;
    camera.position.z = 3;
    scene.add(camera);
    cameraRef.current = camera;

    // Controls
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.minDistance = 1.5; // Prevent zooming in too close
    controls.maxDistance = 15; // Prevent zooming out too far
    controlsRef.current = controls;

    // Store initial camera state for reset
    initialCameraState.current = {
      position: camera.position.clone(),
      target: controls.target.clone(),
    };

    // Renderer
    const renderer = new THREE.WebGLRenderer({ canvas });
    renderer.setSize(sizes.width, sizes.height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Galaxy
    let geometry: THREE.BufferGeometry | null = null;
    let material: THREE.PointsMaterial | null = null;
    let points: THREE.Points | null = null;

    // Emotion stars and orbiting songs
    const emotionStars: THREE.Group[] = [];
    const clickableStarCores: THREE.Mesh[] = []; // Only the outer layer meshes for click detection
    const orbitingSongs: Array<{
      mesh: THREE.Group;
      emotion: Emotion;
      initialAngle: number;
      speed: number;
      radius: number;
      trackId: number;
    }> = [];

    // Store emotion star groups for dynamic song updates
    const emotionStarGroups: Map<
      string,
      { star: THREE.Group; position: THREE.Vector3; color: string }
    > = new Map();

    const generateGalaxy = () => {
      // Destroy old galaxy
      if (points !== null) {
        geometry?.dispose();
        material?.dispose();
        scene.remove(points);
      }

      // Clear old emotion stars and songs
      emotionStars.forEach((star) => scene.remove(star));
      emotionStars.length = 0;
      clickableStarCores.length = 0;
      orbitingSongs.forEach((song) => scene.remove(song.mesh));
      orbitingSongs.length = 0;

      // Geometry
      geometry = new THREE.BufferGeometry();

      const positions = new Float32Array(parameters.count * 3);
      const colors = new Float32Array(parameters.count * 3);

      const insideColor = new THREE.Color(parameters.insideColor);
      const outsideColor = new THREE.Color(parameters.outsideColor);

      // Pre-calculate emotion star positions for color blending
      const emotionPositions: Array<{
        x: number;
        z: number;
        color: THREE.Color;
        branchIndex: number;
      }> = [];
      emotions.forEach((emotion, index) => {
        const branchAngle = (index / parameters.branches) * Math.PI * 2;
        const emotionRadius = parameters.radius * 0.6;
        const spinAngle = emotionRadius * parameters.spin;

        const x = Math.cos(branchAngle + spinAngle) * emotionRadius;
        const z = Math.sin(branchAngle + spinAngle) * emotionRadius;

        emotionPositions.push({
          x,
          z,
          color: new THREE.Color(emotion.color),
          branchIndex: index,
        });
      });

      for (let i = 0; i < parameters.count; i++) {
        const i3 = i * 3;

        // Position
        const radius = Math.random() * parameters.radius;
        const spinAngle = radius * parameters.spin;
        const branchAngle =
          ((i % parameters.branches) / parameters.branches) * Math.PI * 2;

        const randomX =
          Math.pow(Math.random(), parameters.randomnessPower) *
          parameters.randomness *
          (Math.random() < 0.5 ? 1 : -1) *
          parameters.randomness *
          radius;
        const randomY =
          Math.pow(Math.random(), parameters.randomnessPower) *
          parameters.randomness *
          (Math.random() < 0.5 ? 1 : -1) *
          parameters.randomness *
          radius;
        const randomZ =
          Math.pow(Math.random(), parameters.randomnessPower) *
          parameters.randomness *
          (Math.random() < 0.5 ? 1 : -1) *
          parameters.randomness *
          radius;

        const px = Math.cos(branchAngle + spinAngle) * radius + randomX;
        const py = randomY;
        const pz = Math.sin(branchAngle + spinAngle) * radius + randomZ;

        positions[i3] = px;
        positions[i3 + 1] = py;
        positions[i3 + 2] = pz;

        // Color - base galaxy gradient
        const mixedColor = insideColor.clone();
        mixedColor.lerp(outsideColor, radius / parameters.radius);

        // Blend with emotion star colors if nearby
        const currentBranchIndex = i % parameters.branches;
        emotionPositions.forEach((emotionPos) => {
          // Only affect particles on the same branch
          if (emotionPos.branchIndex === currentBranchIndex) {
            const dx = px - emotionPos.x;
            const dz = pz - emotionPos.z;
            const distance = Math.sqrt(dx * dx + py * py + dz * dz);

            // Influence radius around the star
            const influenceRadius = 1.2;
            if (distance < influenceRadius) {
              const influence = 1 - distance / influenceRadius;
              const emotionInfluence = Math.pow(influence, 2) * 0.7; // Stronger near center
              mixedColor.lerp(emotionPos.color, emotionInfluence);
            }
          }
        });

        colors[i3] = mixedColor.r;
        colors[i3 + 1] = mixedColor.g;
        colors[i3 + 2] = mixedColor.b;
      }

      geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(positions, 3)
      );
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

      // Material
      material = new THREE.PointsMaterial({
        size: parameters.size,
        sizeAttenuation: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexColors: true,
      });

      // Points
      points = new THREE.Points(geometry, material);
      scene.add(points);

      // Add emotion stars evenly distributed in a circle
      emotions.forEach((emotion, index) => {
        // Always distribute based on number of emotions, not branches
        const branchAngle = (index / emotions.length) * Math.PI * 2;
        const emotionRadius = parameters.radius * 0.6; // Place emotions at 60% of galaxy radius
        const spinAngle = emotionRadius * parameters.spin;

        const x = Math.cos(branchAngle + spinAngle) * emotionRadius;
        const z = Math.sin(branchAngle + spinAngle) * emotionRadius;

        emotion.position.set(x, 0, z);

        // Store position in ref for external access
        emotionPositionsRef.current.set(
          emotion.name.toLowerCase(),
          new THREE.Vector3(x, 0, z)
        );

        // Create emotion star with smooth gradient layers
        const star = new THREE.Group();
        star.position.copy(emotion.position);

        // Create multiple layers for smooth gradient - FIXED z-fighting
        const layerCount = 5; // Reduced from 12 to minimize z-fighting
        const minRadius = 0.04;
        const maxRadius = 0.22;
        const whiteColor = new THREE.Color("#ffffff");
        const emotionColorObj = new THREE.Color(emotion.color);

        let outer: THREE.Mesh | null = null;

        for (let i = 0; i < layerCount; i++) {
          const t = i / (layerCount - 1); // 0 to 1
          const radius = minRadius + (maxRadius - minRadius) * t;

          // Smooth color interpolation from white to emotion color
          const layerColor = whiteColor.clone().lerp(emotionColorObj, t);

          // Smooth opacity falloff (higher in center, lower at edges)
          const opacity = 0.9 - t * 0.5;

          const layerGeometry = new THREE.SphereGeometry(radius, 32, 32);
          const layerMaterial = new THREE.MeshBasicMaterial({
            color: layerColor,
            transparent: true,
            opacity: opacity,
            depthWrite: false, // Prevent z-fighting
            depthTest: true,
          });
          const layer = new THREE.Mesh(layerGeometry, layerMaterial);
          layer.renderOrder = i; // Explicit render order
          star.add(layer);

          // Store the outermost layer for click detection
          if (i === layerCount - 1) {
            outer = layer;
          }
        }

        // Add soft glow effect
        const glowGeometry = new THREE.SphereGeometry(0.28, 32, 32);
        const glowMaterial = new THREE.MeshBasicMaterial({
          color: emotion.color,
          transparent: true,
          opacity: 0.2,
          depthWrite: false, // Prevent z-fighting
          depthTest: true,
        });
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        glow.renderOrder = layerCount; // Render after all layers
        star.add(glow);

        // Add noisy particle cloud around star
        const particleCount = 400;
        const particlePositions = new Float32Array(particleCount * 3);
        const particleColors = new Float32Array(particleCount * 3);
        const innerColor = new THREE.Color(emotion.color).lerp(
          new THREE.Color("#ffffff"),
          0.5
        ); // Lighter emotion color
        const outerColor = new THREE.Color(emotion.color);

        for (let i = 0; i < particleCount; i++) {
          const i3 = i * 3;

          // Create particles in a hollow sphere around the star (avoiding center)
          const minRadius = 0.3; // Start outside the main sphere and glow
          const maxRadius = 0.55;
          const radius = minRadius + Math.random() * (maxRadius - minRadius);
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.acos(2 * Math.random() - 1);

          particlePositions[i3] = radius * Math.sin(phi) * Math.cos(theta);
          particlePositions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
          particlePositions[i3 + 2] = radius * Math.cos(phi);

          // Create gradient from center (white) to edge (emotion color)
          const normalizedRadius =
            (radius - minRadius) / (maxRadius - minRadius);
          const gradientColor = innerColor.clone();
          gradientColor.lerp(outerColor, normalizedRadius);

          // Add slight random variation
          const colorVariation = 0.9 + Math.random() * 0.1;
          particleColors[i3] = gradientColor.r * colorVariation;
          particleColors[i3 + 1] = gradientColor.g * colorVariation;
          particleColors[i3 + 2] = gradientColor.b * colorVariation;
        }

        const particleGeometry = new THREE.BufferGeometry();
        particleGeometry.setAttribute(
          "position",
          new THREE.BufferAttribute(particlePositions, 3)
        );
        particleGeometry.setAttribute(
          "color",
          new THREE.BufferAttribute(particleColors, 3)
        );

        // Create soft circular gradient texture for blurry particles
        const particleCanvas = document.createElement("canvas");
        particleCanvas.width = 64;
        particleCanvas.height = 64;
        const ctx = particleCanvas.getContext("2d");
        if (ctx) {
          const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
          gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
          gradient.addColorStop(0.2, "rgba(255, 255, 255, 0.8)");
          gradient.addColorStop(0.5, "rgba(255, 255, 255, 0.3)");
          gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
          ctx.fillStyle = gradient;
          ctx.fillRect(0, 0, 64, 64);
        }
        const particleTexture = new THREE.CanvasTexture(particleCanvas);

        const particleMaterial = new THREE.PointsMaterial({
          size: 0.025,
          sizeAttenuation: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          vertexColors: true,
          transparent: true,
          opacity: 0.4,
          map: particleTexture,
        });

        const particleCloud = new THREE.Points(
          particleGeometry,
          particleMaterial
        );
        star.add(particleCloud);

        scene.add(star);
        emotionStars.push(star);
        if (outer) clickableStarCores.push(outer); // Only the outer layer is clickable

        // Store emotion star info for dynamic song updates
        emotionStarGroups.set(emotion.name.toLowerCase(), {
          star,
          position: emotion.position.clone(),
          color: emotion.color,
        });

        // Add orbiting songs (planets) from ref - use ref to avoid dependency on tracksByEmotion
        const emotionTracks =
          tracksByEmotionRef.current[emotion.name.toLowerCase()] || [];
        emotionTracks.forEach((track, songIndex) => {
          // Create planet as a group with gradient layers
          const planet = new THREE.Group();

          // Inner bright core - larger and fully opaque for maximum brightness
          const planetCoreGeometry = new THREE.SphereGeometry(0.025, 16, 16);
          const planetCoreMaterial = new THREE.MeshBasicMaterial({
            color: "#ffffff",
            transparent: true,
            opacity: 1.0,
            depthWrite: false, // Prevent z-fighting
            depthTest: true,
          });
          const planetCore = new THREE.Mesh(
            planetCoreGeometry,
            planetCoreMaterial
          );
          planetCore.renderOrder = 0;
          planet.add(planetCore);

          // Middle blend layer - brighter blend
          const planetMiddleGeometry = new THREE.SphereGeometry(0.038, 16, 16);
          const planetBlendColor = new THREE.Color("#ffffff").lerp(
            new THREE.Color(emotion.color),
            0.35
          );
          const planetMiddleMaterial = new THREE.MeshBasicMaterial({
            color: planetBlendColor,
            transparent: true,
            opacity: 0.95,
            depthWrite: false, // Prevent z-fighting
            depthTest: true,
          });
          const planetMiddle = new THREE.Mesh(
            planetMiddleGeometry,
            planetMiddleMaterial
          );
          planetMiddle.renderOrder = 1;
          planet.add(planetMiddle);

          // Outer layer (lighter emotion color for brightness)
          const planetOuterGeometry = new THREE.SphereGeometry(0.052, 16, 16);
          const brighterEmotionColor = new THREE.Color(emotion.color).lerp(
            new THREE.Color("#ffffff"),
            0.3
          );
          const planetOuterMaterial = new THREE.MeshBasicMaterial({
            color: brighterEmotionColor,
            transparent: true,
            opacity: 0.85,
            depthWrite: false, // Prevent z-fighting
            depthTest: true,
          });
          const planetOuter = new THREE.Mesh(
            planetOuterGeometry,
            planetOuterMaterial
          );
          planetOuter.renderOrder = 2;
          planet.add(planetOuter);

          // Add bright glow effect for orbiting songs
          const planetGlowGeometry = new THREE.SphereGeometry(0.075, 16, 16);
          const planetGlowMaterial = new THREE.MeshBasicMaterial({
            color: brighterEmotionColor,
            transparent: true,
            opacity: 0.4,
            depthWrite: false,
            depthTest: true,
            blending: THREE.AdditiveBlending,
          });
          const planetGlow = new THREE.Mesh(
            planetGlowGeometry,
            planetGlowMaterial
          );
          planetGlow.renderOrder = 3;
          planet.add(planetGlow);

          const orbitRadius = 0.35 + songIndex * 0.12;
          const totalTracks = emotionTracks.length;
          const initialAngle =
            (songIndex / Math.max(totalTracks, 1)) * Math.PI * 2;
          const speed = 0.015 + songIndex * 0.005;

          orbitingSongs.push({
            mesh: planet,
            emotion,
            initialAngle,
            speed,
            radius: orbitRadius,
            trackId: track.id,
          });

          scene.add(planet);
        });
      });

      // Store orbiting songs in ref for dynamic updates
      orbitingSongsRef.current = orbitingSongs;
    };

    generateGalaxy();

    // Raycaster for clicking on emotion stars
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onMouseClick = (event: MouseEvent) => {
      mouse.x = (event.clientX / sizes.width) * 2 - 1;
      mouse.y = -(event.clientY / sizes.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);

      // Only check intersection with the outer layer cores (smaller click area)
      const intersects = raycaster.intersectObjects(clickableStarCores);

      if (intersects.length > 0) {
        // Find which emotion star was clicked
        const clickedStarIndex = clickableStarCores.indexOf(
          intersects[0].object as THREE.Mesh
        );

        if (clickedStarIndex !== -1) {
          const emotion = emotions[clickedStarIndex];

          // Save current camera state before animating (only if not already focused)
          if (!previousCameraState.current) {
            previousCameraState.current = {
              position: camera.position.clone(),
              target: controls.target.clone(),
            };
          }

          setFocusedEmotion(emotion);
          focusedEmotionRef.current = emotion;

          // Animate camera to top-down view using spherical coordinates for smooth motion
          const targetLookAt = emotion.position.clone();
          const targetDistance = 2.5;

          // Get starting spherical coordinates relative to current target
          const startOffset = camera.position.clone().sub(controls.target);
          const startSpherical = new THREE.Spherical().setFromVector3(
            startOffset
          );

          // Target: directly above (phi = 0 is top, we use small angle to avoid gimbal lock)
          const endSpherical = new THREE.Spherical(
            targetDistance,
            0.01,
            startSpherical.theta
          );

          const startTarget = controls.target.clone();
          const startTime = Date.now();
          const duration = 1200;

          const animateCamera = () => {
            const elapsed = Date.now() - startTime;
            const t = Math.min(elapsed / duration, 1);

            // Smooth easing function (ease-out cubic)
            const eased = 1 - Math.pow(1 - t, 3);

            // Interpolate the look-at target
            const currentTarget = startTarget.clone().lerp(targetLookAt, eased);
            controls.target.copy(currentTarget);

            // Interpolate spherical coordinates for smooth arc motion
            const currentSpherical = new THREE.Spherical(
              THREE.MathUtils.lerp(
                startSpherical.radius,
                endSpherical.radius,
                eased
              ),
              THREE.MathUtils.lerp(startSpherical.phi, endSpherical.phi, eased),
              startSpherical.theta // Keep theta constant to avoid yaw spin
            );

            // Convert back to cartesian and set camera position
            const offset = new THREE.Vector3().setFromSpherical(
              currentSpherical
            );
            camera.position.copy(currentTarget).add(offset);

            if (t < 1) {
              requestAnimationFrame(animateCamera);
            }
          };

          animateCamera();
        }
      } else {
        // Clicked outside - return to previous camera view if we have one
        if (previousCameraState.current && focusedEmotionRef.current) {
          const startCameraPos = camera.position.clone();
          const startTarget = controls.target.clone();
          const targetCameraPos = previousCameraState.current.position;
          const targetLookAt = previousCameraState.current.target;
          const startTime = Date.now();
          const duration = 1200; // 1.2 seconds

          const animateBack = () => {
            const elapsed = Date.now() - startTime;
            const t = Math.min(elapsed / duration, 1);

            // Smooth easing function (ease-out cubic)
            const eased = 1 - Math.pow(1 - t, 3);

            // Smoothly interpolate both camera position and look-at target
            camera.position.lerpVectors(startCameraPos, targetCameraPos, eased);
            controls.target.lerpVectors(startTarget, targetLookAt, eased);

            if (t < 1) {
              requestAnimationFrame(animateBack);
            } else {
              // Animation complete - clear the saved state
              previousCameraState.current = null;
            }
          };

          animateBack();
        }

        setFocusedEmotion(null);
        focusedEmotionRef.current = null;
        setTooltipPosition(null);
      }
    };

    window.addEventListener("click", onMouseClick);

    // Resize handler
    const handleResize = () => {
      sizes.width = window.innerWidth;
      sizes.height = window.innerHeight;

      camera.aspect = sizes.width / sizes.height;
      camera.updateProjectionMatrix();

      renderer.setSize(sizes.width, sizes.height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    };

    window.addEventListener("resize", handleResize);

    // Animation
    const clock = new THREE.Clock();

    const tick = () => {
      const elapsedTime = clock.getElapsedTime();

      // Animate orbiting songs
      orbitingSongs.forEach(
        ({ mesh, emotion, initialAngle, speed, radius }) => {
          const currentAngle = initialAngle + elapsedTime * speed;
          const x = emotion.position.x + Math.cos(currentAngle) * radius;
          const z = emotion.position.z + Math.sin(currentAngle) * radius;
          const y = emotion.position.y + Math.sin(currentAngle * 2) * 0.05;

          mesh.position.set(x, y, z);
        }
      );

      // Animate emotion stars (gentle pulsing)
      emotionStars.forEach((star, index) => {
        const scale = 1 + Math.sin(elapsedTime * 0.5 + index) * 0.1;
        star.scale.set(scale, scale, scale);
      });

      controls.update();
      renderer.render(scene, camera);
      window.requestAnimationFrame(tick);
    };

    tick();

    // Cleanup
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("click", onMouseClick);

      // Dispose of all emotion star materials and geometries
      emotionStars.forEach((star) => {
        star.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry?.dispose();
            if (child.material instanceof THREE.Material) {
              child.material.dispose();
            }
          }
          if (child instanceof THREE.Points) {
            child.geometry?.dispose();
            if (child.material instanceof THREE.Material) {
              child.material.dispose();
            }
          }
        });
        scene.remove(star);
      });

      // Dispose of orbiting songs
      orbitingSongs.forEach((song) => {
        song.mesh.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry?.dispose();
            if (child.material instanceof THREE.Material) {
              child.material.dispose();
            }
          }
        });
        scene.remove(song.mesh);
      });

      renderer.dispose();
      geometry?.dispose();
      material?.dispose();
      controls.dispose();
      cameraRef.current = null;
      sceneRef.current = null;
      orbitingSongsRef.current = [];
    };
  }, [parameters]); // Only regenerate on parameter changes, not track changes

  // Separate effect to handle track changes without regenerating the entire scene
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const currentOrbitingSongs = orbitingSongsRef.current;
    const currentTrackIds = new Set(currentOrbitingSongs.map((s) => s.trackId));

    // Get all tracks from all emotions
    const allEmotionNames = [
      "joy",
      "sadness",
      "anger",
      "fear",
      "love",
      "surprise",
      "calm",
      "nostalgia",
    ];
    const emotionColors: Record<string, string> = {
      joy: "#FFD700",
      sadness: "#4169E1",
      anger: "#DC143C",
      fear: "#800080",
      love: "#FF69B4",
      surprise: "#FF8C00",
      calm: "#00CED1",
      nostalgia: "#DDA0DD",
    };

    allEmotionNames.forEach((emotionName) => {
      const tracks = tracksByEmotion[emotionName] || [];
      const position = emotionPositionsRef.current.get(emotionName);
      if (!position) return;

      const color = emotionColors[emotionName];

      tracks.forEach((track, songIndex) => {
        if (!currentTrackIds.has(track.id)) {
          // Add new orbiting song
          const planet = new THREE.Group();

          // Inner bright core
          const planetCoreGeometry = new THREE.SphereGeometry(0.025, 16, 16);
          const planetCoreMaterial = new THREE.MeshBasicMaterial({
            color: "#ffffff",
            transparent: true,
            opacity: 1.0,
            depthWrite: false,
            depthTest: true,
          });
          const planetCore = new THREE.Mesh(
            planetCoreGeometry,
            planetCoreMaterial
          );
          planetCore.renderOrder = 0;
          planet.add(planetCore);

          // Middle blend layer
          const planetMiddleGeometry = new THREE.SphereGeometry(0.038, 16, 16);
          const planetBlendColor = new THREE.Color("#ffffff").lerp(
            new THREE.Color(color),
            0.35
          );
          const planetMiddleMaterial = new THREE.MeshBasicMaterial({
            color: planetBlendColor,
            transparent: true,
            opacity: 0.95,
            depthWrite: false,
            depthTest: true,
          });
          const planetMiddle = new THREE.Mesh(
            planetMiddleGeometry,
            planetMiddleMaterial
          );
          planetMiddle.renderOrder = 1;
          planet.add(planetMiddle);

          // Outer layer
          const planetOuterGeometry = new THREE.SphereGeometry(0.052, 16, 16);
          const brighterEmotionColor = new THREE.Color(color).lerp(
            new THREE.Color("#ffffff"),
            0.3
          );
          const planetOuterMaterial = new THREE.MeshBasicMaterial({
            color: brighterEmotionColor,
            transparent: true,
            opacity: 0.85,
            depthWrite: false,
            depthTest: true,
          });
          const planetOuter = new THREE.Mesh(
            planetOuterGeometry,
            planetOuterMaterial
          );
          planetOuter.renderOrder = 2;
          planet.add(planetOuter);

          // Glow effect
          const planetGlowGeometry = new THREE.SphereGeometry(0.075, 16, 16);
          const planetGlowMaterial = new THREE.MeshBasicMaterial({
            color: brighterEmotionColor,
            transparent: true,
            opacity: 0.4,
            depthWrite: false,
            depthTest: true,
            blending: THREE.AdditiveBlending,
          });
          const planetGlow = new THREE.Mesh(
            planetGlowGeometry,
            planetGlowMaterial
          );
          planetGlow.renderOrder = 3;
          planet.add(planetGlow);

          const orbitRadius = 0.35 + songIndex * 0.12;
          const totalTracks = tracks.length;
          const initialAngle =
            (songIndex / Math.max(totalTracks, 1)) * Math.PI * 2;
          const speed = 0.015 + songIndex * 0.005;

          // Create a fake emotion object for animation compatibility
          const emotionObj = {
            name: emotionName.charAt(0).toUpperCase() + emotionName.slice(1),
            color,
            position: position.clone(),
            songs: tracks,
          };

          currentOrbitingSongs.push({
            mesh: planet,
            emotion: emotionObj,
            initialAngle,
            speed,
            radius: orbitRadius,
            trackId: track.id,
          });

          scene.add(planet);
          console.log(
            `Added orbiting song for track ${track.id} (${track.title}) to ${emotionName}`
          );
        }
      });
    });

    // Remove songs for deleted tracks
    const allCurrentTrackIds = new Set<number>();
    allEmotionNames.forEach((emotionName) => {
      const tracks = tracksByEmotion[emotionName] || [];
      tracks.forEach((t) => allCurrentTrackIds.add(t.id));
    });

    const toRemove = currentOrbitingSongs.filter(
      (s) => !allCurrentTrackIds.has(s.trackId)
    );
    toRemove.forEach((song) => {
      song.mesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry?.dispose();
          if (child.material instanceof THREE.Material) {
            child.material.dispose();
          }
        }
      });
      scene.remove(song.mesh);
      const idx = currentOrbitingSongs.indexOf(song);
      if (idx > -1) currentOrbitingSongs.splice(idx, 1);
    });
  }, [tracksByEmotion]); // This effect only handles track changes

  const updateParameter = <K extends keyof GalaxyParameters>(
    key: K,
    value: GalaxyParameters[K]
  ) => {
    setTempParameters((prev) => ({ ...prev, [key]: value }));
  };

  const resetToCenter = () => {
    if (
      !cameraRef.current ||
      !controlsRef.current ||
      !initialCameraState.current
    )
      return;

    const camera = cameraRef.current;
    const controls = controlsRef.current;

    const startCameraPos = camera.position.clone();
    const startTarget = controls.target.clone();
    const targetCameraPos = initialCameraState.current.position;
    const targetLookAt = initialCameraState.current.target;
    const startTime = Date.now();
    const duration = 1200;

    const animateReset = () => {
      const elapsed = Date.now() - startTime;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);

      camera.position.lerpVectors(startCameraPos, targetCameraPos, eased);
      controls.target.lerpVectors(startTarget, targetLookAt, eased);

      if (t < 1) {
        requestAnimationFrame(animateReset);
      } else {
        previousCameraState.current = null;
      }
    };

    animateReset();

    setFocusedEmotion(null);
    focusedEmotionRef.current = null;
    setTooltipPosition(null);
  };

  // Focus on a specific emotion star by name
  const focusOnEmotion = useCallback(
    (emotionName: string) => {
      if (!cameraRef.current || !controlsRef.current) return;

      // Get position from ref (set during Three.js setup)
      const starPosition = emotionPositionsRef.current.get(
        emotionName.toLowerCase()
      );
      if (!starPosition) return;

      const emotion = emotions.find(
        (e) => e.name.toLowerCase() === emotionName.toLowerCase()
      );
      if (!emotion) return;

      // Update the emotion's position from the stored ref
      emotion.position.copy(starPosition);

      const camera = cameraRef.current;
      const controls = controlsRef.current;

      // Save current camera state before animating (only if not already focused)
      if (!previousCameraState.current) {
        previousCameraState.current = {
          position: camera.position.clone(),
          target: controls.target.clone(),
        };
      }

      setFocusedEmotion(emotion);
      focusedEmotionRef.current = emotion;

      // Animate camera to top-down view using spherical coordinates for smooth motion
      const targetLookAt = starPosition.clone();
      const targetDistance = 2.5;

      // Get starting spherical coordinates relative to current target
      const startOffset = camera.position.clone().sub(controls.target);
      const startSpherical = new THREE.Spherical().setFromVector3(startOffset);

      // Target: directly above (phi = 0 is top, we use small angle to avoid gimbal lock)
      const endSpherical = new THREE.Spherical(
        targetDistance,
        0.01,
        startSpherical.theta
      );

      const startTarget = controls.target.clone();
      const startTime = Date.now();
      const duration = 1200;

      const animateCamera = () => {
        const elapsed = Date.now() - startTime;
        const t = Math.min(elapsed / duration, 1);

        // Smooth easing function (ease-out cubic)
        const eased = 1 - Math.pow(1 - t, 3);

        // Interpolate the look-at target
        const currentTarget = startTarget.clone().lerp(targetLookAt, eased);
        controls.target.copy(currentTarget);

        // Interpolate spherical coordinates for smooth arc motion
        const currentSpherical = new THREE.Spherical(
          THREE.MathUtils.lerp(
            startSpherical.radius,
            endSpherical.radius,
            eased
          ),
          THREE.MathUtils.lerp(startSpherical.phi, endSpherical.phi, eased),
          startSpherical.theta // Keep theta constant to avoid yaw spin
        );

        // Convert back to cartesian and set camera position
        const offset = new THREE.Vector3().setFromSpherical(currentSpherical);
        camera.position.copy(currentTarget).add(offset);

        if (t < 1) {
          requestAnimationFrame(animateCamera);
        }
      };

      animateCamera();
    },
    [emotions]
  );

  return (
    <div className="galaxy-container">
      <canvas ref={canvasRef} className="galaxy-canvas" />

      {/* Hidden Spotify player container */}
      <div
        ref={playerContainerRef}
        style={{ position: "absolute", left: "-9999px" }}
      />

      <button className="reset-btn" onClick={resetToCenter}>
        Reset View
      </button>

      <button
        className="toggle-panel-btn"
        onClick={() => setShowPanel(!showPanel)}
      >
        {showPanel ? "Hide" : "Show"} Controls
      </button>

      <button
        className="add-track-btn"
        onClick={() => setShowAddTrack(!showAddTrack)}
        title="Add a track from Spotify"
      >
        {showAddTrack ? "✕" : "+"} Add Track
      </button>

      <button
        className="track-list-btn"
        onClick={() => setShowTrackList(!showTrackList)}
        title="View all tracks"
      >
        {showTrackList ? "✕" : "☰"} Library
      </button>

      {/* Background Adding Indicator */}
      {backgroundAdding.isAdding && (
        <div className="background-adding-indicator">
          <OrbitingSpinner />
        </div>
      )}

      {/* Media Controls */}
      {currentTrack && (
        <div className="media-controls">
          {currentTrack.title && (
            <div className="media-now-playing">
              <button
                className="media-emotion-circle"
                style={{
                  background: currentTrack.emotion
                    ? emotions.find(
                        (e) => e.name.toLowerCase() === currentTrack.emotion
                      )?.color || "#00d4ff"
                    : "#00d4ff",
                  boxShadow: `0 0 10px ${
                    currentTrack.emotion
                      ? emotions.find(
                          (e) => e.name.toLowerCase() === currentTrack.emotion
                        )?.color || "#00d4ff"
                      : "#00d4ff"
                  }`,
                }}
                onClick={() =>
                  currentTrack.emotion && focusOnEmotion(currentTrack.emotion)
                }
                title={
                  currentTrack.emotion
                    ? `Focus on ${currentTrack.emotion} star`
                    : "Unknown emotion"
                }
              />
              <span className="media-title">{currentTrack.title}</span>
            </div>
          )}
          <div className="media-buttons">
            <button
              className="media-btn media-btn-stop"
              onClick={stopTrack}
              title="Stop"
            >
              ⏹
            </button>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {successModal.show && successModal.track && (
        <div
          className="modal-overlay"
          onClick={() => setSuccessModal({ show: false, track: null })}
        >
          <div className="success-modal" onClick={(e) => e.stopPropagation()}>
            <div className="success-modal-icon">✦</div>
            <h3 className="success-modal-title">Track Added!</h3>
            <div className="success-modal-track">
              <div className="success-track-title">
                {successModal.track.title}
              </div>
              {successModal.track.artist && (
                <div className="success-track-artist">
                  {successModal.track.artist}
                </div>
              )}
              <div className="success-track-emotion">
                <span
                  className="emotion-dot"
                  style={{
                    background:
                      emotions.find(
                        (e) =>
                          e.name.toLowerCase() === successModal.track!.emotion
                      )?.color || "#fff",
                  }}
                />
                {successModal.track.emotion}
              </div>
            </div>
            <button
              className="success-modal-btn"
              onClick={() => setSuccessModal({ show: false, track: null })}
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* Add Track Modal */}
      {showAddTrack && (
        <div className="add-track-modal">
          <div className="modal-header-minimal">
            <button
              className="close-modal"
              onClick={() => setShowAddTrack(false)}
            >
              ✕
            </button>
          </div>

          <div className="modal-body">
            <p className="modal-description">Paste a Spotify track link</p>

            {trackError && (
              <div className="error-message">
                {trackError}
                <button onClick={clearError} className="error-close">
                  ✕
                </button>
              </div>
            )}

            <div className="input-group">
              <input
                type="text"
                value={spotifyUrl}
                onChange={(e) => setSpotifyUrl(e.target.value)}
                placeholder="https://open.spotify.com/track/..."
                className="youtube-input"
              />
              <button
                onClick={handleAddTrack}
                disabled={!spotifyUrl || !isValidSpotifyUrl(spotifyUrl)}
                className="analyze-btn ai-star-btn"
                title="Analyze with AI"
              >
                <span className="ai-star-icon">✦</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Track List Modal */}
      {showTrackList && (
        <div className="track-list-modal">
          <div className="modal-header">
            <h3>Library</h3>
            <button
              className="close-modal"
              onClick={() => setShowTrackList(false)}
            >
              ✕
            </button>
          </div>

          <div className="modal-body">
            <div className="emotion-sections">
              {emotions.map((emotion) => (
                <div key={emotion.name} className="emotion-section">
                  <div className="emotion-section-header">
                    <span
                      className="emotion-section-dot"
                      style={{ background: emotion.color }}
                    ></span>
                    <span className="emotion-section-name">{emotion.name}</span>
                    <span className="emotion-section-count">
                      {emotion.songs.length} tracks
                    </span>
                  </div>

                  {emotion.songs.length > 0 ? (
                    <div className="emotion-section-tracks">
                      {emotion.songs.map((track) => (
                        <div
                          key={track.id}
                          className="track-item"
                          onClick={(e) => handlePlayTrack(track, e)}
                        >
                          <div
                            className="track-item-indicator"
                            style={{ background: emotion.color }}
                          ></div>
                          <div className="track-item-info">
                            <div className="track-item-title">
                              {track.title}
                            </div>
                            {track.artist && (
                              <div className="track-item-artist">
                                {track.artist}
                              </div>
                            )}
                            <div className="track-item-meta">
                              {track.genre && <span>{track.genre}</span>}
                              {track.tempo && <span>{track.tempo} BPM</span>}
                            </div>
                          </div>
                          <div className="track-item-play">▶</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="emotion-section-empty">No tracks yet</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showPanel && (
        <div className="control-panel">
          <div className="control-panel-header">Galaxy Parameters</div>

          <div className="control-group">
            <div className="control-label">
              <span>Count</span>
              <span className="control-value">
                {tempParameters.count.toLocaleString()}
              </span>
            </div>
            <input
              type="range"
              min="100"
              max="1000000"
              step="100"
              value={tempParameters.count}
              onChange={(e) =>
                updateParameter("count", parseInt(e.target.value))
              }
              className="control-input"
            />
          </div>

          <div className="control-group">
            <div className="control-label">
              <span>Size</span>
              <span className="control-value">
                {tempParameters.size.toFixed(3)}
              </span>
            </div>
            <input
              type="range"
              min="0.001"
              max="0.1"
              step="0.001"
              value={tempParameters.size}
              onChange={(e) =>
                updateParameter("size", parseFloat(e.target.value))
              }
              className="control-input"
            />
          </div>

          <div className="control-group">
            <div className="control-label">
              <span>Radius</span>
              <span className="control-value">
                {tempParameters.radius.toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min="0.01"
              max="20"
              step="0.01"
              value={tempParameters.radius}
              onChange={(e) =>
                updateParameter("radius", parseFloat(e.target.value))
              }
              className="control-input"
            />
          </div>

          <div className="control-group">
            <div className="control-label">
              <span>Branches</span>
              <span className="control-value">{tempParameters.branches}</span>
            </div>
            <input
              type="range"
              min="2"
              max="20"
              step="1"
              value={tempParameters.branches}
              onChange={(e) =>
                updateParameter("branches", parseInt(e.target.value))
              }
              className="control-input"
            />
          </div>

          <div className="control-group">
            <div className="control-label">
              <span>Spin</span>
              <span className="control-value">
                {tempParameters.spin.toFixed(3)}
              </span>
            </div>
            <input
              type="range"
              min="-5"
              max="5"
              step="0.001"
              value={tempParameters.spin}
              onChange={(e) =>
                updateParameter("spin", parseFloat(e.target.value))
              }
              className="control-input"
            />
          </div>

          <div className="control-group">
            <div className="control-label">
              <span>Randomness</span>
              <span className="control-value">
                {tempParameters.randomness.toFixed(3)}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="2"
              step="0.001"
              value={tempParameters.randomness}
              onChange={(e) =>
                updateParameter("randomness", parseFloat(e.target.value))
              }
              className="control-input"
            />
          </div>

          <div className="control-group">
            <div className="control-label">
              <span>Randomness Power</span>
              <span className="control-value">
                {tempParameters.randomnessPower.toFixed(3)}
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="10"
              step="0.001"
              value={tempParameters.randomnessPower}
              onChange={(e) =>
                updateParameter("randomnessPower", parseFloat(e.target.value))
              }
              className="control-input"
            />
          </div>

          <div className="control-group">
            <div className="control-label">
              <span>Inside Color</span>
            </div>
            <input
              type="color"
              value={tempParameters.insideColor}
              onChange={(e) => updateParameter("insideColor", e.target.value)}
              className="control-input"
            />
          </div>

          <div className="control-group">
            <div className="control-label">
              <span>Outside Color</span>
            </div>
            <input
              type="color"
              value={tempParameters.outsideColor}
              onChange={(e) => updateParameter("outsideColor", e.target.value)}
              className="control-input"
            />
          </div>
        </div>
      )}

      {selectedEmotion &&
        (() => {
          // Get fresh tracks from tracksByEmotion instead of stale selectedEmotion.songs
          const emotionKey = selectedEmotion.name.toLowerCase();
          const freshTracks = tracksByEmotion[emotionKey] || [];

          return (
            <div className="emotion-info">
              <div className="emotion-title">{selectedEmotion.name}</div>
              <div className="emotion-description">
                Click on the glowing orbs to explore different emotions
              </div>
              <ul className="song-list">
                {freshTracks.map((track) => (
                  <li key={track.id} className="song-item">
                    {track.title} {track.artist && `- ${track.artist}`}
                  </li>
                ))}
              </ul>
            </div>
          );
        })()}

      {focusedEmotion &&
        tooltipPosition &&
        (() => {
          // Get fresh tracks from tracksByEmotion instead of stale focusedEmotion.songs
          const emotionKey = focusedEmotion.name.toLowerCase();
          const freshTracks = tracksByEmotion[emotionKey] || [];

          return (
            <>
              <svg
                className="connection-line"
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: "100%",
                  pointerEvents: "none",
                  zIndex: 999,
                }}
              >
                <defs>
                  <linearGradient
                    id="lineGradient"
                    x1="0%"
                    y1="0%"
                    x2="100%"
                    y2="0%"
                  >
                    <stop
                      offset="0%"
                      style={{
                        stopColor: focusedEmotion.color,
                        stopOpacity: 0.8,
                      }}
                    />
                    <stop
                      offset="100%"
                      style={{
                        stopColor: focusedEmotion.color,
                        stopOpacity: 0.2,
                      }}
                    />
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
                onClick={(e) => {
                  e.stopPropagation();
                  e.nativeEvent.stopImmediatePropagation();
                }}
              >
                <div className="tooltip-header">
                  <div
                    className="tooltip-icon"
                    style={{ background: focusedEmotion.color }}
                  ></div>
                  <h3 className="tooltip-title">{focusedEmotion.name}</h3>
                </div>
                <div className="tooltip-divider"></div>
                <div className="tooltip-content">
                  <p className="tooltip-label">Orbiting Tracks</p>
                  {freshTracks.length > 0 ? (
                    <ul className="tooltip-songs">
                      {freshTracks.map((track) => (
                        <li
                          key={track.id}
                          className="tooltip-song"
                          onClick={(e) => handlePlayTrack(track, e)}
                          style={{ cursor: "pointer" }}
                          title="Click to play"
                        >
                          <span
                            className="song-bullet"
                            style={{ background: focusedEmotion.color }}
                          >
                            ●
                          </span>
                          <div className="song-info">
                            <div className="song-title">{track.title}</div>
                            {track.artist && (
                              <div className="song-artist">{track.artist}</div>
                            )}
                            {track.genre && (
                              <div className="song-meta">
                                {track.genre} •{" "}
                                {track.tempo
                                  ? `${track.tempo} BPM`
                                  : "Unknown tempo"}
                              </div>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="tooltip-empty">No tracks yet. Add one!</p>
                  )}
                </div>
              </div>
            </>
          );
        })()}
    </div>
  );
}
