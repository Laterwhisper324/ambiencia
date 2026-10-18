"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
exports.initSchema = initSchema;
exports.mapTrackRow = mapTrackRow;
exports.getAllTracks = getAllTracks;
exports.getTrackById = getTrackById;
exports.getPlaylistById = getPlaylistById;
exports.getAllPlaylists = getAllPlaylists;
exports.mapSceneRow = mapSceneRow;
exports.getAllScenes = getAllScenes;
exports.getSceneById = getSceneById;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const config_1 = require("../config");
const dbDir = path_1.default.dirname(config_1.config.databasePath);
if (!fs_1.default.existsSync(dbDir)) {
    fs_1.default.mkdirSync(dbDir, { recursive: true });
}
exports.db = new better_sqlite3_1.default(config_1.config.databasePath);
exports.db.pragma('journal_mode = WAL');
exports.db.pragma('foreign_keys = ON');
function initSchema() {
    exports.db.exec(`
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
function mapTrackRow(row) {
    let parsedTags = [];
    try {
        parsedTags = JSON.parse(row.tags);
    }
    catch {
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
function getAllTracks(search, tag) {
    const rows = exports.db
        .prepare('SELECT * FROM tracks ORDER BY created_at DESC')
        .all();
    let tracks = rows.map(mapTrackRow);
    if (search && search.trim()) {
        const q = search.trim().toLowerCase();
        tracks = tracks.filter((t) => t.title.toLowerCase().includes(q) ||
            t.tags.some((tg) => tg.toLowerCase().includes(q)));
    }
    if (tag && tag.trim()) {
        const tg = tag.trim().toLowerCase();
        tracks = tracks.filter((t) => t.tags.some((item) => item.toLowerCase() === tg));
    }
    return tracks;
}
function getTrackById(id) {
    const row = exports.db.prepare('SELECT * FROM tracks WHERE id = ?').get(id);
    return row ? mapTrackRow(row) : null;
}
function getPlaylistById(id) {
    const pRow = exports.db.prepare('SELECT * FROM playlists WHERE id = ?').get(id);
    if (!pRow)
        return null;
    const trackRows = exports.db
        .prepare(`SELECT t.* FROM playlist_tracks pt
       JOIN tracks t ON t.id = pt.track_id
       WHERE pt.playlist_id = ?
       ORDER BY pt.position ASC, pt.id ASC`)
        .all(id);
    return {
        id: pRow.id,
        name: pRow.name,
        description: pRow.description,
        tracks: trackRows.map(mapTrackRow),
        createdAt: pRow.created_at,
    };
}
function getAllPlaylists() {
    const pRows = exports.db
        .prepare('SELECT * FROM playlists ORDER BY created_at ASC')
        .all();
    return pRows
        .map((p) => getPlaylistById(p.id))
        .filter((p) => p !== null);
}
function mapSceneRow(row) {
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
function getAllScenes() {
    const rows = exports.db
        .prepare('SELECT * FROM scene_buttons ORDER BY position ASC, created_at ASC')
        .all();
    return rows.map(mapSceneRow);
}
function getSceneById(id) {
    const row = exports.db
        .prepare('SELECT * FROM scene_buttons WHERE id = ?')
        .get(id);
    return row ? mapSceneRow(row) : null;
}
