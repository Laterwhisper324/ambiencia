"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.playlistsRouter = void 0;
const express_1 = require("express");
const crypto_1 = __importDefault(require("crypto"));
const database_1 = require("../db/database");
const auth_1 = require("../middleware/auth");
exports.playlistsRouter = (0, express_1.Router)();
// GET /api/playlists
exports.playlistsRouter.get('/', (_req, res) => {
    res.json({ playlists: (0, database_1.getAllPlaylists)() });
});
// POST /api/playlists
exports.playlistsRouter.post('/', auth_1.requireHostAuth, (req, res) => {
    const { name, description, trackIds } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) {
        res.status(400).json({ error: 'O nome da playlist é obrigatório.' });
        return;
    }
    const id = `playlist-${crypto_1.default.randomUUID()}`;
    const now = new Date().toISOString();
    const desc = typeof description === 'string' ? description.trim().slice(0, 300) : '';
    const createTx = database_1.db.transaction(() => {
        database_1.db.prepare(`
      INSERT INTO playlists (id, name, description, created_at)
      VALUES (?, ?, ?, ?)
    `).run(id, name.trim().slice(0, 100), desc, now);
        if (Array.isArray(trackIds)) {
            const insertPt = database_1.db.prepare(`
        INSERT INTO playlist_tracks (playlist_id, track_id, position)
        VALUES (?, ?, ?)
      `);
            trackIds.forEach((tid, idx) => {
                if (typeof tid === 'string' && (0, database_1.getTrackById)(tid)) {
                    insertPt.run(id, tid, idx);
                }
            });
        }
    });
    createTx();
    res.status(201).json({ playlist: (0, database_1.getPlaylistById)(id) });
});
// PATCH /api/playlists/:id (Rename / update description)
exports.playlistsRouter.patch('/:id', auth_1.requireHostAuth, (req, res) => {
    const existing = (0, database_1.getPlaylistById)(req.params.id);
    if (!existing) {
        res.status(404).json({ error: 'Playlist não encontrada.' });
        return;
    }
    const { name, description } = req.body || {};
    const nextName = typeof name === 'string' && name.trim() ? name.trim().slice(0, 100) : existing.name;
    const nextDesc = typeof description === 'string' ? description.trim().slice(0, 300) : existing.description;
    database_1.db.prepare('UPDATE playlists SET name = ?, description = ? WHERE id = ?').run(nextName, nextDesc, existing.id);
    res.json({ playlist: (0, database_1.getPlaylistById)(existing.id) });
});
// POST /api/playlists/:id/duplicate
exports.playlistsRouter.post('/:id/duplicate', auth_1.requireHostAuth, (req, res) => {
    const existing = (0, database_1.getPlaylistById)(req.params.id);
    if (!existing) {
        res.status(404).json({ error: 'Playlist original não encontrada.' });
        return;
    }
    const newId = `playlist-${crypto_1.default.randomUUID()}`;
    const now = new Date().toISOString();
    const customName = typeof req.body?.name === 'string' && req.body.name.trim()
        ? req.body.name.trim().slice(0, 100)
        : `${existing.name} (Cópia)`;
    const dupTx = database_1.db.transaction(() => {
        database_1.db.prepare(`
      INSERT INTO playlists (id, name, description, created_at)
      VALUES (?, ?, ?, ?)
    `).run(newId, customName, existing.description, now);
        const insertPt = database_1.db.prepare(`
      INSERT INTO playlist_tracks (playlist_id, track_id, position)
      VALUES (?, ?, ?)
    `);
        existing.tracks.forEach((track, idx) => {
            insertPt.run(newId, track.id, idx);
        });
    });
    dupTx();
    res.status(201).json({ playlist: (0, database_1.getPlaylistById)(newId) });
});
// PUT /api/playlists/:id/tracks (Reorder or replace tracks in playlist)
exports.playlistsRouter.put('/:id/tracks', auth_1.requireHostAuth, (req, res) => {
    const existing = (0, database_1.getPlaylistById)(req.params.id);
    if (!existing) {
        res.status(404).json({ error: 'Playlist não encontrada.' });
        return;
    }
    const { trackIds } = req.body || {};
    if (!Array.isArray(trackIds)) {
        res.status(400).json({ error: 'Envie um array trackIds com a nova ordem das faixas.' });
        return;
    }
    const updateTracksTx = database_1.db.transaction(() => {
        database_1.db.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ?').run(existing.id);
        const insertPt = database_1.db.prepare(`
      INSERT INTO playlist_tracks (playlist_id, track_id, position)
      VALUES (?, ?, ?)
    `);
        trackIds.forEach((tid, index) => {
            if (typeof tid === 'string' && (0, database_1.getTrackById)(tid)) {
                insertPt.run(existing.id, tid, index);
            }
        });
    });
    updateTracksTx();
    res.json({ playlist: (0, database_1.getPlaylistById)(existing.id) });
});
// POST /api/playlists/:id/tracks (Add a track to the end of the playlist)
exports.playlistsRouter.post('/:id/tracks', auth_1.requireHostAuth, (req, res) => {
    const existing = (0, database_1.getPlaylistById)(req.params.id);
    if (!existing) {
        res.status(404).json({ error: 'Playlist não encontrada.' });
        return;
    }
    const { trackId } = req.body || {};
    if (!trackId || typeof trackId !== 'string' || !(0, database_1.getTrackById)(trackId)) {
        res.status(400).json({ error: 'Faixa inválida ou não encontrada.' });
        return;
    }
    const nextPos = existing.tracks.length;
    database_1.db.prepare(`
    INSERT INTO playlist_tracks (playlist_id, track_id, position)
    VALUES (?, ?, ?)
  `).run(existing.id, trackId, nextPos);
    res.json({ playlist: (0, database_1.getPlaylistById)(existing.id) });
});
// DELETE /api/playlists/:id
exports.playlistsRouter.delete('/:id', auth_1.requireHostAuth, (req, res) => {
    const existing = (0, database_1.getPlaylistById)(req.params.id);
    if (!existing) {
        res.status(404).json({ error: 'Playlist não encontrada.' });
        return;
    }
    database_1.db.prepare('DELETE FROM playlists WHERE id = ?').run(existing.id);
    res.json({ ok: true });
});
