/**
 * Audio analysis types for Gemini-powered galaxy visualization
 */

// Real-time audio features extracted from the audio stream
export interface AudioFeatures {
  // Core dynamics (affects spiral arms)
  bpm: number;              // Beats per minute (0-200) - controls rotation speed
  energy: number;           // Overall energy level (0-1) - star density & electrical bolts
  valence: number;          // Emotional mood (0-1) - color gradient (0=melancholy, 1=euphoric)

  // The Great Attractor (core visualization)
  amplitude: number;        // Current volume level (0-1) - core size and intensity
  bass: number;             // Low frequency power (0-1) - shockwave pulses

  // Additional features for rich visualization
  treble: number;           // High frequency power (0-1) - particle shimmer
  tempo: number;            // Perceived tempo intensity (0-1)
  spectralCentroid: number; // Brightness of sound (0-1)

  // Environmental context
  ambientNoise: number;     // Background noise level (0-1) - gravitational interference

  // Metadata
  timestamp: number;
  isPlaying: boolean;
}

// Configuration for the audio analyzer
export interface AudioAnalyzerConfig {
  sampleRate: number;
  fftSize: number;
  smoothingTimeConstant: number;
  minDecibels: number;
  maxDecibels: number;
}

// State of the audio capture system
export interface AudioCaptureState {
  isCapturing: boolean;
  hasPermission: boolean;
  error: string | null;
  deviceId: string | null;
}

// Gemini analysis result for audio understanding
export interface GeminiAudioAnalysis {
  // Musical analysis
  estimatedBpm: number;
  genre: string;
  mood: 'calm' | 'melancholic' | 'neutral' | 'energetic' | 'euphoric';
  energy: number;
  valence: number;

  // Structural elements
  hasVocals: boolean;
  hasBeat: boolean;
  instrumentalComplexity: number;

  // Environmental sounds (for ambient detection)
  environmentType: 'music' | 'speech' | 'nature' | 'urban' | 'silence' | 'mixed';
  noiseLevel: number;
}

// Color palette based on valence
export interface ValenceColorPalette {
  cold: string;     // For low valence (melancholy) - Cyan/Blue
  warm: string;     // For high valence (euphoria) - Gold/Magenta
}

// Galaxy visual state influenced by audio
export interface AudioDrivenGalaxyState {
  // Core (Great Attractor)
  coreSize: number;
  coreIntensity: number;
  shockwaveActive: boolean;
  shockwaveProgress: number;

  // Spiral arms
  rotationSpeed: number;
  starDensity: number;
  electricalBolts: number;
  colorGradient: ValenceColorPalette;

  // Environmental effects
  symmetryBreak: number;     // Based on ambient noise
  nebulaOpacity: number;     // Weather/atmospheric effect

  // Transient events
  supernovaPositions: Array<{ x: number; y: number; z: number; intensity: number }>;
}

// Default audio features (silent state)
export const DEFAULT_AUDIO_FEATURES: AudioFeatures = {
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

// Default analyzer configuration
export const DEFAULT_ANALYZER_CONFIG: AudioAnalyzerConfig = {
  sampleRate: 44100,
  fftSize: 2048,
  smoothingTimeConstant: 0.8,
  minDecibels: -90,
  maxDecibels: -10,
};
