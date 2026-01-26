/**
 * Gemini Audio Analysis Service
 *
 * Hybrid approach:
 * - Web Audio API for real-time frequency/amplitude analysis
 * - Gemini for intelligent music understanding (mood, BPM, genre)
 */

import { GoogleGenAI } from '@google/genai';
import type {
  AudioFeatures,
  GeminiAudioAnalysis,
  AudioAnalyzerConfig
} from '../types/audio';

// Cache for Gemini analysis results
interface AnalysisCache {
  lastAnalysis: GeminiAudioAnalysis | null;
  lastAnalysisTime: number;
  analysisInterval: number; // ms between Gemini calls
}

export class GeminiAudioService {
  private genAI: GoogleGenAI | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];

  private frequencyData: Uint8Array<ArrayBuffer> = new Uint8Array(0) as Uint8Array<ArrayBuffer>;
  private timeDomainData: Uint8Array<ArrayBuffer> = new Uint8Array(0) as Uint8Array<ArrayBuffer>;

  private config: AudioAnalyzerConfig;
  private cache: AnalysisCache = {
    lastAnalysis: null,
    lastAnalysisTime: 0,
    analysisInterval: 5000, // Analyze every 5 seconds
  };

  private onFeaturesUpdate: ((features: AudioFeatures) => void) | null = null;
  private animationFrameId: number | null = null;
  private isRunning: boolean = false;

  // Beat detection
  private beatHistory: number[] = [];
  private lastBeatTime: number = 0;
  private beatThreshold: number = 0.15;

  constructor(apiKey?: string, config?: Partial<AudioAnalyzerConfig>) {
    if (apiKey) {
      this.genAI = new GoogleGenAI({ apiKey });
    }

    this.config = {
      sampleRate: 44100,
      fftSize: 2048,
      smoothingTimeConstant: 0.8,
      minDecibels: -90,
      maxDecibels: -10,
      ...config,
    };
  }

  /**
   * Initialize the audio capture and analysis
   */
  async initialize(): Promise<boolean> {
    try {
      // Request microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      // Set up Web Audio API
      this.audioContext = new AudioContext({ sampleRate: this.config.sampleRate });
      this.analyser = this.audioContext.createAnalyser();

      this.analyser.fftSize = this.config.fftSize;
      this.analyser.smoothingTimeConstant = this.config.smoothingTimeConstant;
      this.analyser.minDecibels = this.config.minDecibels;
      this.analyser.maxDecibels = this.config.maxDecibels;

      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      source.connect(this.analyser);

      // Initialize data arrays
      this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;
      this.timeDomainData = new Uint8Array(this.analyser.fftSize) as Uint8Array<ArrayBuffer>;

      // Set up MediaRecorder for Gemini analysis
      if (this.genAI) {
        this.setupMediaRecorder();
      }

      return true;
    } catch (error) {
      console.error('Failed to initialize audio:', error);
      return false;
    }
  }

  /**
   * Set up MediaRecorder for periodic Gemini analysis
   */
  private setupMediaRecorder() {
    if (!this.mediaStream) return;

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    this.mediaRecorder = new MediaRecorder(this.mediaStream, { mimeType });

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.audioChunks.push(event.data);
      }
    };

    this.mediaRecorder.onstop = async () => {
      if (this.audioChunks.length > 0) {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        this.audioChunks = [];

        // Send to Gemini for analysis
        await this.analyzeWithGemini(audioBlob);
      }
    };
  }

  /**
   * Send audio chunk to Gemini for intelligent analysis
   */
  private async analyzeWithGemini(audioBlob: Blob): Promise<void> {
    if (!this.genAI) return;

    try {
      // Convert blob to base64
      const arrayBuffer = await audioBlob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const base64Audio = btoa(
        Array.from(uint8Array).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );

      const prompt = `Analyze this audio clip and respond with ONLY a JSON object (no markdown, no explanation):
{
  "estimatedBpm": <number 0-200>,
  "genre": "<string>",
  "mood": "<calm|melancholic|neutral|energetic|euphoric>",
  "energy": <number 0-1>,
  "valence": <number 0-1 where 0=sad/melancholic, 1=happy/euphoric>,
  "hasVocals": <boolean>,
  "hasBeat": <boolean>,
  "instrumentalComplexity": <number 0-1>,
  "environmentType": "<music|speech|nature|urban|silence|mixed>",
  "noiseLevel": <number 0-1>
}`;

      const result = await this.genAI.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: 'audio/webm',
                data: base64Audio,
              },
            },
            { text: prompt },
          ],
        },
      });

      const responseText = result.text || '';

      if (!responseText) {
        throw new Error('Empty response from Gemini');
      }

      // Parse JSON from response (handle potential markdown wrapping)
      let jsonStr = responseText;
      if (responseText.includes('```')) {
        const match = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (match) jsonStr = match[1];
      }

      const analysis: GeminiAudioAnalysis = JSON.parse(jsonStr.trim());

      this.cache.lastAnalysis = analysis;
      this.cache.lastAnalysisTime = Date.now();

    } catch (error) {
      console.error('Gemini analysis failed:', error);
    }
  }

  /**
   * Start real-time audio analysis
   */
  start(onUpdate: (features: AudioFeatures) => void) {
    this.onFeaturesUpdate = onUpdate;
    this.isRunning = true;

    // Start MediaRecorder for periodic Gemini analysis
    if (this.mediaRecorder && this.genAI) {
      this.startPeriodicRecording();
    }

    this.processAudio();
  }

  /**
   * Start periodic recording for Gemini analysis
   */
  private startPeriodicRecording() {
    const recordChunk = () => {
      if (!this.isRunning || !this.mediaRecorder) return;

      if (this.mediaRecorder.state === 'inactive') {
        this.audioChunks = [];
        this.mediaRecorder.start();

        setTimeout(() => {
          if (this.mediaRecorder?.state === 'recording') {
            this.mediaRecorder.stop();
          }
          // Schedule next recording
          if (this.isRunning) {
            setTimeout(recordChunk, this.cache.analysisInterval);
          }
        }, 3000); // Record 3 seconds
      }
    };

    recordChunk();
  }

  /**
   * Process audio frame and extract features
   */
  private processAudio = () => {
    if (!this.isRunning || !this.analyser) return;

    // Get frequency and time domain data
    this.analyser.getByteFrequencyData(this.frequencyData);
    this.analyser.getByteTimeDomainData(this.timeDomainData);

    // Extract features
    const features = this.extractFeatures();

    // Notify listener
    if (this.onFeaturesUpdate) {
      this.onFeaturesUpdate(features);
    }

    // Continue processing
    this.animationFrameId = requestAnimationFrame(this.processAudio);
  };

  /**
   * Extract audio features from frequency and time domain data
   */
  private extractFeatures(): AudioFeatures {
    const binCount = this.frequencyData.length;

    // Calculate amplitude (RMS of time domain)
    let rmsSum = 0;
    for (let i = 0; i < this.timeDomainData.length; i++) {
      const normalized = (this.timeDomainData[i] - 128) / 128;
      rmsSum += normalized * normalized;
    }
    const amplitude = Math.sqrt(rmsSum / this.timeDomainData.length);

    // Frequency bands
    const bassEnd = Math.floor(binCount * 0.1);     // 0-10% = Bass
    const midEnd = Math.floor(binCount * 0.5);       // 10-50% = Mids
    // 50-100% = Treble

    // Calculate bass (low frequencies)
    let bassSum = 0;
    for (let i = 0; i < bassEnd; i++) {
      bassSum += this.frequencyData[i];
    }
    const bass = (bassSum / bassEnd) / 255;

    // Calculate treble (high frequencies)
    let trebleSum = 0;
    for (let i = midEnd; i < binCount; i++) {
      trebleSum += this.frequencyData[i];
    }
    const treble = (trebleSum / (binCount - midEnd)) / 255;

    // Calculate overall energy
    let energySum = 0;
    for (let i = 0; i < binCount; i++) {
      energySum += this.frequencyData[i];
    }
    const energy = (energySum / binCount) / 255;

    // Calculate spectral centroid (brightness)
    let weightedSum = 0;
    let magnitudeSum = 0;
    for (let i = 0; i < binCount; i++) {
      weightedSum += i * this.frequencyData[i];
      magnitudeSum += this.frequencyData[i];
    }
    const spectralCentroid = magnitudeSum > 0
      ? (weightedSum / magnitudeSum) / binCount
      : 0.5;

    // Simple beat detection
    const beatDetected = this.detectBeat(bass, amplitude);
    const bpm = this.estimateBpm();

    // Get Gemini analysis values (or defaults)
    const geminiValence = this.cache.lastAnalysis?.valence ?? 0.5;
    const geminiEnergy = this.cache.lastAnalysis?.energy ?? energy;
    const geminiBpm = this.cache.lastAnalysis?.estimatedBpm ?? bpm;
    const ambientNoise = this.cache.lastAnalysis?.noiseLevel ?? 0;

    // Blend real-time and Gemini analysis
    const blendedValence = this.cache.lastAnalysis
      ? geminiValence * 0.7 + spectralCentroid * 0.3
      : spectralCentroid;

    return {
      bpm: geminiBpm,
      energy: geminiEnergy * 0.5 + energy * 0.5,
      valence: blendedValence,
      amplitude,
      bass,
      treble,
      tempo: beatDetected ? 1 : 0,
      spectralCentroid,
      ambientNoise,
      timestamp: Date.now(),
      isPlaying: amplitude > 0.01,
    };
  }

  /**
   * Simple beat detection based on bass and amplitude
   */
  private detectBeat(bass: number, amplitude: number): boolean {
    const now = Date.now();
    const minBeatInterval = 200; // Minimum 200ms between beats (300 BPM max)

    if (now - this.lastBeatTime < minBeatInterval) {
      return false;
    }

    const beatMetric = bass * 0.7 + amplitude * 0.3;

    // Update beat history
    this.beatHistory.push(beatMetric);
    if (this.beatHistory.length > 30) {
      this.beatHistory.shift();
    }

    // Calculate adaptive threshold
    const avg = this.beatHistory.reduce((a, b) => a + b, 0) / this.beatHistory.length;
    const threshold = avg + this.beatThreshold;

    if (beatMetric > threshold) {
      this.lastBeatTime = now;
      return true;
    }

    return false;
  }

  /**
   * Estimate BPM from beat history
   */
  private estimateBpm(): number {
    if (this.beatHistory.length < 10) return 0;

    // Find peaks in beat history
    const peaks: number[] = [];
    for (let i = 1; i < this.beatHistory.length - 1; i++) {
      if (this.beatHistory[i] > this.beatHistory[i - 1] &&
          this.beatHistory[i] > this.beatHistory[i + 1]) {
        peaks.push(i);
      }
    }

    if (peaks.length < 2) return 0;

    // Calculate average interval between peaks
    let totalInterval = 0;
    for (let i = 1; i < peaks.length; i++) {
      totalInterval += peaks[i] - peaks[i - 1];
    }
    const avgInterval = totalInterval / (peaks.length - 1);

    // Convert to BPM (assuming ~60fps = ~16.67ms per frame)
    const bpm = (60 * 60) / (avgInterval * 16.67);

    return Math.min(200, Math.max(0, bpm));
  }

  /**
   * Stop audio analysis
   */
  stop() {
    this.isRunning = false;

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.mediaRecorder?.state === 'recording') {
      this.mediaRecorder.stop();
    }
  }

  /**
   * Clean up resources
   */
  dispose() {
    this.stop();

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.analyser = null;
    this.mediaRecorder = null;
    this.onFeaturesUpdate = null;
  }

  /**
   * Get current Gemini analysis
   */
  getGeminiAnalysis(): GeminiAudioAnalysis | null {
    return this.cache.lastAnalysis;
  }

  /**
   * Check if Gemini is available
   */
  hasGemini(): boolean {
    return this.genAI !== null;
  }
}

// Singleton instance
let audioServiceInstance: GeminiAudioService | null = null;

export function getAudioService(apiKey?: string): GeminiAudioService {
  if (!audioServiceInstance) {
    audioServiceInstance = new GeminiAudioService(apiKey);
  }
  return audioServiceInstance;
}

export function resetAudioService(): void {
  if (audioServiceInstance) {
    audioServiceInstance.dispose();
    audioServiceInstance = null;
  }
}
