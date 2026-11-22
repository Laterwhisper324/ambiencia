import { Router, type Request, type Response } from 'express';
import { ZodError } from 'zod';
import { requireHostAuth } from '../middleware/auth';
import {
  applyLibrarySnapshot,
  buildLibrarySnapshot,
  getCloudSyncStatus,
  syncToCloudNow,
} from '../db/cloudPersistence';

export const backupRouter = Router();

// GET /api/backup/status — Public read-only status of cloud persistence & item counts
backupRouter.get('/status', (_req: Request, res: Response) => {
  res.json({ status: getCloudSyncStatus() });
});

// GET /api/backup/export — Export link tracks, profiles, playlists & scenes as JSON (Host only)
backupRouter.get('/export', requireHostAuth, (req: Request, res: Response) => {
  const snapshot = buildLibrarySnapshot();
  if (req.query.download === '1' || req.query.download === 'true') {
    const dateSlug = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="ambiencia-backup-${dateSlug}.json"`
    );
    res.send(JSON.stringify(snapshot, null, 2));
    return;
  }

  res.json({ snapshot });
});

// POST /api/backup/import — Import a JSON backup (merge or replace) and immediately sync to cloud (Host only)
backupRouter.post('/import', requireHostAuth, async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const mode: 'merge' | 'replace' = body.mode === 'replace' ? 'replace' : 'merge';
    const rawSnapshot = body.snapshot ?? body;

    const result = applyLibrarySnapshot(rawSnapshot, { mode });
    const syncedToCloud = await syncToCloudNow();

    res.json({
      ok: true,
      mode,
      result,
      syncedToCloud,
      status: getCloudSyncStatus(),
    });
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(400).json({
        error: 'Arquivo JSON de backup inválido ou incompatível.',
        details: err.issues.slice(0, 5),
      });
      return;
    }
    const message =
      err instanceof Error ? err.message : 'Falha ao importar o backup JSON.';
    res.status(400).json({ error: message });
  }
});

// POST /api/backup/sync — Force immediate cloud sync to Upstash Redis (Host only)
backupRouter.post('/sync', requireHostAuth, async (_req: Request, res: Response) => {
  const statusBefore = getCloudSyncStatus();
  if (!statusBefore.enabled) {
    res.status(400).json({
      error:
        'Upstash Redis não está configurado neste servidor. Configure UPSTASH_REDIS_REST_URL e UPSTASH_REDIS_REST_TOKEN.',
      status: statusBefore,
    });
    return;
  }

  const synced = await syncToCloudNow();
  res.json({
    ok: synced,
    status: getCloudSyncStatus(),
  });
});
