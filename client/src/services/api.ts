import type { MasterProfile, Playlist, RoomPlaybackState, SceneButton, Track } from '../types';

export interface CloudSyncStatus {
  enabled: boolean;
  provider: 'upstash-redis' | 'none';
  hydratedFromCloud: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  pendingSync: boolean;
  counts: {
    profiles: number;
    linkTracks: number;
    playlists: number;
    scenes: number;
  };
}

export interface CloudLibrarySnapshot {
  version: 1;
  savedAt: string;
  profiles: Array<{
    id: string;
    name: string;
    avatar: string;
    color: string;
    description: string;
    createdAt: string;
  }>;
  tracks: Array<{
    id: string;
    title: string;
    sourceType: 'youtube';
    youtubeId: string;
    youtubeUrl: string;
    thumbnailUrl: string | null;
    durationSec: number;
    tags: string[];
    isAmbient: boolean;
    createdAt: string;
  }>;
  playlists: Array<{
    id: string;
    profileId: string;
    name: string;
    description: string;
    trackIds: string[];
    createdAt: string;
  }>;
  scenes: Array<{
    id: string;
    profileId: string;
    name: string;
    emoji: string;
    color: string;
    playlistId: string | null;
    ambientTrackId: string | null;
    ambientVolume: number;
    shortcutKey: number | null;
    position: number;
    createdAt: string;
  }>;
}

const STORAGE_PASS_KEY = 'ambiencia_host_password';
const STORAGE_TOKEN_KEY = 'ambiencia_host_token';
const STORAGE_CLIENT_ID_KEY = 'ambiencia_client_id';
const STORAGE_PROFILE_ID_KEY = 'ambiencia_master_profile_id';

export const API_BASE_URL = (
  (import.meta.env.VITE_API_URL as string | undefined) ||
  (import.meta.env.VITE_SERVER_URL as string | undefined) ||
  ''
).replace(/\/+$/, '');

export function apiUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${cleanPath}`;
}

export function getTrackStreamUrl(trackId: string): string {
  return apiUrl(`/api/tracks/${trackId}/stream`);
}

export function getClientId(): string {
  let id = sessionStorage.getItem(STORAGE_CLIENT_ID_KEY);
  if (!id) {
    id = `cli_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    sessionStorage.setItem(STORAGE_CLIENT_ID_KEY, id);
  }
  return id;
}

export function getStoredHostPassword(): string {
  return localStorage.getItem(STORAGE_PASS_KEY) || '';
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

export function getStoredProfileId(): string {
  return localStorage.getItem(STORAGE_PROFILE_ID_KEY) || '';
}

export function setStoredProfileId(profileId: string): void {
  if (profileId) {
    localStorage.setItem(STORAGE_PROFILE_ID_KEY, profileId);
  } else {
    localStorage.removeItem(STORAGE_PROFILE_ID_KEY);
  }
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = {
    'x-host-password': getStoredHostPassword(),
    'x-host-token': getStoredHostToken(),
    ...extra,
  };
  const profileId = getStoredProfileId();
  if (profileId) {
    headers['x-master-profile-id'] = profileId;
  }
  return headers;
}

async function handleResponse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Erro HTTP ${res.status}`);
  }
  return data as T;
}

export const api = {
  // Master Profiles
  async getProfiles(): Promise<{ profiles: MasterProfile[] }> {
    const res = await fetch(apiUrl('/api/profiles'));
    return handleResponse(res);
  },

  async createProfile(payload: {
    name: string;
    avatar?: string;
    color?: string;
    description?: string;
  }): Promise<{ profile: MasterProfile }> {
    const res = await fetch(apiUrl('/api/profiles'), {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    });
    return handleResponse(res);
  },

  async updateProfile(
    id: string,
    payload: {
      name?: string;
      avatar?: string;
      color?: string;
      description?: string;
    }
  ): Promise<{ profile: MasterProfile }> {
    const res = await fetch(apiUrl(`/api/profiles/${encodeURIComponent(id)}`), {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    });
    return handleResponse(res);
  },

  async deleteProfile(id: string): Promise<{ ok: boolean; profiles: MasterProfile[] }> {
    const res = await fetch(apiUrl(`/api/profiles/${encodeURIComponent(id)}`), {
      method: 'DELETE',
      headers: authHeaders(),
    });
    return handleResponse(res);
  },

  // Tracks
  async getTracks(search?: string, tag?: string): Promise<{ tracks: Track[]; maxUploadMb: number }> {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (tag) params.set('tag', tag);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(apiUrl(`/api/tracks${qs}`));
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

    const res = await fetch(apiUrl('/api/tracks/upload'), {
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
    targetPlaylistId?: string;
    profileId?: string;
  }): Promise<{
    track: Track;
    tracks?: Track[];
    playlist?: Playlist;
    isPlaylistImport?: boolean;
  }> {
    const res = await fetch(apiUrl('/api/tracks/youtube'), {
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
    const res = await fetch(apiUrl(`/api/tracks/${id}`), {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    });
    return handleResponse(res);
  },

  async deleteTrack(id: string): Promise<{ ok: boolean }> {
    const res = await fetch(apiUrl(`/api/tracks/${id}`), {
      method: 'DELETE',
      headers: authHeaders(),
    });
    return handleResponse(res);
  },

  // Playlists
  async getPlaylists(profileId?: string): Promise<{ playlists: Playlist[] }> {
    const qs = profileId ? `?profileId=${encodeURIComponent(profileId)}` : '';
    const res = await fetch(apiUrl(`/api/playlists${qs}`));
    return handleResponse(res);
  },

  async createPlaylist(payload: {
    name: string;
    description?: string;
    trackIds?: string[];
    profileId?: string;
  }): Promise<{ playlist: Playlist }> {
    const res = await fetch(apiUrl('/api/playlists'), {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    });
    return handleResponse(res);
  },

  async updatePlaylist(
    id: string,
    payload: { name?: string; description?: string; profileId?: string }
  ): Promise<{ playlist: Playlist }> {
    const res = await fetch(apiUrl(`/api/playlists/${id}`), {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    });
    return handleResponse(res);
  },

  async duplicatePlaylist(
    id: string,
    name?: string,
    targetProfileId?: string
  ): Promise<{ playlist: Playlist }> {
    const res = await fetch(apiUrl(`/api/playlists/${id}/duplicate`), {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ name, targetProfileId }),
    });
    return handleResponse(res);
  },

  async reorderPlaylistTracks(id: string, trackIds: string[]): Promise<{ playlist: Playlist }> {
    const res = await fetch(apiUrl(`/api/playlists/${id}/tracks`), {
      method: 'PUT',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ trackIds }),
    });
    return handleResponse(res);
  },

  async addTrackToPlaylist(id: string, trackId: string): Promise<{ playlist: Playlist }> {
    const res = await fetch(apiUrl(`/api/playlists/${id}/tracks`), {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ trackId }),
    });
    return handleResponse(res);
  },

  async deletePlaylist(id: string): Promise<{ ok: boolean }> {
    const res = await fetch(apiUrl(`/api/playlists/${id}`), {
      method: 'DELETE',
      headers: authHeaders(),
    });
    return handleResponse(res);
  },

  // Scenes
  async getScenes(profileId?: string): Promise<{ scenes: SceneButton[] }> {
    const qs = profileId ? `?profileId=${encodeURIComponent(profileId)}` : '';
    const res = await fetch(apiUrl(`/api/scenes${qs}`));
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
    profileId?: string;
  }): Promise<{ scene: SceneButton }> {
    const res = await fetch(apiUrl('/api/scenes'), {
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
    const res = await fetch(apiUrl(`/api/scenes/${id}`), {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    });
    return handleResponse(res);
  },

  async deleteScene(id: string): Promise<{ ok: boolean }> {
    const res = await fetch(apiUrl(`/api/scenes/${id}`), {
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
    const res = await fetch(apiUrl('/api/rooms/auth'), {
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
    const res = await fetch(apiUrl('/api/rooms'), {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ name, code }),
    });
    return handleResponse(res);
  },

  async getRoom(code: string): Promise<{
    state: RoomPlaybackState;
    isHost?: boolean;
    hostToken?: string;
  }> {
    const clientId = getClientId();
    const res = await fetch(
      apiUrl(`/api/rooms/${encodeURIComponent(code)}?clientId=${encodeURIComponent(clientId)}`),
      {
        headers: authHeaders(),
      }
    );
    return handleResponse(res);
  },

  async sendRoomCommand(
    code: string,
    payload: Record<string, unknown>
  ): Promise<{ ok: boolean; state?: RoomPlaybackState; error?: string }> {
    const res = await fetch(apiUrl(`/api/rooms/${encodeURIComponent(code)}/command`), {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        ...payload,
        code,
        clientId: getClientId(),
        password: getStoredHostPassword(),
        hostToken: getStoredHostToken(),
      }),
    });
    return handleResponse(res);
  },

  // Cloud Persistence & JSON Backup
  async getBackupStatus(): Promise<{ status: CloudSyncStatus }> {
    const res = await fetch(apiUrl('/api/backup/status'));
    return handleResponse(res);
  },

  async exportBackupJson(): Promise<{ snapshot: CloudLibrarySnapshot }> {
    const res = await fetch(apiUrl('/api/backup/export'), {
      headers: authHeaders(),
    });
    return handleResponse(res);
  },

  async importBackupJson(
    snapshot: unknown,
    mode: 'merge' | 'replace' = 'merge'
  ): Promise<{
    ok: boolean;
    mode: 'merge' | 'replace';
    result: {
      profilesRestored: number;
      tracksRestored: number;
      playlistsRestored: number;
      scenesRestored: number;
      droppedLocalTrackRefs: number;
    };
    syncedToCloud: boolean;
    status: CloudSyncStatus;
  }> {
    const res = await fetch(apiUrl('/api/backup/import'), {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ snapshot, mode }),
    });
    return handleResponse(res);
  },

  async forceCloudSync(): Promise<{ ok: boolean; status: CloudSyncStatus }> {
    const res = await fetch(apiUrl('/api/backup/sync'), {
      method: 'POST',
      headers: authHeaders(),
    });
    return handleResponse(res);
  },
};
