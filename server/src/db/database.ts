import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { config } from '../config';
import type { Playlist, SceneButton, Track } from '../types';

const dbDir = path.dirname(config.databasePath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new Database(config.databasePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tracks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      source_type TEXT NOT NULL CHECK(source_type IN ('mp3', 'youtube')),
      storage_key TEXT,
      original_filename TEXT,
      mime_type TEXT,
      size_bytes INTEGER,
      youtube_id TEXT,
      youtube_url TEXT,
      thumbnail_url TEXT,
      duration_sec REAL NOT NULL DEFAULT 0,
      tags TEXT NOT NULL DEFAULT '[]',
      is_ambient INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS playlists (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS playlist_tracks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      playlist_id TEXT NOT NULL,
      track_id TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
      FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS scene_buttons (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      emoji TEXT NOT NULL,
      color TEXT NOT NULL,
      playlist_id TEXT,
      ambient_track_id TEXT,
      ambient_volume REAL NOT NULL DEFAULT 0.35,
      shortcut_key INTEGER,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE SET NULL,
      FOREIGN KEY (ambient_track_id) REFERENCES tracks(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS rooms (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      host_token TEXT NOT NULL,
      state_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}

interface TrackRow {
  id: string;
  title: string;
  source_type: 'mp3' | 'youtube';
  storage_key: string | null;
  original_filename: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  youtube_id: string | null;
  youtube_url: string | null;
  thumbnail_url: string | null;
  duration_sec: number;
  tags: string;
  is_ambient: number;
  created_at: string;
}

export function mapTrackRow(row: TrackRow): Track {
  let parsedTags: string[] = [];
  try {
    parsedTags = JSON.parse(row.tags);
  } catch {
    parsedTags = [];
  }
  return {
    id: row.id,
    title: row.title,
    sourceType: row.source_type,
    storageKey: row.storage_key,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    youtubeId: row.youtube_id,
    youtubeUrl: row.youtube_url,
    thumbnailUrl: row.thumbnail_url,
    durationSec: row.duration_sec,
    tags: Array.isArray(parsedTags) ? parsedTags : [],
    isAmbient: Boolean(row.is_ambient),
    createdAt: row.created_at,
  };
}

export function getAllTracks(search?: string, tag?: string): Track[] {
  const rows = db
    .prepare('SELECT * FROM tracks ORDER BY created_at DESC')
    .all() as TrackRow[];
  let tracks = rows.map(mapTrackRow);

  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    tracks = tracks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.tags.some((tg) => tg.toLowerCase().includes(q))
    );
  }

  if (tag && tag.trim()) {
    const tg = tag.trim().toLowerCase();
    tracks = tracks.filter((t) => t.tags.some((item) => item.toLowerCase() === tg));
  }

  return tracks;
}

export function getTrackById(id: string): Track | null {
  const row = db.prepare('SELECT * FROM tracks WHERE id = ?').get(id) as TrackRow | undefined;
  return row ? mapTrackRow(row) : null;
}

export function getPlaylistById(id: string): Playlist | null {
  const pRow = db.prepare('SELECT * FROM playlists WHERE id = ?').get(id) as
    | { id: string; name: string; description: string; created_at: string }
    | undefined;
  if (!pRow) return null;

  const trackRows = db
    .prepare(
      `SELECT t.* FROM playlist_tracks pt
       JOIN tracks t ON t.id = pt.track_id
       WHERE pt.playlist_id = ?
       ORDER BY pt.position ASC, pt.id ASC`
    )
    .all(id) as TrackRow[];

  return {
    id: pRow.id,
    name: pRow.name,
    description: pRow.description,
    tracks: trackRows.map(mapTrackRow),
    createdAt: pRow.created_at,
  };
}

export function getAllPlaylists(): Playlist[] {
  const pRows = db
    .prepare('SELECT * FROM playlists ORDER BY created_at ASC')
    .all() as Array<{ id: string; name: string; description: string; created_at: string }>;

  return pRows
    .map((p) => getPlaylistById(p.id))
    .filter((p): p is Playlist => p !== null);
}

interface SceneRow {
  id: string;
  name: string;
  emoji: string;
  color: string;
  playlist_id: string | null;
  ambient_track_id: string | null;
  ambient_volume: number;
  shortcut_key: number | null;
  position: number;
  created_at: string;
}

export function mapSceneRow(row: SceneRow): SceneButton {
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    color: row.color,
    playlistId: row.playlist_id,
    ambientTrackId: row.ambient_track_id,
    ambientVolume: row.ambient_volume,
    shortcutKey: row.shortcut_key,
    position: row.position,
    createdAt: row.created_at,
  };
}

export function getAllScenes(): SceneButton[] {
  const rows = db
    .prepare('SELECT * FROM scene_buttons ORDER BY position ASC, created_at ASC')
    .all() as SceneRow[];
  return rows.map(mapSceneRow);
}

export function getSceneById(id: string): SceneButton | null {
  const row = db
    .prepare('SELECT * FROM scene_buttons WHERE id = ?')
    .get(id) as SceneRow | undefined;
  return row ? mapSceneRow(row) : null;
}
