"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isValidHostAuth = isValidHostAuth;
exports.requireHostAuth = requireHostAuth;
const config_1 = require("../config");
const database_1 = require("../db/database");
function isValidHostAuth(password, token, roomCode) {
    if (password && password === config_1.config.hostPassword) {
        return true;
    }
    if (token) {
        if (roomCode) {
            const room = database_1.db
                .prepare('SELECT host_token FROM rooms WHERE code = ?')
                .get(roomCode.toUpperCase());
            if (room && room.host_token === token)
                return true;
        }
        else {
            const anyRoom = database_1.db
                .prepare('SELECT code FROM rooms WHERE host_token = ? LIMIT 1')
                .get(token);
            if (anyRoom)
                return true;
        }
    }
    return false;
}
function requireHostAuth(req, res, next) {
    const password = req.headers['x-host-password'] || undefined;
    const token = req.headers['x-host-token'] || undefined;
    if (isValidHostAuth(password, token)) {
        next();
        return;
    }
    res.status(401).json({
        error: 'Acesso restrito ao anfitrião. Informe a senha do anfitrião (HOST_PASSWORD) ou token da sala válido.',
    });
}
