import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import {
  db,
  getAllProfiles,
  getProfileById,
  notifyDbChanged,
} from '../db/database';
import { requireHostAuth } from '../middleware/auth';

export const profilesRouter = Router();

// GET /api/profiles
profilesRouter.get('/', (_req: Request, res: Response) => {
  res.json({ profiles: getAllProfiles() });
});

// POST /api/profiles
profilesRouter.post('/', requireHostAuth, (req: Request, res: Response) => {
  const { name, avatar, color, description } = req.body || {};

  if (!name || typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'O nome do perfil de mestre é obrigatório.' });
    return;
  }

  const id = `profile-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const safeName = name.trim().slice(0, 60);
  const safeAvatar =
    typeof avatar === 'string' && avatar.trim() ? avatar.trim().slice(0, 8) : '🎭';
  const safeColor =
    typeof color === 'string' && color.trim() ? color.trim().slice(0, 24) : '#cc001e';
  const safeDesc =
    typeof description === 'string' ? description.trim().slice(0, 200) : '';

  db.prepare(`
    INSERT INTO master_profiles (id, name, avatar, color, description, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, safeName, safeAvatar, safeColor, safeDesc, now);

  notifyDbChanged();
  res.status(201).json({ profile: getProfileById(id) });
});

// PATCH /api/profiles/:id
profilesRouter.patch('/:id', requireHostAuth, (req: Request, res: Response) => {
  const existing = getProfileById(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'Perfil de mestre não encontrado.' });
    return;
  }

  const { name, avatar, color, description } = req.body || {};
  const nextName =
    typeof name === 'string' && name.trim() ? name.trim().slice(0, 60) : existing.name;
  const nextAvatar =
    typeof avatar === 'string' && avatar.trim() ? avatar.trim().slice(0, 8) : existing.avatar;
  const nextColor =
    typeof color === 'string' && color.trim() ? color.trim().slice(0, 24) : existing.color;
  const nextDesc =
    typeof description === 'string' ? description.trim().slice(0, 200) : existing.description;

  db.prepare(`
    UPDATE master_profiles
    SET name = ?, avatar = ?, color = ?, description = ?
    WHERE id = ?
  `).run(nextName, nextAvatar, nextColor, nextDesc, existing.id);

  notifyDbChanged();
  res.json({ profile: getProfileById(existing.id) });
});

// DELETE /api/profiles/:id
profilesRouter.delete('/:id', requireHostAuth, (req: Request, res: Response) => {
  const existing = getProfileById(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'Perfil de mestre não encontrado.' });
    return;
  }

  const countRow = db
    .prepare('SELECT COUNT(*) as total FROM master_profiles')
    .get() as { total: number };
  if (countRow.total <= 1) {
    res.status(400).json({
      error: 'Não é possível excluir o único perfil de mestre existente.',
    });
    return;
  }

  const deleteTx = db.transaction(() => {
    db.prepare('DELETE FROM master_profiles WHERE id = ?').run(existing.id);
  });
  deleteTx();

  notifyDbChanged();
  res.json({ ok: true, profiles: getAllProfiles() });
});
