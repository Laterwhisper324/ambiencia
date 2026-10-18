export type TrackSourceType = 'mp3' | 'youtube';
export type RepeatMode = 'none' | 'track' | 'playlist';
export type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected';

export interface Track {
  id: string;
  title: string;
  sourceType: TrackSourceType;
  storageKey: string | null;
  originalFilename: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  youtubeId: string | null;
  youtubeUrl: string | null;
  thumbnailUrl: string | null;
  durationSec: number;
  tags: string[];
  isAmbient: boolean;
  createdAt: string;
}

export interface Playlist {
  id: string;
  name: string;
  description: string;
  tracks: Track[];
  createdAt: string;
}

export interface SceneButton {
  id: string;
  name: string;
  emoji: string;
  color: string;
  playlistId: string | null;
  ambientTrackId: string | null;
  ambientVolume: number;
  shortcutKey: number | null;
  position: number;
  createdAt: string;
}

export interface RoomPlaybackState {
  code: string;
  name: string;
  activeSceneId: string | null;
  activePlaylistId: string | null;
  currentTrack: Track | null;
  queue: Track[];
  currentIndex: number;
  isPlaying: boolean;
  positionSec: number;
  updatedAt: number;
  serverNow: number;
  volume: number;
  shuffle: boolean;
  repeatMode: RepeatMode;
  crossfadeSec: number;
  ambientTrack: Track | null;
  ambientIsPlaying: boolean;
  ambientVolume: number;
  listenerCount: number;
}
