import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import { db, getAllPlaylists, getPlaylistById, getTrackById } from '../db/database';
import { requireHostAuth } from '../middleware/auth';

export const playlistsRouter = Router();

// GET /api/playlists
playlistsRouter.get('/', (_req: Request, res: Response) => {
  res.json({ playlists: getAllPlaylists() });
});

// POST /api/playlists
playlistsRouter.post('/', requireHostAuth, (req: Request, res: Response) => {
  const { name, description, trackIds } = req.body || {};
  if (!name || typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'O nome da playlist é obrigatório.' });
    return;
  }

  const id = `playlist-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const desc = typeof description === 'string' ? description.trim().slice(0, 300) : '';

  const createTx = db.transaction(() => {
    db.prepare(`
      INSERT INTO playlists (id, name, description, created_at)
      VALUES (?, ?, ?, ?)
    `).run(id, name.trim().slice(0, 100), desc, now);

    if (Array.isArray(trackIds)) {
      const insertPt = db.prepare(`
        INSERT INTO playlist_tracks (playlist_id, track_id, position)
        VALUES (?, ?, ?)
      `);
      trackIds.forEach((tid, idx) => {
        if (typeof tid === 'string' && getTrackById(tid)) {
          insertPt.run(id, tid, idx);
        }
      });
    }
  });

  createTx();
  res.status(201).json({ playlist: getPlaylistById(id) });
});

// PATCH /api/playlists/:id (Rename / update description)
playlistsRouter.patch('/:id', requireHostAuth, (req: Request, res: Response) => {
  const existing = getPlaylistById(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'Playlist não encontrada.' });
    return;
  }

  const { name, description } = req.body || {};
  const nextName =
    typeof name === 'string' && name.trim() ? name.trim().slice(0, 100) : existing.name;
  const nextDesc =
    typeof description === 'string' ? description.trim().slice(0, 300) : existing.description;

  db.prepare('UPDATE playlists SET name = ?, description = ? WHERE id = ?').run(
    nextName,
    nextDesc,
    existing.id
  );

  res.json({ playlist: getPlaylistById(existing.id) });
});

// POST /api/playlists/:id/duplicate
playlistsRouter.post('/:id/duplicate', requireHostAuth, (req: Request, res: Response) => {
  const existing = getPlaylistById(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'Playlist original não encontrada.' });
    return;
  }

  const newId = `playlist-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const customName =
    typeof req.body?.name === 'string' && req.body.name.trim()
      ? req.body.name.trim().slice(0, 100)
      : `${existing.name} (Cópia)`;

  const dupTx = db.transaction(() => {
    db.prepare(`
      INSERT INTO playlists (id, name, description, created_at)
      VALUES (?, ?, ?, ?)
    `).run(newId, customName, existing.description, now);

    const insertPt = db.prepare(`
      INSERT INTO playlist_tracks (playlist_id, track_id, position)
      VALUES (?, ?, ?)
    `);
    existing.tracks.forEach((track, idx) => {
      insertPt.run(newId, track.id, idx);
    });
  });

  dupTx();
  res.status(201).json({ playlist: getPlaylistById(newId) });
});

// PUT /api/playlists/:id/tracks (Reorder or replace tracks in playlist)
playlistsRouter.put('/:id/tracks', requireHostAuth, (req: Request, res: Response) => {
  const existing = getPlaylistById(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'Playlist não encontrada.' });
    return;
  }

  const { trackIds } = req.body || {};
  if (!Array.isArray(trackIds)) {
    res.status(400).json({ error: 'Envie um array trackIds com a nova ordem das faixas.' });
    return;
  }

  const updateTracksTx = db.transaction(() => {
    db.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ?').run(existing.id);
    const insertPt = db.prepare(`
      INSERT INTO playlist_tracks (playlist_id, track_id, position)
      VALUES (?, ?, ?)
    `);
    trackIds.forEach((tid, index) => {
      if (typeof tid === 'string' && getTrackById(tid)) {
        insertPt.run(existing.id, tid, index);
      }
    });
  });

  updateTracksTx();
  res.json({ playlist: getPlaylistById(existing.id) });
});

// POST /api/playlists/:id/tracks (Add a track to the end of the playlist)
playlistsRouter.post('/:id/tracks', requireHostAuth, (req: Request, res: Response) => {
  const existing = getPlaylistById(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'Playlist não encontrada.' });
    return;
  }

  const { trackId } = req.body || {};
  if (!trackId || typeof trackId !== 'string' || !getTrackById(trackId)) {
    res.status(400).json({ error: 'Faixa inválida ou não encontrada.' });
    return;
  }

  const nextPos = existing.tracks.length;
  db.prepare(`
    INSERT INTO playlist_tracks (playlist_id, track_id, position)
    VALUES (?, ?, ?)
  `).run(existing.id, trackId, nextPos);

  res.json({ playlist: getPlaylistById(existing.id) });
});

// DELETE /api/playlists/:id
playlistsRouter.delete('/:id', requireHostAuth, (req: Request, res: Response) => {
  const existing = getPlaylistById(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'Playlist não encontrada.' });
    return;
  }

  db.prepare('DELETE FROM playlists WHERE id = ?').run(existing.id);
  res.json({ ok: true });
});
