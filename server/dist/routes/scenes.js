"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scenesRouter = void 0;
const express_1 = require("express");
const crypto_1 = __importDefault(require("crypto"));
const database_1 = require("../db/database");
const auth_1 = require("../middleware/auth");
exports.scenesRouter = (0, express_1.Router)();
// GET /api/scenes
exports.scenesRouter.get('/', (_req, res) => {
    res.json({ scenes: (0, database_1.getAllScenes)() });
});
// POST /api/scenes
exports.scenesRouter.post('/', auth_1.requireHostAuth, (req, res) => {
    const { name, emoji, color, playlistId, ambientTrackId, ambientVolume, shortcutKey } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) {
        res.status(400).json({ error: 'O nome da cena é obrigatório.' });
        return;
    }
    const allScenes = (0, database_1.getAllScenes)();
    const id = `scene-${crypto_1.default.randomUUID()}`;
    const now = new Date().toISOString();
    const safeEmoji = typeof emoji === 'string' && emoji.trim() ? emoji.trim().slice(0, 8) : '🎭';
    const safeColor = typeof color === 'string' && color.trim() ? color.trim().slice(0, 24) : '#10b981';
    const safePlaylistId = typeof playlistId === 'string' && playlistId ? playlistId : null;
    const safeAmbientId = typeof ambientTrackId === 'string' && ambientTrackId ? ambientTrackId : null;
    const safeAmbientVol = typeof ambientVolume === 'number'
        ? Math.max(0, Math.min(1, ambientVolume))
        : 0.35;
    const safeShortcut = typeof shortcutKey === 'number' && shortcutKey >= 1 && shortcutKey <= 9
        ? shortcutKey
        : allScenes.length < 9
            ? allScenes.length + 1
            : null;
    database_1.db.prepare(`
    INSERT INTO scene_buttons (
      id, name, emoji, color, playlist_id, ambient_track_id, ambient_volume, shortcut_key, position, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name.trim().slice(0, 60), safeEmoji, safeColor, safePlaylistId, safeAmbientId, safeAmbientVol, safeShortcut, allScenes.length, now);
    res.status(201).json({ scene: (0, database_1.getSceneById)(id) });
});
// PATCH /api/scenes/:id
exports.scenesRouter.patch('/:id', auth_1.requireHostAuth, (req, res) => {
    const existing = (0, database_1.getSceneById)(req.params.id);
    if (!existing) {
        res.status(404).json({ error: 'Botão de cena não encontrado.' });
        return;
    }
    const { name, emoji, color, playlistId, ambientTrackId, ambientVolume, shortcutKey, position } = req.body || {};
    const nextName = typeof name === 'string' && name.trim() ? name.trim().slice(0, 60) : existing.name;
    const nextEmoji = typeof emoji === 'string' && emoji.trim() ? emoji.trim().slice(0, 8) : existing.emoji;
    const nextColor = typeof color === 'string' && color.trim() ? color.trim().slice(0, 24) : existing.color;
    const nextPlaylistId = playlistId === undefined ? existing.playlistId : playlistId || null;
    const nextAmbientId = ambientTrackId === undefined ? existing.ambientTrackId : ambientTrackId || null;
    const nextAmbientVol = typeof ambientVolume === 'number'
        ? Math.max(0, Math.min(1, ambientVolume))
        : existing.ambientVolume;
    const nextShortcut = shortcutKey === undefined
        ? existing.shortcutKey
        : typeof shortcutKey === 'number' && shortcutKey >= 1 && shortcutKey <= 9
            ? shortcutKey
            : null;
    const nextPos = typeof position === 'number' ? position : existing.position;
    database_1.db.prepare(`
    UPDATE scene_buttons
    SET name = ?, emoji = ?, color = ?, playlist_id = ?, ambient_track_id = ?,
        ambient_volume = ?, shortcut_key = ?, position = ?
    WHERE id = ?
  `).run(nextName, nextEmoji, nextColor, nextPlaylistId, nextAmbientId, nextAmbientVol, nextShortcut, nextPos, existing.id);
    res.json({ scene: (0, database_1.getSceneById)(existing.id) });
});
// DELETE /api/scenes/:id
exports.scenesRouter.delete('/:id', auth_1.requireHostAuth, (req, res) => {
    const existing = (0, database_1.getSceneById)(req.params.id);
    if (!existing) {
        res.status(404).json({ error: 'Botão de cena não encontrado.' });
        return;
    }
    database_1.db.prepare('DELETE FROM scene_buttons WHERE id = ?').run(existing.id);
    res.json({ ok: true });
});
