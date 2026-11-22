import { z } from 'zod';
import {
  db,
  DEFAULT_PROFILE_ID,
  ensureDefaultProfile,
  getAllPlaylists,
  getAllProfiles,
  getAllScenes,
  getAllTracks,
  getPlaylistById,
  getSceneById,
  getTrackById,
  registerDbChangeListener,
} from './database';
import { getRedisClient } from '../socket/roomManager';

const REDIS_SNAPSHOT_KEY = process.env.CLOUD_BACKUP_REDIS_KEY || 'ambiencia:library:v1';
const SYNC_DEBOUNCE_MS = 600;

/**
 * Built-in synthesized demo audio tracks generated automatically on every startup
 * by ensureSeedData(). References to these IDs remain valid across Render restarts,
 * while user-uploaded MP3/M4A files are intentionally excluded from cloud persistence.
 */
export const SEED_DEMO_TRACK_IDS = new Set<string>([
  'track-forest-1',
  'track-battle-1',
  'track-tavern-1',
  'track-suspense-1',
  'track-amb-rain',
  'track-amb-fire',
  'track-amb-ocean',
]);

export interface PersistedProfile {
  id: string;
  name: string;
  avatar: string;
  color: string;
  description: string;
  createdAt: string;
}

export interface PersistedLinkTrack {
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
}

export interface PersistedPlaylist {
  id: string;
  profileId: string;
  name: string;
  description: string;
  trackIds: string[];
  createdAt: string;
}

export interface PersistedSceneButton {
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
}

export interface CloudLibrarySnapshot {
  version: 1;
  savedAt: string;
  profiles: PersistedProfile[];
  tracks: PersistedLinkTrack[];
  playlists: PersistedPlaylist[];
  scenes: PersistedSceneButton[];
}

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

export interface ApplySnapshotResult {
  profilesRestored: number;
  tracksRestored: number;
  playlistsRestored: number;
  scenesRestored: number;
  droppedLocalTrackRefs: number;
}

const persistedProfileSchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().min(1).max(60),
  avatar: z.string().max(16).optional().default('🎭'),
  color: z.string().max(32).optional().default('#cc001e'),
  description: z.string().max(250).optional().default(''),
  createdAt: z.string().optional(),
});

const persistedTrackSchema = z.object({
  id: z.string().min(1).max(120),
  title: z.string().min(1).max(200),
  sourceType: z.enum(['youtube', 'mp3']).optional().default('youtube'),
  youtubeId: z.string().nullable().optional(),
  youtubeUrl: z.string().nullable().optional(),
  thumbnailUrl: z.string().nullable().optional(),
  durationSec: z.number().min(0).optional().default(0),
  tags: z.array(z.string()).optional().default([]),
  isAmbient: z.boolean().optional().default(false),
  createdAt: z.string().optional(),
});

const persistedPlaylistSchema = z.object({
  id: z.string().min(1).max(120),
  profileId: z.string().max(120).optional(),
  name: z.string().min(1).max(120),
  description: z.string().max(400).optional().default(''),
  trackIds: z.array(z.string()).optional().default([]),
  createdAt: z.string().optional(),
});

const persistedSceneSchema = z.object({
  id: z.string().min(1).max(120),
  profileId: z.string().max(120).optional(),
  name: z.string().min(1).max(80),
  emoji: z.string().max(16).optional().default('🎭'),
  color: z.string().max(32).optional().default('#10b981'),
  playlistId: z.string().nullable().optional().default(null),
  ambientTrackId: z.string().nullable().optional().default(null),
  ambientVolume: z.number().min(0).max(1).optional().default(0.35),
  shortcutKey: z.number().int().min(1).max(9).nullable().optional().default(null),
  position: z.number().int().min(0).optional().default(0),
  createdAt: z.string().optional(),
});

export const cloudLibrarySnapshotSchema = z.object({
  version: z.number().int().optional().default(1),
  savedAt: z.string().optional(),
  profiles: z.array(persistedProfileSchema).optional().default([]),
  tracks: z.array(persistedTrackSchema).optional().default([]),
  playlists: z.array(persistedPlaylistSchema).optional().default([]),
  scenes: z.array(persistedSceneSchema).optional().default([]),
});

let isHydrating = false;
let hydratedFromCloud = false;
let lastSyncAt: string | null = null;
let lastError: string | null = null;
let syncTimer: ReturnType<typeof setTimeout> | null = null;
let syncInFlight: Promise<boolean> | null = null;
let listenerRegistered = false;

/**
 * Builds a clean, JSON-serializable snapshot of all persistent data:
 * - All Master Profiles
 * - All link-based tracks (YouTube / YouTube Music) — local uploaded MP3/M4A binaries are excluded
 * - All Playlists (keeping link tracks and built-in demo tracks; silently excluding local uploaded MP3/M4A refs)
 * - All Scene Buttons (clearing ambientTrackId only if it points to a local uploaded MP3/M4A)
 */
export function buildLibrarySnapshot(): CloudLibrarySnapshot {
  const allTracks = getAllTracks();
  const linkTracks: PersistedLinkTrack[] = allTracks
    .filter((t) => t.sourceType === 'youtube' && Boolean(t.youtubeId))
    .map((t) => ({
      id: t.id,
      title: t.title,
      sourceType: 'youtube',
      youtubeId: t.youtubeId as string,
      youtubeUrl: t.youtubeUrl || `https://www.youtube.com/watch?v=${t.youtubeId}`,
      thumbnailUrl: t.thumbnailUrl || `https://i.ytimg.com/vi/${t.youtubeId}/hqdefault.jpg`,
      durationSec: t.durationSec || 0,
      tags: Array.isArray(t.tags) ? t.tags : [],
      isAmbient: Boolean(t.isAmbient),
      createdAt: t.createdAt,
    }));

  const persistableTrackIds = new Set<string>([
    ...linkTracks.map((t) => t.id),
    ...SEED_DEMO_TRACK_IDS,
  ]);

  const profiles: PersistedProfile[] = getAllProfiles().map((p) => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    color: p.color,
    description: p.description,
    createdAt: p.createdAt,
  }));

  const playlists: PersistedPlaylist[] = getAllPlaylists().map((pl) => ({
    id: pl.id,
    profileId: pl.profileId || DEFAULT_PROFILE_ID,
    name: pl.name,
    description: pl.description,
    trackIds: pl.tracks
      .map((t) => t.id)
      .filter((tid) => persistableTrackIds.has(tid)),
    createdAt: pl.createdAt,
  }));

  const scenes: PersistedSceneButton[] = getAllScenes().map((sc) => ({
    id: sc.id,
    profileId: sc.profileId || DEFAULT_PROFILE_ID,
    name: sc.name,
    emoji: sc.emoji,
    color: sc.color,
    playlistId: sc.playlistId,
    ambientTrackId:
      sc.ambientTrackId && persistableTrackIds.has(sc.ambientTrackId)
        ? sc.ambientTrackId
        : null,
    ambientVolume: sc.ambientVolume,
    shortcutKey: sc.shortcutKey,
    position: sc.position,
    createdAt: sc.createdAt,
  }));

  return {
    version: 1,
    savedAt: new Date().toISOString(),
    profiles,
    tracks: linkTracks,
    playlists,
    scenes,
  };
}

/**
 * Applies a validated snapshot into the local SQLite / JsonFallback database.
 * - mode 'replace': replaces existing profiles, link tracks, playlists, and scenes with the snapshot
 *   (used on cold-start hydration from Upstash Redis or full restore).
 * - mode 'merge': upserts snapshot items while keeping existing data untouched.
 * Local uploaded MP3/M4A track references that no longer exist are silently skipped.
 */
export function applyLibrarySnapshot(
  rawInput: unknown,
  options: { mode?: 'merge' | 'replace' } = {}
): ApplySnapshotResult {
  const parsed = cloudLibrarySnapshotSchema.parse(rawInput);
  const mode = options.mode ?? 'merge';
  const now = new Date().toISOString();

  const linkTracks = parsed.tracks.filter(
    (t) => t.sourceType === 'youtube' && typeof t.youtubeId === 'string' && t.youtubeId.trim().length > 0
  );

  let droppedLocalTrackRefs = 0;
  let profilesRestored = 0;
  let tracksRestored = 0;
  let playlistsRestored = 0;
  let scenesRestored = 0;

  const prevHydrating = isHydrating;
  isHydrating = true;

  try {
    const applyTx = db.transaction(() => {
      // 1. In replace mode, clear old scenes, playlists, and YouTube tracks first
      if (mode === 'replace') {
        const existingScenes = getAllScenes();
        for (const sc of existingScenes) {
          db.prepare('DELETE FROM scene_buttons WHERE id = ?').run(sc.id);
        }

        const existingPlaylists = getAllPlaylists();
        for (const pl of existingPlaylists) {
          db.prepare('DELETE FROM playlists WHERE id = ?').run(pl.id);
        }

        const existingTracks = getAllTracks();
        for (const tr of existingTracks) {
          if (tr.sourceType === 'youtube') {
            db.prepare('DELETE FROM tracks WHERE id = ?').run(tr.id);
          }
        }
      }

      // 2. Upsert Master Profiles
      const incomingProfiles: PersistedProfile[] =
        parsed.profiles.length > 0
          ? parsed.profiles.map((p) => ({
              id: p.id.trim(),
              name: p.name.trim().slice(0, 60),
              avatar: (p.avatar || '🎭').trim().slice(0, 8) || '🎭',
              color: (p.color || '#cc001e').trim().slice(0, 24) || '#cc001e',
              description: (p.description || '').trim().slice(0, 200),
              createdAt: p.createdAt || now,
            }))
          : [];

      const upsertProfileStmt = db.prepare(`
        INSERT OR REPLACE INTO master_profiles (id, name, avatar, color, description, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      for (const prof of incomingProfiles) {
        upsertProfileStmt.run(
          prof.id,
          prof.name,
          prof.avatar,
          prof.color,
          prof.description,
          prof.createdAt
        );
        profilesRestored += 1;
      }

      if (mode === 'replace' && incomingProfiles.length > 0) {
        const keepProfileIds = new Set(incomingProfiles.map((p) => p.id));
        const currentProfiles = getAllProfiles();
        for (const prof of currentProfiles) {
          if (!keepProfileIds.has(prof.id)) {
            db.prepare('DELETE FROM master_profiles WHERE id = ?').run(prof.id);
          }
        }
      }

      // Guarantee at least one valid profile exists
      const activeProfiles = getAllProfiles();
      if (activeProfiles.length === 0) {
        ensureDefaultProfile();
      }
      const validProfileIds = new Set(getAllProfiles().map((p) => p.id));
      const fallbackProfileId = getAllProfiles()[0]?.id || DEFAULT_PROFILE_ID;

      // 3. Upsert Link Tracks (using 14 bound parameters so both node:sqlite and JsonFallbackDatabase persist all fields)
      const insertTrackStmt = db.prepare(`
        INSERT OR IGNORE INTO tracks (
          id, title, source_type, storage_key, original_filename, mime_type,
          size_bytes, youtube_id, youtube_url, thumbnail_url, duration_sec, tags, is_ambient, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const updateTrackStmt = db.prepare(`
        UPDATE tracks
        SET title = ?, tags = ?, is_ambient = ?, duration_sec = ?
        WHERE id = ?
      `);

      for (const tr of linkTracks) {
        const ytId = (tr.youtubeId || '').trim();
        const ytUrl = (tr.youtubeUrl || `https://www.youtube.com/watch?v=${ytId}`).trim();
        const thumbUrl = tr.thumbnailUrl || `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`;
        const cleanTags = Array.isArray(tr.tags)
          ? tr.tags.map((tg) => String(tg).trim()).filter(Boolean)
          : ['youtube'];
        if (!cleanTags.includes('youtube')) {
          cleanTags.push('youtube');
        }

        const existing = getTrackById(tr.id);
        if (existing) {
          updateTrackStmt.run(
            tr.title.trim().slice(0, 140),
            JSON.stringify(cleanTags),
            tr.isAmbient ? 1 : 0,
            tr.durationSec || 0,
            tr.id
          );
        } else {
          insertTrackStmt.run(
            tr.id,
            tr.title.trim().slice(0, 140),
            'youtube',
            null,
            null,
            null,
            null,
            ytId,
            ytUrl,
            thumbUrl,
            tr.durationSec || 0,
            JSON.stringify(cleanTags),
            tr.isAmbient ? 1 : 0,
            tr.createdAt || now
          );
        }
        tracksRestored += 1;
      }

      // 4. Upsert Playlists & Playlist Track mappings (silently dropping missing local MP3/M4A refs)
      const insertPlaylistStmt = db.prepare(`
        INSERT INTO playlists (id, profile_id, name, description, created_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      const updatePlaylistStmt = db.prepare(`
        UPDATE playlists SET name = ?, description = ?, profile_id = ? WHERE id = ?
      `);
      const clearPtStmt = db.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ?');
      const insertPtStmt = db.prepare(`
        INSERT INTO playlist_tracks (playlist_id, track_id, position)
        VALUES (?, ?, ?)
      `);

      for (const pl of parsed.playlists) {
        const targetProfileId =
          pl.profileId && validProfileIds.has(pl.profileId)
            ? pl.profileId
            : fallbackProfileId;

        const existingPl = getPlaylistById(pl.id);
        if (existingPl) {
          updatePlaylistStmt.run(
            pl.name.trim().slice(0, 100),
            (pl.description || '').trim().slice(0, 300),
            targetProfileId,
            pl.id
          );
          clearPtStmt.run(pl.id);
        } else {
          insertPlaylistStmt.run(
            pl.id,
            targetProfileId,
            pl.name.trim().slice(0, 100),
            (pl.description || '').trim().slice(0, 300),
            pl.createdAt || now
          );
        }

        let pos = 0;
        for (const tid of pl.trackIds || []) {
          if (typeof tid === 'string' && getTrackById(tid)) {
            insertPtStmt.run(pl.id, tid, pos);
            pos += 1;
          } else {
            droppedLocalTrackRefs += 1;
          }
        }
        playlistsRestored += 1;
      }

      // 5. Upsert Scene Buttons
      const insertSceneStmt = db.prepare(`
        INSERT INTO scene_buttons (
          id, profile_id, name, emoji, color, playlist_id, ambient_track_id,
          ambient_volume, shortcut_key, position, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const updateSceneStmt = db.prepare(`
        UPDATE scene_buttons
        SET name = ?, emoji = ?, color = ?, playlist_id = ?, ambient_track_id = ?,
            ambient_volume = ?, shortcut_key = ?, position = ?
        WHERE id = ?
      `);

      for (const sc of parsed.scenes) {
        const targetProfileId =
          sc.profileId && validProfileIds.has(sc.profileId)
            ? sc.profileId
            : fallbackProfileId;

        const validPlaylistId =
          sc.playlistId && getPlaylistById(sc.playlistId) ? sc.playlistId : null;
        let validAmbientId: string | null = null;
        if (sc.ambientTrackId) {
          if (getTrackById(sc.ambientTrackId)) {
            validAmbientId = sc.ambientTrackId;
          } else {
            droppedLocalTrackRefs += 1;
          }
        }

        const safeVolume = Math.max(0, Math.min(1, sc.ambientVolume ?? 0.35));
        const safeShortcut =
          typeof sc.shortcutKey === 'number' && sc.shortcutKey >= 1 && sc.shortcutKey <= 9
            ? sc.shortcutKey
            : null;

        const existingSc = getSceneById(sc.id);
        if (existingSc) {
          updateSceneStmt.run(
            sc.name.trim().slice(0, 60),
            (sc.emoji || '🎭').trim().slice(0, 8),
            (sc.color || '#10b981').trim().slice(0, 24),
            validPlaylistId,
            validAmbientId,
            safeVolume,
            safeShortcut,
            sc.position ?? 0,
            sc.id
          );
        } else {
          insertSceneStmt.run(
            sc.id,
            targetProfileId,
            sc.name.trim().slice(0, 60),
            (sc.emoji || '🎭').trim().slice(0, 8),
            (sc.color || '#10b981').trim().slice(0, 24),
            validPlaylistId,
            validAmbientId,
            safeVolume,
            safeShortcut,
            sc.position ?? 0,
            sc.createdAt || now
          );
        }
        scenesRestored += 1;
      }
    });

    applyTx();
  } finally {
    isHydrating = prevHydrating;
  }

  return {
    profilesRestored,
    tracksRestored,
    playlistsRestored,
    scenesRestored,
    droppedLocalTrackRefs,
  };
}

/**
 * Immediately saves the current link-based library, profiles, playlists, and scenes
 * to Upstash Redis. Safe no-op when Redis credentials are not configured.
 */
export async function syncToCloudNow(): Promise<boolean> {
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }

  const redis = getRedisClient();
  if (!redis) {
    return false;
  }

  if (syncInFlight) {
    return syncInFlight;
  }

  syncInFlight = (async () => {
    try {
      const snapshot = buildLibrarySnapshot();
      await redis.set(REDIS_SNAPSHOT_KEY, JSON.stringify(snapshot));
      lastSyncAt = snapshot.savedAt;
      lastError = null;
      console.log(
        `[CloudSync] Snapshot salvo no Upstash Redis (${snapshot.profiles.length} perfis, ${snapshot.tracks.length} links, ${snapshot.playlists.length} playlists, ${snapshot.scenes.length} cenas).`
      );
      return true;
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'Erro desconhecido ao sincronizar no Redis.';
      console.warn('[CloudSync] Erro ao salvar snapshot no Upstash Redis:', err);
      return false;
    } finally {
      syncInFlight = null;
    }
  })();

  return syncInFlight;
}

/**
 * Schedules a debounced cloud sync after database mutations so bursts
 * (e.g. importing a YouTube playlist) coalesce into a single Redis write.
 */
export function scheduleCloudSync(): void {
  if (isHydrating) return;
  const redis = getRedisClient();
  if (!redis) return;

  if (syncTimer) {
    clearTimeout(syncTimer);
  }
  syncTimer = setTimeout(() => {
    syncTimer = null;
    void syncToCloudNow();
  }, SYNC_DEBOUNCE_MS);
}

/**
 * Registers the automatic DB mutation listener once.
 */
export function registerCloudPersistenceHook(): void {
  if (listenerRegistered) return;
  listenerRegistered = true;
  registerDbChangeListener(() => {
    scheduleCloudSync();
  });
}

/**
 * Attempts to hydrate the local database from Upstash Redis on server cold start.
 * Returns true if a valid cloud snapshot was found and applied.
 */
export async function hydrateFromCloudOnStartup(): Promise<boolean> {
  registerCloudPersistenceHook();

  const redis = getRedisClient();
  if (!redis) {
    console.log(
      '[CloudSync] Upstash Redis não configurado (defina UPSTASH_REDIS_REST_URL e UPSTASH_REDIS_REST_TOKEN para persistência em nuvem).'
    );
    return false;
  }

  try {
    const raw = await redis.get<string | CloudLibrarySnapshot>(REDIS_SNAPSHOT_KEY);
    if (!raw) {
      console.log('[CloudSync] Nenhum snapshot anterior encontrado no Upstash Redis (primeiro boot).');
      return false;
    }

    const parsedData = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const result = applyLibrarySnapshot(parsedData, { mode: 'replace' });
    hydratedFromCloud = true;
    lastSyncAt =
      typeof parsedData?.savedAt === 'string' ? parsedData.savedAt : new Date().toISOString();
    lastError = null;

    console.log(
      `[CloudSync] Biblioteca restaurada do Upstash Redis: ${result.profilesRestored} perfis, ${result.tracksRestored} links, ${result.playlistsRestored} playlists, ${result.scenesRestored} cenas` +
        (result.droppedLocalTrackRefs > 0
          ? ` (${result.droppedLocalTrackRefs} refs locais de MP3/M4A ignoradas).`
          : '.')
    );
    return true;
  } catch (err) {
    lastError = err instanceof Error ? err.message : 'Erro ao hidratar dados do Upstash Redis.';
    console.error('[CloudSync] Falha ao restaurar snapshot do Upstash Redis:', err);
    return false;
  }
}

export function getCloudSyncStatus(): CloudSyncStatus {
  const redis = getRedisClient();
  const snapshot = buildLibrarySnapshot();
  return {
    enabled: Boolean(redis),
    provider: redis ? 'upstash-redis' : 'none',
    hydratedFromCloud,
    lastSyncAt,
    lastError,
    pendingSync: Boolean(syncTimer || syncInFlight),
    counts: {
      profiles: snapshot.profiles.length,
      linkTracks: snapshot.tracks.length,
      playlists: snapshot.playlists.length,
      scenes: snapshot.scenes.length,
    },
  };
}
