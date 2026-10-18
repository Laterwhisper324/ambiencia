import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import path from 'path';
import rateLimit from 'express-rate-limit';
import { config } from '../config';
import { db, getAllTracks, getTrackById } from '../db/database';
import { getStorageProvider, sanitizeFilename } from '../storage/StorageProvider';
import { fetchYouTubeMetadata } from '../utils/youtube';
import { requireHostAuth } from '../middleware/auth';

export const tracksRouter = Router();

const uploadRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 40, // max 40 uploads per 15 min per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Limite de taxa de upload excedido. Aguarde alguns minutos antes de enviar mais arquivos.',
  },
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.maxUploadBytes,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const allowedMime = [
      'audio/mpeg',
      'audio/mp3',
      'audio/x-mp3',
      'audio/mpeg3',
      'audio/wav',
      'audio/x-wav',
      'audio/wave',
    ];
    if (ext !== '.mp3' && ext !== '.wav') {
      cb(new Error('Formato inválido: apenas arquivos .mp3 (ou .wav) são permitidos.'));
      return;
    }
    if (!allowedMime.includes(file.mimetype.toLowerCase()) && file.mimetype !== 'application/octet-stream') {
      cb(new Error(`Tipo MIME não suportado (${file.mimetype}). Envie um arquivo MP3 válido.`));
      return;
    }
    cb(null, true);
  },
});

/**
 * Checks if buffer starts with valid MP3 (ID3 tag or MPEG frame sync) or RIFF WAV header.
 */
function hasValidAudioSignature(buf: Buffer): boolean {
  if (buf.length < 4) return false;
  // ID3v2 tag ("ID3")
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return true;
  // MPEG Audio Frame Sync (0xFF followed by 0xE0..0xFF)
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return true;
  // RIFF WAVE ("RIFF")
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) return true;
  // Some MP3s have leading zero padding before frame sync
  for (let i = 0; i < Math.min(buf.length - 2, 512); i++) {
    if (buf[i] === 0xff && (buf[i + 1] & 0xe0) === 0xe0) return true;
  }
  return false;
}

// GET /api/tracks
tracksRouter.get('/', (req: Request, res: Response) => {
  const search = typeof req.query.search === 'string' ? req.query.search : undefined;
  const tag = typeof req.query.tag === 'string' ? req.query.tag : undefined;
  const tracks = getAllTracks(search, tag);
  res.json({ tracks, maxUploadMb: config.maxUploadMb });
});

// GET /api/tracks/:id/stream (HTTP Streaming with Range Requests)
tracksRouter.get('/:id/stream', async (req: Request, res: Response) => {
  try {
    const track = getTrackById(req.params.id);
    if (!track || track.sourceType !== 'mp3' || !track.storageKey) {
      res.status(404).json({ error: 'Faixa de áudio local não encontrada.' });
      return;
    }
    const storage = getStorageProvider();
    await storage.streamFile(track.storageKey, req, res, track.mimeType || 'audio/mpeg');
  } catch (err) {
    console.error('[Tracks] Erro ao transmitir faixa:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Erro interno ao transmitir arquivo de áudio.' });
    }
  }
});

// POST /api/tracks/upload
tracksRouter.post(
  '/upload',
  requireHostAuth,
  uploadRateLimiter,
  (req: Request, res: Response, next: NextFunction) => {
    upload.single('file')(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          res.status(413).json({
            error: `O arquivo excede o tamanho máximo permitido de ${config.maxUploadMb} MB.`,
          });
          return;
        }
        res.status(400).json({ error: `Erro no upload: ${err.message}` });
        return;
      }
      if (err instanceof Error) {
        res.status(400).json({ error: err.message });
        return;
      }
      next();
    });
  },
  async (req: Request, res: Response) => {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: 'Nenhum arquivo de áudio foi enviado.' });
        return;
      }

      if (!hasValidAudioSignature(file.buffer)) {
        res.status(400).json({
          error: 'O arquivo enviado não possui assinatura válida de áudio MP3/WAV.',
        });
        return;
      }

      const safeOriginal = sanitizeFilename(file.originalname);
      const storage = getStorageProvider();
      const { storageKey, sizeBytes } = await storage.saveFile(
        file.buffer,
        safeOriginal,
        file.mimetype || 'audio/mpeg'
      );

      const rawTitle =
        typeof req.body.title === 'string' && req.body.title.trim()
          ? req.body.title.trim()
          : path.basename(file.originalname, path.extname(file.originalname)).replace(/[_-]+/g, ' ');

      let tags: string[] = ['mp3'];
      if (typeof req.body.tags === 'string' && req.body.tags.trim()) {
        try {
          const parsed = JSON.parse(req.body.tags);
          if (Array.isArray(parsed)) tags = parsed.map((t) => String(t).trim()).filter(Boolean);
        } catch {
          tags = req.body.tags
            .split(',')
            .map((t: string) => t.trim())
            .filter(Boolean);
        }
      }

      const durationSec = parseFloat(req.body.durationSec) || 0;
      const isAmbient = req.body.isAmbient === 'true' || req.body.isAmbient === true;
      const id = `track-${crypto.randomUUID()}`;
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO tracks (
          id, title, source_type, storage_key, original_filename, mime_type,
          size_bytes, youtube_id, youtube_url, thumbnail_url, duration_sec, tags, is_ambient, created_at
        ) VALUES (?, ?, 'mp3', ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, ?)
      `).run(
        id,
        rawTitle.slice(0, 140),
        storageKey,
        safeOriginal,
        file.mimetype || 'audio/mpeg',
        sizeBytes,
        durationSec,
        JSON.stringify(tags),
        isAmbient ? 1 : 0,
        now
      );

      const created = getTrackById(id);
      res.status(201).json({ track: created });
    } catch (err) {
      console.error('[Tracks] Erro ao salvar upload:', err);
      res.status(500).json({ error: 'Falha ao salvar o arquivo de áudio.' });
    }
  }
);

// POST /api/tracks/youtube
tracksRouter.post('/youtube', requireHostAuth, async (req: Request, res: Response) => {
  try {
    const { url, title, tags, isAmbient } = req.body || {};
    if (!url || typeof url !== 'string') {
      res.status(400).json({ error: 'Informe uma URL válida do YouTube.' });
      return;
    }

    const metadata = await fetchYouTubeMetadata(url, title);
    const id = `track-${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    const cleanTags: string[] = Array.isArray(tags)
      ? tags.map((t) => String(t).trim()).filter(Boolean)
      : typeof tags === 'string'
      ? tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
      : ['youtube'];

    if (!cleanTags.includes('youtube')) {
      cleanTags.push('youtube');
    }

    db.prepare(`
      INSERT INTO tracks (
        id, title, source_type, storage_key, original_filename, mime_type,
        size_bytes, youtube_id, youtube_url, thumbnail_url, duration_sec, tags, is_ambient, created_at
      ) VALUES (?, ?, 'youtube', NULL, NULL, NULL, NULL, ?, ?, ?, 0, ?, ?, ?)
    `).run(
      id,
      metadata.title.slice(0, 140),
      metadata.videoId,
      metadata.canonicalUrl,
      metadata.thumbnailUrl,
      JSON.stringify(cleanTags),
      isAmbient ? 1 : 0,
      now
    );

    const created = getTrackById(id);
    res.status(201).json({ track: created });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao adicionar link do YouTube.';
    res.status(400).json({ error: message });
  }
});

// PATCH /api/tracks/:id (Rename, edit tags, toggle ambient, update duration)
tracksRouter.patch('/:id', requireHostAuth, (req: Request, res: Response) => {
  const existing = getTrackById(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'Faixa não encontrada.' });
    return;
  }

  const { title, tags, isAmbient, durationSec } = req.body || {};
  const nextTitle =
    typeof title === 'string' && title.trim() ? title.trim().slice(0, 140) : existing.title;

  let nextTags = existing.tags;
  if (Array.isArray(tags)) {
    nextTags = tags.map((t) => String(t).trim()).filter(Boolean);
  } else if (typeof tags === 'string') {
    nextTags = tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
  }

  const nextAmbient = typeof isAmbient === 'boolean' ? isAmbient : existing.isAmbient;
  const nextDuration =
    typeof durationSec === 'number' && durationSec >= 0 ? durationSec : existing.durationSec;

  db.prepare(`
    UPDATE tracks
    SET title = ?, tags = ?, is_ambient = ?, duration_sec = ?
    WHERE id = ?
  `).run(nextTitle, JSON.stringify(nextTags), nextAmbient ? 1 : 0, nextDuration, existing.id);

  res.json({ track: getTrackById(existing.id) });
});

// DELETE /api/tracks/:id
tracksRouter.delete('/:id', requireHostAuth, async (req: Request, res: Response) => {
  const existing = getTrackById(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'Faixa não encontrada.' });
    return;
  }

  db.prepare('DELETE FROM tracks WHERE id = ?').run(existing.id);

  if (existing.sourceType === 'mp3' && existing.storageKey) {
    const storage = getStorageProvider();
    await storage.deleteFile(existing.storageKey);
  }

  res.json({ ok: true });
});
