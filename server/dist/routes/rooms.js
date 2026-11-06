"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.roomsRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const roomManager_1 = require("../socket/roomManager");
exports.roomsRouter = (0, express_1.Router)();
// POST /api/rooms/auth - Verify host password or token
exports.roomsRouter.post('/auth', async (req, res) => {
    try {
        const { password, hostToken, code } = req.body || {};
        const valid = (0, auth_1.isValidHostAuth)(password, hostToken, code);
        if (!valid) {
            res.status(401).json({
                valid: false,
                error: 'Senha de anfitrião incorreta.',
            });
            return;
        }
        const roomCode = typeof code === 'string' && code.trim() ? code.trim().toUpperCase() : 'AB12CD';
        const { state, hostToken: roomToken } = await (0, roomManager_1.getOrLoadRoomState)(roomCode);
        const now = Date.now();
        res.json({
            valid: true,
            roomCode: state.code,
            hostToken: roomToken,
            state: {
                ...state,
                positionSec: (0, roomManager_1.computeCurrentPosition)(state, now),
                updatedAt: now,
                serverNow: now,
            },
        });
    }
    catch (err) {
        console.error('[Rooms /auth Error]:', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao autenticar sala.' });
    }
});
// POST /api/rooms - Create a new room (returns short code and hostToken)
exports.roomsRouter.post('/', async (req, res) => {
    try {
        const password = req.headers['x-host-password'] || req.body?.password;
        const token = req.headers['x-host-token'] || req.body?.hostToken;
        // Allow creating a room with valid password/token OR generate a new room token directly
        const customCode = typeof req.body?.code === 'string' && /^[A-Za-z0-9]{4,10}$/.test(req.body.code.trim())
            ? req.body.code.trim().toUpperCase()
            : undefined;
        const name = typeof req.body?.name === 'string' ? req.body.name.trim() : undefined;
        if (customCode) {
            if (!(0, auth_1.isValidHostAuth)(password, token, customCode)) {
                res.status(401).json({
                    error: 'Informe a senha do anfitrião para criar ou assumir uma sala com código personalizado.',
                });
                return;
            }
            const { state, hostToken } = await (0, roomManager_1.getOrLoadRoomState)(customCode, name);
            res.status(201).json({
                state,
                hostToken,
                sharePath: `/sala/${state.code}`,
            });
            return;
        }
        const { state, hostToken } = (0, roomManager_1.createNewRoom)(name);
        (0, roomManager_1.persistRoomState)(state);
        res.status(201).json({
            state,
            hostToken,
            sharePath: `/sala/${state.code}`,
        });
    }
    catch (err) {
        console.error('[Rooms POST Error]:', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao criar sala.' });
    }
});
// GET /api/rooms/:code - Fetch room state & record active listener heartbeat
exports.roomsRouter.get('/:code', async (req, res) => {
    try {
        const code = req.params.code.trim().toUpperCase();
        const clientId = typeof req.query.clientId === 'string' ? req.query.clientId : undefined;
        const password = req.headers['x-host-password'];
        const token = req.headers['x-host-token'];
        const { state, hostToken } = await (0, roomManager_1.getOrLoadRoomState)(code);
        const listenerCount = (0, roomManager_1.touchRoomClient)(code, clientId);
        state.listenerCount = listenerCount;
        const isHost = (0, auth_1.isValidHostAuth)(password, token, code);
        const now = Date.now();
        res.json({
            state: {
                ...state,
                listenerCount,
                positionSec: (0, roomManager_1.computeCurrentPosition)(state, now),
                updatedAt: now,
                serverNow: now,
            },
            isHost,
            hostToken: isHost ? hostToken : undefined,
        });
    }
    catch (err) {
        console.error('[Rooms GET /:code Error]:', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao carregar sala.' });
    }
});
// POST /api/rooms/:code/command - Execute host playback command via HTTP (for serverless / fallback)
exports.roomsRouter.post('/:code/command', async (req, res) => {
    try {
        const code = req.params.code.trim().toUpperCase();
        const password = req.headers['x-host-password'] || req.body?.password;
        const hostToken = req.headers['x-host-token'] || req.body?.hostToken;
        const result = await (0, roomManager_1.executeHostCommandAsync)({
            ...req.body,
            code,
            password,
            hostToken,
        }, code);
        if (!result.ok) {
            res.status(401).json(result);
            return;
        }
        res.json(result);
    }
    catch (err) {
        console.error('[Rooms command Error]:', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao executar comando.' });
    }
});
