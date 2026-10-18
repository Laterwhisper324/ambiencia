import type { Playlist, RoomPlaybackState, SceneButton, Track } from '../types';

const STORAGE_PASS_KEY = 'ambiencia_host_password';
const STORAGE_TOKEN_KEY = 'ambiencia_host_token';

export function getStoredHostPassword(): string {
  return localStorage.getItem(STORAGE_PASS_KEY) || 'mestre123';
}

export function setStoredHostPassword(pwd: string): void {
  localStorage.setItem(STORAGE_PASS_KEY, pwd);
}

export function getStoredHostToken(): string {
  return localStorage.getItem(STORAGE_TOKEN_KEY) || '';
}

export function setStoredHostToken(token: string): void {
  localStorage.setItem(STORAGE_TOKEN_KEY, token);
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'x-host-password': getStoredHostPassword(),
    'x-host-token': getStoredHostToken(),
    ...extra,
  };
}

async function handleResponse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Erro HTTP ${res.status}`);
  }
  return data as T;
}

export const api = {
  // Tracks
  async getTracks(search?: string, tag?: string): Promise<{ tracks: Track[]; maxUploadMb: number }> {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (tag) params.set('tag', tag);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(`/api/tracks${qs}`);
    return handleResponse(res);
  },

  async uploadMp3(
    file: File,
    options?: { title?: string; tags?: string[]; isAmbient?: boolean; durationSec?: number }
  ): Promise<{ track: Track }> {
    const formData = new FormData();
    formData.append('file', file);
    if (options?.title) formData.append('title', options.title);
    if (options?.tags) formData.append('tags', JSON.stringify(options.tags));
    if (options?.isAmbient !== undefined) formData.append('isAmbient', String(options.isAmbient));
    if (options?.durationSec !== undefined) formData.append('durationSec', String(options.durationSec));

    const res = await fetch('/api/tracks/upload', {
      method: 'POST',
      headers: authHeaders(),
      body: formData,
    });
    return handleResponse(res);
  },

  async addYouTubeTrack(payload: {
    url: string;
    title?: string;
    tags?: string[];
    isAmbient?: boolean;
  }): Promise<{ track: Track }> {
    const res = await fetch('/api/tracks/youtube', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    });
    return handleResponse(res);
  },

  async updateTrack(
    id: string,
    payload: { title?: string; tags?: string[]; isAmbient?: boolean; durationSec?: number }
  ): Promise<{ track: Track }> {
    const res = await fetch(`/api/tracks/${id}`, {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    });
    return handleResponse(res);
  },

  async deleteTrack(id: string): Promise<{ ok: boolean }> {
    const res = await fetch(`/api/tracks/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    return handleResponse(res);
  },

  // Playlists
  async getPlaylists(): Promise<{ playlists: Playlist[] }> {
    const res = await fetch('/api/playlists');
    return handleResponse(res);
  },

  async createPlaylist(payload: {
    name: string;
    description?: string;
    trackIds?: string[];
  }): Promise<{ playlist: Playlist }> {
    const res = await fetch('/api/playlists', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    });
    return handleResponse(res);
  },

  async updatePlaylist(
    id: string,
    payload: { name?: string; description?: string }
  ): Promise<{ playlist: Playlist }> {
    const res = await fetch(`/api/playlists/${id}`, {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    });
    return handleResponse(res);
  },

  async duplicatePlaylist(id: string, name?: string): Promise<{ playlist: Playlist }> {
    const res = await fetch(`/api/playlists/${id}/duplicate`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ name }),
    });
    return handleResponse(res);
  },

  async reorderPlaylistTracks(id: string, trackIds: string[]): Promise<{ playlist: Playlist }> {
    const res = await fetch(`/api/playlists/${id}/tracks`, {
      method: 'PUT',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ trackIds }),
    });
    return handleResponse(res);
  },

  async addTrackToPlaylist(id: string, trackId: string): Promise<{ playlist: Playlist }> {
    const res = await fetch(`/api/playlists/${id}/tracks`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ trackId }),
    });
    return handleResponse(res);
  },

  async deletePlaylist(id: string): Promise<{ ok: boolean }> {
    const res = await fetch(`/api/playlists/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    return handleResponse(res);
  },

  // Scenes
  async getScenes(): Promise<{ scenes: SceneButton[] }> {
    const res = await fetch('/api/scenes');
    return handleResponse(res);
  },

  async createScene(payload: {
    name: string;
    emoji: string;
    color: string;
    playlistId: string | null;
    ambientTrackId?: string | null;
    ambientVolume?: number;
    shortcutKey?: number | null;
  }): Promise<{ scene: SceneButton }> {
    const res = await fetch('/api/scenes', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    });
    return handleResponse(res);
  },

  async updateScene(
    id: string,
    payload: Partial<{
      name: string;
      emoji: string;
      color: string;
      playlistId: string | null;
      ambientTrackId: string | null;
      ambientVolume: number;
      shortcutKey: number | null;
    }>
  ): Promise<{ scene: SceneButton }> {
    const res = await fetch(`/api/scenes/${id}`, {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    });
    return handleResponse(res);
  },

  async deleteScene(id: string): Promise<{ ok: boolean }> {
    const res = await fetch(`/api/scenes/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    return handleResponse(res);
  },

  // Rooms & Auth
  async verifyHostAuth(password: string, code?: string): Promise<{
    valid: boolean;
    roomCode: string;
    hostToken: string;
    state: RoomPlaybackState;
  }> {
    const res = await fetch('/api/rooms/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, hostToken: getStoredHostToken(), code }),
    });
    return handleResponse(res);
  },

  async createRoom(name?: string, code?: string): Promise<{
    state: RoomPlaybackState;
    hostToken: string;
    sharePath: string;
  }> {
    const res = await fetch('/api/rooms', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ name, code }),
    });
    return handleResponse(res);
  },

  async getRoom(code: string): Promise<{ state: RoomPlaybackState }> {
    const res = await fetch(`/api/rooms/${encodeURIComponent(code)}`);
    return handleResponse(res);
  },
};
