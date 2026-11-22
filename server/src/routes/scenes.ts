import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import {
  db,
  getAllScenes,
  getSceneById,
  notifyDbChanged,
  resolveValidProfileId,
} from '../db/database';
import { requireHostAuth } from '../middleware/auth';

export const scenesRouter = Router();

// GET /api/scenes (optionally filtered by ?profileId=...)
scenesRouter.get('/', (req: Request, res: Response) => {
  const profileId = typeof req.query.profileId === 'string' ? req.query.profileId : undefined;
  res.json({ scenes: getAllScenes(profileId) });
});

// POST /api/scenes
scenesRouter.post('/', requireHostAuth, (req: Request, res: Response) => {
  const { name, emoji, color, playlistId, ambientTrackId, ambientVolume, shortcutKey, profileId } =
    req.body || {};

  if (!name || typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'O nome da cena é obrigatório.' });
    return;
  }

  const headerProfileId = req.headers['x-master-profile-id'] as string | undefined;
  const resolvedProfileId = resolveValidProfileId(profileId || headerProfileId);
  const profileScenes = getAllScenes(resolvedProfileId);
  const id = `scene-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const safeEmoji = typeof emoji === 'string' && emoji.trim() ? emoji.trim().slice(0, 8) : '🎭';
  const safeColor = typeof color === 'string' && color.trim() ? color.trim().slice(0, 24) : '#10b981';
  const safePlaylistId = typeof playlistId === 'string' && playlistId ? playlistId : null;
  const safeAmbientId = typeof ambientTrackId === 'string' && ambientTrackId ? ambientTrackId : null;
  const safeAmbientVol =
    typeof ambientVolume === 'number'
      ? Math.max(0, Math.min(1, ambientVolume))
      : 0.35;
  const safeShortcut =
    typeof shortcutKey === 'number' && shortcutKey >= 1 && shortcutKey <= 9
      ? shortcutKey
      : profileScenes.length < 9
      ? profileScenes.length + 1
      : null;

  db.prepare(`
    INSERT INTO scene_buttons (
      id, profile_id, name, emoji, color, playlist_id, ambient_track_id, ambient_volume, shortcut_key, position, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    resolvedProfileId,
    name.trim().slice(0, 60),
    safeEmoji,
    safeColor,
    safePlaylistId,
    safeAmbientId,
    safeAmbientVol,
    safeShortcut,
    profileScenes.length,
    now
  );

  notifyDbChanged();
  res.status(201).json({ scene: getSceneById(id) });
});

// PATCH /api/scenes/:id
scenesRouter.patch('/:id', requireHostAuth, (req: Request, res: Response) => {
  const existing = getSceneById(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'Botão de cena não encontrado.' });
    return;
  }

  const { name, emoji, color, playlistId, ambientTrackId, ambientVolume, shortcutKey, position } =
    req.body || {};

  const nextName =
    typeof name === 'string' && name.trim() ? name.trim().slice(0, 60) : existing.name;
  const nextEmoji =
    typeof emoji === 'string' && emoji.trim() ? emoji.trim().slice(0, 8) : existing.emoji;
  const nextColor =
    typeof color === 'string' && color.trim() ? color.trim().slice(0, 24) : existing.color;
  const nextPlaylistId =
    playlistId === undefined ? existing.playlistId : playlistId || null;
  const nextAmbientId =
    ambientTrackId === undefined ? existing.ambientTrackId : ambientTrackId || null;
  const nextAmbientVol =
    typeof ambientVolume === 'number'
      ? Math.max(0, Math.min(1, ambientVolume))
      : existing.ambientVolume;
  const nextShortcut =
    shortcutKey === undefined
      ? existing.shortcutKey
      : typeof shortcutKey === 'number' && shortcutKey >= 1 && shortcutKey <= 9
      ? shortcutKey
      : null;
  const nextPos = typeof position === 'number' ? position : existing.position;

  db.prepare(`
    UPDATE scene_buttons
    SET name = ?, emoji = ?, color = ?, playlist_id = ?, ambient_track_id = ?,
        ambient_volume = ?, shortcut_key = ?, position = ?
    WHERE id = ?
  `).run(
    nextName,
    nextEmoji,
    nextColor,
    nextPlaylistId,
    nextAmbientId,
    nextAmbientVol,
    nextShortcut,
    nextPos,
    existing.id
  );

  notifyDbChanged();
  res.json({ scene: getSceneById(existing.id) });
});

// DELETE /api/scenes/:id
scenesRouter.delete('/:id', requireHostAuth, (req: Request, res: Response) => {
  const existing = getSceneById(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'Botão de cena não encontrado.' });
    return;
  }

  db.prepare('DELETE FROM scene_buttons WHERE id = ?').run(existing.id);
  notifyDbChanged();
  res.json({ ok: true });
});
