import fs from 'fs';
import path from 'path';
import { config } from '../config';
import type { Playlist, SceneButton, Track } from '../types';

export interface StatementLike {
  run: (...params: any[]) => any;
  get: (...params: any[]) => any;
  all: (...params: any[]) => any[];
}

export interface DatabaseLike {
  exec: (sql: string) => void;
  pragma: (sql: string) => void;
  prepare: (sql: string) => StatementLike;
  transaction: <T extends (...args: any[]) => any>(fn: T) => T;
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

interface PlaylistRow {
  id: string;
  name: string;
  description: string;
  created_at: string;
}

interface PlaylistTrackRow {
  id: number;
  playlist_id: string;
  track_id: string;
  position: number;
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

interface RoomRow {
  code: string;
  name: string;
  host_token: string;
  state_json: string;
  created_at: string;
}

interface JsonStoreData {
  tracks: TrackRow[];
  playlists: PlaylistRow[];
  playlist_tracks: PlaylistTrackRow[];
  scene_buttons: SceneRow[];
  rooms: RoomRow[];
  nextPtId: number;
}

/**
 * Pure TypeScript JSON-backed fallback database used when running in serverless
 * environments (e.g. Vercel) where native C++ SQLite bindings are unavailable.
 */
class JsonFallbackDatabase implements DatabaseLike {
  private readonly filePath: string;
  private data: JsonStoreData;

  constructor(dbPath: string) {
    this.filePath = `${dbPath}.json`;
    this.data = this.load();
  }

  private load(): JsonStoreData {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        return JSON.parse(raw) as JsonStoreData;
      }
    } catch (err) {
      console.warn('[DB Fallback] Aviso ao ler JSON store:', err);
    }
    return {
      tracks: [],
      playlists: [],
      playlist_tracks: [],
      scene_buttons: [],
      rooms: [],
      nextPtId: 1,
    };
  }

  private save(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.data), 'utf-8');
    } catch (err) {
      console.warn('[DB Fallback] Aviso ao salvar JSON store:', err);
    }
  }

  exec(_sql: string): void {
    // Schema creation no-op for JSON fallback
  }

  pragma(_sql: string): void {
    // Pragma no-op for JSON fallback
  }

  transaction<T extends (...args: any[]) => any>(fn: T): T {
    return ((...args: any[]) => {
      const res = fn(...args);
      this.save();
      return res;
    }) as T;
  }

  prepare(sql: string): StatementLike {
    const norm = sql.replace(/\s+/g, ' ').trim();
    const normLower = norm.toLowerCase();

    return {
      get: (...params: any[]) => {
        if (normLower.includes('select count(*) as total from playlists')) {
          return { total: this.data.playlists.length };
        }
        if (normLower.includes('from tracks where id = ?')) {
          return this.data.tracks.find((t) => t.id === params[0]);
        }
        if (normLower.includes('from playlists where id = ?')) {
          return this.data.playlists.find((p) => p.id === params[0]);
        }
        if (normLower.includes('from scene_buttons where id = ?')) {
          return this.data.scene_buttons.find((s) => s.id === params[0]);
        }
        if (normLower.includes('from rooms where code = ?')) {
          return this.data.rooms.find((r) => r.code === params[0]);
        }
        if (normLower.includes('from rooms where host_token = ?')) {
          return this.data.rooms.find((r) => r.host_token === params[0]);
        }
        return undefined;
      },

      all: (...params: any[]) => {
        if (normLower.includes('from tracks order by created_at desc')) {
          return [...this.data.tracks].sort((a, b) =>
            b.created_at.localeCompare(a.created_at)
          );
        }
        if (normLower.includes('from playlists order by created_at asc')) {
          return [...this.data.playlists].sort((a, b) =>
            a.created_at.localeCompare(b.created_at)
          );
        }
        if (normLower.includes('from playlist_tracks pt join tracks t')) {
          const plId = params[0];
          const pts = this.data.playlist_tracks
            .filter((pt) => pt.playlist_id === plId)
            .sort((a, b) => a.position - b.position || a.id - b.id);
          return pts
            .map((pt) => this.data.tracks.find((t) => t.id === pt.track_id))
            .filter((t): t is TrackRow => Boolean(t));
        }
        if (normLower.includes('from scene_buttons order by position asc')) {
          return [...this.data.scene_buttons].sort(
            (a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at)
          );
        }
        return [];
      },

      run: (...params: any[]) => {
        // Tracks
        if (normLower.startsWith('insert') && normLower.includes('into tracks')) {
          const isMp3Literal = normLower.includes("'mp3'");
          const isYtLiteral = normLower.includes("'youtube'");
          let row: TrackRow;

          if (isMp3Literal) {
            row = {
              id: params[0],
              title: params[1],
              source_type: 'mp3',
              storage_key: params[2],
              original_filename: params[3],
              mime_type: params[4],
              size_bytes: params[5],
              youtube_id: null,
              youtube_url: null,
              thumbnail_url: null,
              duration_sec: params[6],
              tags: params[7],
              is_ambient: params[8],
              created_at: params[9],
            };
          } else if (isYtLiteral) {
            row = {
              id: params[0],
              title: params[1],
              source_type: 'youtube',
              storage_key: null,
              original_filename: null,
              mime_type: null,
              size_bytes: null,
              youtube_id: params[2],
              youtube_url: params[3],
              thumbnail_url: params[4],
              duration_sec: 0,
              tags: params[5],
              is_ambient: params[6],
              created_at: params[7],
            };
          } else {
            row = {
              id: params[0],
              title: params[1],
              source_type: params[2],
              storage_key: params[3],
              original_filename: params[4],
              mime_type: params[5],
              size_bytes: params[6],
              youtube_id: params[7],
              youtube_url: params[8],
              thumbnail_url: params[9],
              duration_sec: params[10],
              tags: params[11],
              is_ambient: params[12],
              created_at: params[13],
            };
          }

          const existingIdx = this.data.tracks.findIndex((t) => t.id === row.id);
          if (existingIdx === -1) {
            this.data.tracks.push(row);
          }
          this.save();
          return { changes: 1 };
        }

        if (normLower.startsWith('update tracks')) {
          const [title, tags, is_ambient, duration_sec, id] = params;
          const t = this.data.tracks.find((item) => item.id === id);
          if (t) {
            t.title = title;
            t.tags = tags;
            t.is_ambient = is_ambient;
            t.duration_sec = duration_sec;
            this.save();
          }
          return { changes: t ? 1 : 0 };
        }

        if (normLower.startsWith('delete from tracks where id = ?')) {
          const id = params[0];
          this.data.tracks = this.data.tracks.filter((t) => t.id !== id);
          this.data.playlist_tracks = this.data.playlist_tracks.filter(
            (pt) => pt.track_id !== id
          );
          this.data.scene_buttons.forEach((s) => {
            if (s.ambient_track_id === id) s.ambient_track_id = null;
          });
          this.save();
          return { changes: 1 };
        }

        // Playlists
        if (normLower.startsWith('insert into playlists')) {
          const [id, name, description, created_at] = params;
          this.data.playlists.push({ id, name, description, created_at });
          this.save();
          return { changes: 1 };
        }

        if (normLower.startsWith('update playlists set name = ?')) {
          const [name, description, id] = params;
          const pl = this.data.playlists.find((p) => p.id === id);
          if (pl) {
            pl.name = name;
            pl.description = description;
            this.save();
          }
          return { changes: pl ? 1 : 0 };
        }

        if (normLower.startsWith('delete from playlists where id = ?')) {
          const id = params[0];
          this.data.playlists = this.data.playlists.filter((p) => p.id !== id);
          this.data.playlist_tracks = this.data.playlist_tracks.filter(
            (pt) => pt.playlist_id !== id
          );
          this.data.scene_buttons.forEach((s) => {
            if (s.playlist_id === id) s.playlist_id = null;
          });
          this.save();
          return { changes: 1 };
        }

        // Playlist tracks
        if (normLower.startsWith('delete from playlist_tracks where playlist_id = ?')) {
          const plId = params[0];
          this.data.playlist_tracks = this.data.playlist_tracks.filter(
            (pt) => pt.playlist_id !== plId
          );
          this.save();
          return { changes: 1 };
        }

        if (normLower.startsWith('insert into playlist_tracks')) {
          const [playlist_id, track_id, position] = params;
          this.data.playlist_tracks.push({
            id: this.data.nextPtId++,
            playlist_id,
            track_id,
            position,
          });
          this.save();
          return { changes: 1 };
        }

        // Scenes
        if (normLower.startsWith('insert into scene_buttons')) {
          const [
            id,
            name,
            emoji,
            color,
            playlist_id,
            ambient_track_id,
            ambient_volume,
            shortcut_key,
            position,
            created_at,
          ] = params;
          this.data.scene_buttons.push({
            id,
            name,
            emoji,
            color,
            playlist_id,
            ambient_track_id,
            ambient_volume,
            shortcut_key,
            position,
            created_at,
          });
          this.save();
          return { changes: 1 };
        }

        if (normLower.startsWith('update scene_buttons')) {
          const [
            name,
            emoji,
            color,
            playlist_id,
            ambient_track_id,
            ambient_volume,
            shortcut_key,
            position,
            id,
          ] = params;
          const sc = this.data.scene_buttons.find((s) => s.id === id);
          if (sc) {
            sc.name = name;
            sc.emoji = emoji;
            sc.color = color;
            sc.playlist_id = playlist_id;
            sc.ambient_track_id = ambient_track_id;
            sc.ambient_volume = ambient_volume;
            sc.shortcut_key = shortcut_key;
            sc.position = position;
            this.save();
          }
          return { changes: sc ? 1 : 0 };
        }

        if (normLower.startsWith('delete from scene_buttons where id = ?')) {
          const id = params[0];
          this.data.scene_buttons = this.data.scene_buttons.filter((s) => s.id !== id);
          this.save();
          return { changes: 1 };
        }

        // Rooms
        if (normLower.startsWith('insert') && normLower.includes('into rooms')) {
          const [code, name, host_token, state_json, created_at] = params;
          const idx = this.data.rooms.findIndex((r) => r.code === code);
          if (idx === -1) {
            this.data.rooms.push({ code, name, host_token, state_json, created_at });
          } else if (normLower.includes('replace')) {
            this.data.rooms[idx] = { code, name, host_token, state_json, created_at };
          }
          this.save();
          return { changes: 1 };
        }

        if (normLower.startsWith('update rooms set state_json = ?')) {
          const [state_json, name, code] = params;
          const rm = this.data.rooms.find((r) => r.code === code);
          if (rm) {
            rm.state_json = state_json;
            rm.name = name;
            this.save();
          }
          return { changes: rm ? 1 : 0 };
        }

        return { changes: 0 };
      },
    };
  }
}

function createDatabaseConnection(): DatabaseLike {
  const dbDir = path.dirname(config.databasePath);
  try {
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
  } catch (err) {
    console.warn('[DB] Aviso ao criar diretório do banco:', err);
  }

  // On Vercel serverless, use the zero-dependency JSON store directly to avoid native addon/ESM bundler issues
  if (process.env.VERCEL) {
    console.log('[DB] Ambiente Vercel detectado: usando JsonFallbackDatabase em', config.databasePath);
    return new JsonFallbackDatabase(config.databasePath);
  }

  // Try Node.js built-in node:sqlite via process.getBuiltinModule (Node 22.5+ / 24+) without CJS require
  try {
    const sqliteBuiltin = (process as any).getBuiltinModule?.('node:sqlite');
    if (sqliteBuiltin && sqliteBuiltin.DatabaseSync) {
      const rawDb = new sqliteBuiltin.DatabaseSync(config.databasePath);
      const wrapped: DatabaseLike = {
        exec: (sql: string) => rawDb.exec(sql),
        pragma: (str: string) => rawDb.exec(`PRAGMA ${str}`),
        prepare: (sql: string) => rawDb.prepare(sql),
        transaction: <T extends (...args: any[]) => any>(fn: T): T =>
          ((...args: any[]) => {
            rawDb.exec('BEGIN');
            try {
              const res = fn(...args);
              rawDb.exec('COMMIT');
              return res;
            } catch (e) {
              rawDb.exec('ROLLBACK');
              throw e;
            }
          }) as T,
      };
      wrapped.pragma('journal_mode = WAL');
      wrapped.pragma('foreign_keys = ON');
      console.log('[DB] Conectado via node:sqlite (DatabaseSync nativo)');
      return wrapped;
    }
  } catch {
    console.warn('[DB] node:sqlite indisponível, ativando JsonFallbackDatabase em:', config.databasePath);
  }

  // Pure-JS JSON store fallback (guaranteed to work on any runtime)
  return new JsonFallbackDatabase(config.databasePath);
}

export const db: DatabaseLike = createDatabaseConnection();

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
    | PlaylistRow
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
    .all() as PlaylistRow[];

  return pRows
    .map((p) => getPlaylistById(p.id))
    .filter((p): p is Playlist => p !== null);
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
