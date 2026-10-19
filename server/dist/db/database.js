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
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const config_1 = require("../config");
/**
 * Pure TypeScript JSON-backed fallback database used when running in serverless
 * environments (e.g. Vercel) where native C++ SQLite bindings are unavailable.
 */
class JsonFallbackDatabase {
    filePath;
    data;
    constructor(dbPath) {
        this.filePath = `${dbPath}.json`;
        this.data = this.load();
    }
    load() {
        try {
            if (fs_1.default.existsSync(this.filePath)) {
                const raw = fs_1.default.readFileSync(this.filePath, 'utf-8');
                return JSON.parse(raw);
            }
        }
        catch (err) {
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
    save() {
        try {
            const dir = path_1.default.dirname(this.filePath);
            if (!fs_1.default.existsSync(dir)) {
                fs_1.default.mkdirSync(dir, { recursive: true });
            }
            fs_1.default.writeFileSync(this.filePath, JSON.stringify(this.data), 'utf-8');
        }
        catch (err) {
            console.warn('[DB Fallback] Aviso ao salvar JSON store:', err);
        }
    }
    exec(_sql) {
        // Schema creation no-op for JSON fallback
    }
    pragma(_sql) {
        // Pragma no-op for JSON fallback
    }
    transaction(fn) {
        return ((...args) => {
            const res = fn(...args);
            this.save();
            return res;
        });
    }
    prepare(sql) {
        const norm = sql.replace(/\s+/g, ' ').trim();
        const normLower = norm.toLowerCase();
        return {
            get: (...params) => {
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
            all: (...params) => {
                if (normLower.includes('from tracks order by created_at desc')) {
                    return [...this.data.tracks].sort((a, b) => b.created_at.localeCompare(a.created_at));
                }
                if (normLower.includes('from playlists order by created_at asc')) {
                    return [...this.data.playlists].sort((a, b) => a.created_at.localeCompare(b.created_at));
                }
                if (normLower.includes('from playlist_tracks pt join tracks t')) {
                    const plId = params[0];
                    const pts = this.data.playlist_tracks
                        .filter((pt) => pt.playlist_id === plId)
                        .sort((a, b) => a.position - b.position || a.id - b.id);
                    return pts
                        .map((pt) => this.data.tracks.find((t) => t.id === pt.track_id))
                        .filter((t) => Boolean(t));
                }
                if (normLower.includes('from scene_buttons order by position asc')) {
                    return [...this.data.scene_buttons].sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
                }
                return [];
            },
            run: (...params) => {
                // Tracks
                if (normLower.startsWith('insert') && normLower.includes('into tracks')) {
                    const isMp3Literal = normLower.includes("'mp3'");
                    const isYtLiteral = normLower.includes("'youtube'");
                    let row;
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
                    }
                    else if (isYtLiteral) {
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
                    }
                    else {
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
                    this.data.playlist_tracks = this.data.playlist_tracks.filter((pt) => pt.track_id !== id);
                    this.data.scene_buttons.forEach((s) => {
                        if (s.ambient_track_id === id)
                            s.ambient_track_id = null;
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
                    this.data.playlist_tracks = this.data.playlist_tracks.filter((pt) => pt.playlist_id !== id);
                    this.data.scene_buttons.forEach((s) => {
                        if (s.playlist_id === id)
                            s.playlist_id = null;
                    });
                    this.save();
                    return { changes: 1 };
                }
                // Playlist tracks
                if (normLower.startsWith('delete from playlist_tracks where playlist_id = ?')) {
                    const plId = params[0];
                    this.data.playlist_tracks = this.data.playlist_tracks.filter((pt) => pt.playlist_id !== plId);
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
                    const [id, name, emoji, color, playlist_id, ambient_track_id, ambient_volume, shortcut_key, position, created_at,] = params;
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
                    const [name, emoji, color, playlist_id, ambient_track_id, ambient_volume, shortcut_key, position, id,] = params;
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
                    }
                    else if (normLower.includes('replace')) {
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
function createDatabaseConnection() {
    const dbDir = path_1.default.dirname(config_1.config.databasePath);
    try {
        if (!fs_1.default.existsSync(dbDir)) {
            fs_1.default.mkdirSync(dbDir, { recursive: true });
        }
    }
    catch (err) {
        console.warn('[DB] Aviso ao criar diretório do banco:', err);
    }
    // Tier 1: Try better-sqlite3
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const BetterSqlite3 = require('better-sqlite3');
        const instance = new BetterSqlite3(config_1.config.databasePath);
        instance.pragma('journal_mode = WAL');
        instance.pragma('foreign_keys = ON');
        console.log('[DB] Conectado via better-sqlite3');
        return instance;
    }
    catch (err) {
        console.warn('[DB] better-sqlite3 indisponível neste ambiente, tentando node:sqlite...');
    }
    // Tier 2: Try Node.js built-in node:sqlite (Node 22.5+ / 24+)
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { DatabaseSync } = require('node:sqlite');
        const rawDb = new DatabaseSync(config_1.config.databasePath);
        const wrapped = {
            exec: (sql) => rawDb.exec(sql),
            pragma: (str) => rawDb.exec(`PRAGMA ${str}`),
            prepare: (sql) => rawDb.prepare(sql),
            transaction: (fn) => ((...args) => {
                rawDb.exec('BEGIN');
                try {
                    const res = fn(...args);
                    rawDb.exec('COMMIT');
                    return res;
                }
                catch (e) {
                    rawDb.exec('ROLLBACK');
                    throw e;
                }
            }),
        };
        wrapped.pragma('journal_mode = WAL');
        wrapped.pragma('foreign_keys = ON');
        console.log('[DB] Conectado via node:sqlite (DatabaseSync nativo)');
        return wrapped;
    }
    catch (err) {
        console.warn('[DB] node:sqlite indisponível, ativando JsonFallbackDatabase em:', config_1.config.databasePath);
    }
    // Tier 3: Pure-JS JSON store fallback (guaranteed to work on any serverless runtime)
    return new JsonFallbackDatabase(config_1.config.databasePath);
}
exports.db = createDatabaseConnection();
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
