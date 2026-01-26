/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GEMINI_API_KEY: string;
  readonly VITE_SPOTIFY_CLIENT_ID: string;
  readonly VITE_SPOTIFY_CLIENT_SECRET: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Spotify Embed types
interface SpotifyPlayer {
  play(): void;
  pause(): void;
  getCurrentState(): Promise<SpotifyPlayerState | null>;
  setVolume(volume: number): void;
  getVolume(): Promise<number>;
}

interface SpotifyPlayerState {
  paused: boolean;
  position: number;
  duration: number;
  track_window: {
    current_track: {
      name: string;
      artists: Array<{ name: string }>;
    };
  };
}

