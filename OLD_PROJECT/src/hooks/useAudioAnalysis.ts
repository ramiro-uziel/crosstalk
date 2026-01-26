/**
 * React hook for audio analysis with Gemini
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { GeminiAudioService, getAudioService, resetAudioService } from '../services/gemini-audio';
import type {
  AudioFeatures,
  AudioCaptureState,
  GeminiAudioAnalysis
} from '../types/audio';

interface UseAudioAnalysisOptions {
  apiKey?: string;
  autoStart?: boolean;
  smoothing?: number; // 0-1, how much to smooth feature changes
}

interface UseAudioAnalysisReturn {
  // Current audio features
  features: AudioFeatures;

  // Gemini analysis (less frequent but more intelligent)
  geminiAnalysis: GeminiAudioAnalysis | null;

  // Capture state
  captureState: AudioCaptureState;

  // Controls
  start: () => Promise<boolean>;
  stop: () => void;
  toggle: () => Promise<boolean>;

  // Smoothed values for visualization (prevents jitter)
  smoothedFeatures: AudioFeatures;
}

const DEFAULT_AUDIO_FEATURES_IMPL: AudioFeatures = {
  bpm: 0,
  energy: 0,
  valence: 0.5,
  amplitude: 0,
  bass: 0,
  treble: 0,
  tempo: 0,
  spectralCentroid: 0.5,
  ambientNoise: 0,
  timestamp: Date.now(),
  isPlaying: false,
};

export function useAudioAnalysis(options: UseAudioAnalysisOptions = {}): UseAudioAnalysisReturn {
  const { apiKey, autoStart = false, smoothing = 0.3 } = options;

  const [features, setFeatures] = useState<AudioFeatures>(DEFAULT_AUDIO_FEATURES_IMPL);
  const [smoothedFeatures, setSmoothedFeatures] = useState<AudioFeatures>(DEFAULT_AUDIO_FEATURES_IMPL);
  const [geminiAnalysis, setGeminiAnalysis] = useState<GeminiAudioAnalysis | null>(null);
  const [captureState, setCaptureState] = useState<AudioCaptureState>({
    isCapturing: false,
    hasPermission: false,
    error: null,
    deviceId: null,
  });

  const serviceRef = useRef<GeminiAudioService | null>(null);
  const smoothedRef = useRef<AudioFeatures>(DEFAULT_AUDIO_FEATURES_IMPL);

  // Smooth feature updates
  const smoothValue = useCallback((current: number, target: number, factor: number): number => {
    return current + (target - current) * (1 - factor);
  }, []);

  const updateSmoothedFeatures = useCallback((newFeatures: AudioFeatures) => {
    const current = smoothedRef.current;

    const smoothed: AudioFeatures = {
      bpm: smoothValue(current.bpm, newFeatures.bpm, smoothing),
      energy: smoothValue(current.energy, newFeatures.energy, smoothing),
      valence: smoothValue(current.valence, newFeatures.valence, smoothing * 0.5), // Slower valence changes
      amplitude: smoothValue(current.amplitude, newFeatures.amplitude, smoothing * 0.7), // Faster amplitude response
      bass: smoothValue(current.bass, newFeatures.bass, smoothing * 0.5), // Faster bass response
      treble: smoothValue(current.treble, newFeatures.treble, smoothing),
      tempo: newFeatures.tempo, // Don't smooth tempo (it's a trigger)
      spectralCentroid: smoothValue(current.spectralCentroid, newFeatures.spectralCentroid, smoothing),
      ambientNoise: smoothValue(current.ambientNoise, newFeatures.ambientNoise, smoothing * 0.8),
      timestamp: newFeatures.timestamp,
      isPlaying: newFeatures.isPlaying,
    };

    smoothedRef.current = smoothed;
    setSmoothedFeatures(smoothed);
  }, [smoothing, smoothValue]);

  // Handle feature updates from the service
  const handleFeaturesUpdate = useCallback((newFeatures: AudioFeatures) => {
    setFeatures(newFeatures);
    updateSmoothedFeatures(newFeatures);
  }, [updateSmoothedFeatures]);

  // Start audio capture
  const start = useCallback(async (): Promise<boolean> => {
    try {
      setCaptureState(prev => ({ ...prev, error: null }));

      // Get or create service
      if (!serviceRef.current) {
        serviceRef.current = getAudioService(apiKey);
      }

      // Initialize audio
      const initialized = await serviceRef.current.initialize();

      if (!initialized) {
        setCaptureState(prev => ({
          ...prev,
          error: 'Failed to initialize audio capture',
          hasPermission: false,
        }));
        return false;
      }

      // Start analysis
      serviceRef.current.start(handleFeaturesUpdate);

      setCaptureState({
        isCapturing: true,
        hasPermission: true,
        error: null,
        deviceId: null,
      });

      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      setCaptureState(prev => ({
        ...prev,
        isCapturing: false,
        error: errorMessage,
      }));

      return false;
    }
  }, [apiKey, handleFeaturesUpdate]);

  // Stop audio capture
  const stop = useCallback(() => {
    if (serviceRef.current) {
      serviceRef.current.stop();
    }

    setCaptureState(prev => ({
      ...prev,
      isCapturing: false,
    }));

    // Reset to default features gradually
    setFeatures(DEFAULT_AUDIO_FEATURES_IMPL);
  }, []);

  // Toggle audio capture
  const toggle = useCallback(async (): Promise<boolean> => {
    if (captureState.isCapturing) {
      stop();
      return false;
    } else {
      return start();
    }
  }, [captureState.isCapturing, start, stop]);

  // Poll for Gemini analysis updates
  useEffect(() => {
    if (!captureState.isCapturing || !serviceRef.current) return;

    const interval = setInterval(() => {
      const analysis = serviceRef.current?.getGeminiAnalysis();
      if (analysis) {
        setGeminiAnalysis(analysis);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [captureState.isCapturing]);

  // Auto-start if requested
  useEffect(() => {
    if (autoStart) {
      start();
    }

    return () => {
      if (serviceRef.current) {
        serviceRef.current.dispose();
        serviceRef.current = null;
      }
    };
  }, [autoStart]); // Only on mount/unmount, don't include start

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      resetAudioService();
    };
  }, []);

  return {
    features,
    geminiAnalysis,
    captureState,
    start,
    stop,
    toggle,
    smoothedFeatures,
  };
}

/**
 * Hook to map audio features to galaxy visualization parameters
 */
export function useAudioToGalaxyMapping(features: AudioFeatures) {
  // Core (Great Attractor) - responds to amplitude and bass
  const coreSize = 0.5 + features.amplitude * 2; // 0.5 to 2.5
  const coreIntensity = 0.3 + features.amplitude * 0.7;

  // Shockwave from bass hits
  const shockwaveActive = features.bass > 0.6;
  const shockwaveIntensity = features.bass;

  // Rotation speed based on BPM
  const bpmNormalized = features.bpm / 150; // Normalize to ~0-1.3 range
  const rotationSpeed = 0.1 + bpmNormalized * 0.5;

  // Star density based on energy
  const starDensity = 0.3 + features.energy * 0.7;

  // Color based on valence
  // Low valence (0) = Cyan/Blue (melancholy)
  // High valence (1) = Gold/Magenta (euphoria)
  const coldColor = `hsl(${190 - features.valence * 30}, ${70 + features.valence * 20}%, ${40 + features.energy * 20}%)`;
  const warmColor = `hsl(${40 + features.valence * 20}, ${80 + features.valence * 20}%, ${50 + features.energy * 20}%)`;

  // Environmental effects
  const symmetryBreak = features.ambientNoise * 0.5; // 0-0.5 chaos factor
  const nebulaOpacity = 0.2 + (1 - features.ambientNoise) * 0.3;

  // Particle shimmer from treble
  const particleShimmer = features.treble;

  return {
    // Core
    coreSize,
    coreIntensity,
    shockwaveActive,
    shockwaveIntensity,

    // Spiral arms
    rotationSpeed,
    starDensity,

    // Colors
    insideColor: coldColor,
    outsideColor: warmColor,
    valence: features.valence,

    // Environment
    symmetryBreak,
    nebulaOpacity,
    particleShimmer,

    // Raw values for custom use
    amplitude: features.amplitude,
    bass: features.bass,
    treble: features.treble,
    energy: features.energy,
    bpm: features.bpm,
    isPlaying: features.isPlaying,
  };
}
