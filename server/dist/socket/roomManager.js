"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeCurrentPosition = computeCurrentPosition;
exports.loadOrCreateRoom = loadOrCreateRoom;
exports.createNewRoom = createNewRoom;
exports.persistRoomState = persistRoomState;
exports.setupSocketServer = setupSocketServer;
const crypto_1 = __importDefault(require("crypto"));
const database_1 = require("../db/database");
const auth_1 = require("../middleware/auth");
const activeRooms = new Map();
const roomSockets = new Map();
function generateShortRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (let attempt = 0; attempt < 20; attempt++) {
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += chars[crypto_1.default.randomInt(0, chars.length)];
        }
        const exists = database_1.db.prepare('SELECT code FROM rooms WHERE code = ?').get(code);
        if (!exists && !activeRooms.has(code)) {
            return code;
        }
    }
    return crypto_1.default.randomBytes(3).toString('hex').toUpperCase();
}
function computeCurrentPosition(state, now = Date.now()) {
    if (!state.isPlaying || !state.currentTrack) {
        return state.positionSec;
    }
    const elapsedSec = Math.max(0, (now - state.updatedAt) / 1000);
    const pos = state.positionSec + elapsedSec;
    if (state.currentTrack.durationSec > 0 && pos > state.currentTrack.durationSec) {
        return state.currentTrack.durationSec;
    }
    return pos;
}
function loadOrCreateRoom(code, name) {
    const upperCode = code.trim().toUpperCase();
    const row = database_1.db
        .prepare('SELECT code, name, host_token, state_json FROM rooms WHERE code = ?')
        .get(upperCode);
    let state = activeRooms.get(upperCode);
    if (!state && row) {
        try {
            const parsed = JSON.parse(row.state_json);
            // Refresh track references from DB in case metadata was edited
            const refreshedTrack = parsed.currentTrack ? (0, database_1.getTrackById)(parsed.currentTrack.id) : null;
            const refreshedAmbient = parsed.ambientTrack ? (0, database_1.getTrackById)(parsed.ambientTrack.id) : null;
            const refreshedQueue = Array.isArray(parsed.queue)
                ? parsed.queue
                    .map((t) => (0, database_1.getTrackById)(t.id))
                    .filter((t) => t !== null)
                : [];
            state = {
                ...parsed,
                code: upperCode,
                name: row.name,
                currentTrack: refreshedTrack || parsed.currentTrack,
                ambientTrack: refreshedAmbient || parsed.ambientTrack,
                queue: refreshedQueue.length > 0 ? refreshedQueue : parsed.queue || [],
                serverNow: Date.now(),
                listenerCount: roomSockets.get(upperCode)?.size || 0,
            };
            activeRooms.set(upperCode, state);
        }
        catch {
            // Fallback if state_json is corrupted
        }
    }
    if (state && row) {
        state.listenerCount = roomSockets.get(upperCode)?.size || 0;
        state.serverNow = Date.now();
        return { state, hostToken: row.host_token };
    }
    // Create new room
    const hostToken = `tok_${crypto_1.default.randomBytes(18).toString('hex')}`;
    const defaultPlaylist = (0, database_1.getPlaylistById)('playlist-exploracao');
    const firstTrack = defaultPlaylist?.tracks[0] || null;
    const now = Date.now();
    const newState = {
        code: upperCode,
        name: name?.trim() || `Sala ${upperCode}`,
        activeSceneId: 'scene-floresta',
        activePlaylistId: defaultPlaylist?.id || null,
        currentTrack: firstTrack,
        queue: defaultPlaylist?.tracks || [],
        currentIndex: 0,
        isPlaying: false,
        positionSec: 0,
        updatedAt: now,
        serverNow: now,
        volume: 0.85,
        shuffle: false,
        repeatMode: 'playlist',
        crossfadeSec: 3,
        ambientTrack: null,
        ambientIsPlaying: false,
        ambientVolume: 0.35,
        listenerCount: roomSockets.get(upperCode)?.size || 0,
    };
    database_1.db.prepare(`
    INSERT OR REPLACE INTO rooms (code, name, host_token, state_json, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(upperCode, newState.name, hostToken, JSON.stringify(newState), new Date().toISOString());
    activeRooms.set(upperCode, newState);
    return { state: newState, hostToken };
}
function createNewRoom(name) {
    const code = generateShortRoomCode();
    return loadOrCreateRoom(code, name);
}
function persistRoomState(state) {
    state.serverNow = Date.now();
    activeRooms.set(state.code, state);
    database_1.db.prepare('UPDATE rooms SET state_json = ?, name = ? WHERE code = ?').run(JSON.stringify(state), state.name, state.code);
}
function setupSocketServer(io) {
    io.on('connection', (socket) => {
        let joinedRoomCode = null;
        // NTP-style clock ping/pong for latency compensation
        socket.on('clock:ping', (payload) => {
            socket.emit('clock:pong', {
                clientSentAt: payload?.clientSentAt || Date.now(),
                serverNow: Date.now(),
            });
        });
        // Join room as listener or host
        socket.on('room:join', (payload, ack) => {
            const code = (payload?.code || 'AB12CD').trim().toUpperCase();
            if (joinedRoomCode && joinedRoomCode !== code) {
                socket.leave(joinedRoomCode);
                const prevSet = roomSockets.get(joinedRoomCode);
                if (prevSet) {
                    prevSet.delete(socket.id);
                    const prevRoom = activeRooms.get(joinedRoomCode);
                    if (prevRoom) {
                        prevRoom.listenerCount = prevSet.size;
                        io.to(joinedRoomCode).emit('room:listeners', {
                            code: joinedRoomCode,
                            listenerCount: prevSet.size,
                        });
                    }
                }
            }
            joinedRoomCode = code;
            socket.join(code);
            if (!roomSockets.has(code)) {
                roomSockets.set(code, new Set());
            }
            const socketSet = roomSockets.get(code);
            socketSet.add(socket.id);
            const { state, hostToken } = loadOrCreateRoom(code);
            state.listenerCount = socketSet.size;
            state.serverNow = Date.now();
            const isHost = (0, auth_1.isValidHostAuth)(payload?.password, payload?.hostToken, code);
            io.to(code).emit('room:listeners', {
                code,
                listenerCount: state.listenerCount,
            });
            socket.emit('room:state', {
                ...state,
                positionSec: computeCurrentPosition(state),
                updatedAt: Date.now(),
                serverNow: Date.now(),
            });
            if (typeof ack === 'function') {
                ack({
                    ok: true,
                    state: {
                        ...state,
                        positionSec: computeCurrentPosition(state),
                        updatedAt: Date.now(),
                        serverNow: Date.now(),
                    },
                    isHost,
                    hostToken: isHost ? hostToken : undefined,
                });
            }
        });
        // Host command handler to mutate playback state and broadcast to all listeners
        socket.on('host:command', (payload, ack) => {
            const code = (payload?.code || joinedRoomCode || 'AB12CD').trim().toUpperCase();
            if (!(0, auth_1.isValidHostAuth)(payload?.password, payload?.hostToken, code)) {
                if (typeof ack === 'function') {
                    ack({
                        ok: false,
                        error: 'Apenas o anfitrião autenticado pode controlar a reprodução da sala.',
                    });
                }
                return;
            }
            const { state } = loadOrCreateRoom(code);
            const now = Date.now();
            switch (payload.action) {
                case 'play': {
                    if (typeof payload.positionSec === 'number' && payload.positionSec >= 0) {
                        state.positionSec = payload.positionSec;
                    }
                    if (!state.currentTrack && state.queue.length > 0) {
                        state.currentTrack = state.queue[0];
                        state.currentIndex = 0;
                    }
                    state.isPlaying = true;
                    state.updatedAt = now;
                    break;
                }
                case 'pause': {
                    state.positionSec =
                        typeof payload.positionSec === 'number'
                            ? payload.positionSec
                            : computeCurrentPosition(state, now);
                    state.isPlaying = false;
                    state.updatedAt = now;
                    break;
                }
                case 'seek': {
                    state.positionSec = Math.max(0, Number(payload.positionSec) || 0);
                    state.updatedAt = now;
                    break;
                }
                case 'set_track': {
                    if (payload.trackId) {
                        const track = (0, database_1.getTrackById)(payload.trackId);
                        if (track) {
                            state.currentTrack = track;
                            const idx = state.queue.findIndex((t) => t.id === track.id);
                            if (idx >= 0) {
                                state.currentIndex = idx;
                            }
                            else {
                                state.queue = [track, ...state.queue];
                                state.currentIndex = 0;
                            }
                            state.positionSec = 0;
                            state.isPlaying = true;
                            state.updatedAt = now;
                        }
                    }
                    break;
                }
                case 'set_playlist': {
                    if (payload.playlistId) {
                        const pl = (0, database_1.getPlaylistById)(payload.playlistId);
                        if (pl) {
                            state.activePlaylistId = pl.id;
                            state.queue = pl.tracks;
                            state.currentIndex = 0;
                            state.currentTrack = pl.tracks[0] || null;
                            state.positionSec = 0;
                            state.isPlaying = pl.tracks.length > 0;
                            state.updatedAt = now;
                        }
                    }
                    break;
                }
                case 'trigger_scene': {
                    if (payload.sceneId) {
                        const scene = (0, database_1.getSceneById)(payload.sceneId);
                        if (scene) {
                            state.activeSceneId = scene.id;
                            if (scene.playlistId) {
                                const pl = (0, database_1.getPlaylistById)(scene.playlistId);
                                if (pl) {
                                    state.activePlaylistId = pl.id;
                                    state.queue = pl.tracks;
                                    state.currentIndex = 0;
                                    state.currentTrack = pl.tracks[0] || null;
                                    state.positionSec = 0;
                                    state.isPlaying = pl.tracks.length > 0;
                                    state.updatedAt = now;
                                }
                            }
                            if (scene.ambientTrackId) {
                                const amb = (0, database_1.getTrackById)(scene.ambientTrackId);
                                if (amb) {
                                    state.ambientTrack = amb;
                                    state.ambientIsPlaying = true;
                                    state.ambientVolume = scene.ambientVolume;
                                }
                            }
                            else {
                                state.ambientIsPlaying = false;
                            }
                        }
                    }
                    break;
                }
                case 'next': {
                    if (state.queue.length > 0) {
                        if (state.repeatMode === 'track' && payload.positionSec !== undefined) {
                            // If auto-advancing on repeat track
                            state.positionSec = 0;
                            state.isPlaying = true;
                            state.updatedAt = now;
                        }
                        else if (state.shuffle && state.queue.length > 1) {
                            let nextIdx = state.currentIndex;
                            while (nextIdx === state.currentIndex) {
                                nextIdx = crypto_1.default.randomInt(0, state.queue.length);
                            }
                            state.currentIndex = nextIdx;
                            state.currentTrack = state.queue[nextIdx];
                            state.positionSec = 0;
                            state.isPlaying = true;
                            state.updatedAt = now;
                        }
                        else {
                            const isLast = state.currentIndex >= state.queue.length - 1;
                            if (isLast && state.repeatMode === 'none') {
                                state.isPlaying = false;
                                state.positionSec = 0;
                                state.updatedAt = now;
                            }
                            else {
                                state.currentIndex = (state.currentIndex + 1) % state.queue.length;
                                state.currentTrack = state.queue[state.currentIndex];
                                state.positionSec = 0;
                                state.isPlaying = true;
                                state.updatedAt = now;
                            }
                        }
                    }
                    break;
                }
                case 'prev': {
                    if (state.queue.length > 0) {
                        const currentPos = computeCurrentPosition(state, now);
                        if (currentPos > 4) {
                            state.positionSec = 0;
                            state.updatedAt = now;
                        }
                        else {
                            state.currentIndex =
                                (state.currentIndex - 1 + state.queue.length) % state.queue.length;
                            state.currentTrack = state.queue[state.currentIndex];
                            state.positionSec = 0;
                            state.isPlaying = true;
                            state.updatedAt = now;
                        }
                    }
                    break;
                }
                case 'set_volume': {
                    if (typeof payload.volume === 'number') {
                        state.volume = Math.max(0, Math.min(1, payload.volume));
                    }
                    break;
                }
                case 'set_shuffle': {
                    state.shuffle =
                        typeof payload.shuffle === 'boolean' ? payload.shuffle : !state.shuffle;
                    break;
                }
                case 'set_repeat': {
                    if (payload.repeatMode && ['none', 'track', 'playlist'].includes(payload.repeatMode)) {
                        state.repeatMode = payload.repeatMode;
                    }
                    break;
                }
                case 'set_crossfade': {
                    if (typeof payload.crossfadeSec === 'number') {
                        state.crossfadeSec = Math.max(0, Math.min(10, payload.crossfadeSec));
                    }
                    break;
                }
                case 'set_ambient': {
                    if (payload.ambientTrackId !== undefined) {
                        if (payload.ambientTrackId === null || payload.ambientTrackId === '') {
                            state.ambientTrack = null;
                            state.ambientIsPlaying = false;
                        }
                        else {
                            const amb = (0, database_1.getTrackById)(payload.ambientTrackId);
                            if (amb) {
                                state.ambientTrack = amb;
                            }
                        }
                    }
                    if (typeof payload.ambientIsPlaying === 'boolean') {
                        state.ambientIsPlaying = payload.ambientIsPlaying && Boolean(state.ambientTrack);
                    }
                    if (typeof payload.ambientVolume === 'number') {
                        state.ambientVolume = Math.max(0, Math.min(1, payload.ambientVolume));
                    }
                    break;
                }
                case 'sync_heartbeat': {
                    if (typeof payload.positionSec === 'number' && payload.positionSec >= 0) {
                        state.positionSec = payload.positionSec;
                        state.updatedAt = now;
                    }
                    break;
                }
            }
            state.listenerCount = roomSockets.get(code)?.size || 0;
            persistRoomState(state);
            const broadcastState = {
                ...state,
                positionSec: computeCurrentPosition(state, now),
                updatedAt: now,
                serverNow: now,
            };
            io.to(code).emit('room:state', broadcastState);
            if (typeof ack === 'function') {
                ack({ ok: true, state: broadcastState });
            }
        });
        socket.on('disconnect', () => {
            if (joinedRoomCode) {
                const set = roomSockets.get(joinedRoomCode);
                if (set) {
                    set.delete(socket.id);
                    const room = activeRooms.get(joinedRoomCode);
                    if (room) {
                        room.listenerCount = set.size;
                    }
                    io.to(joinedRoomCode).emit('room:listeners', {
                        code: joinedRoomCode,
                        listenerCount: set.size,
                    });
                }
            }
        });
    });
}
