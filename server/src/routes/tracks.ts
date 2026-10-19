import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import path from 'path';
import rateLimit from 'express-rate-limit';
import { config } from '../config';
import { db, getAllTracks, getPlaylistById, getTrackById } from '../db/database';
import { getStorageProvider, sanitizeFilename } from '../storage/StorageProvider';
import {
  extractYouTubeId,
  extractYouTubePlaylistId,
  fetchYouTubeMetadata,
  fetchYouTubePlaylistMetadata,
} from '../utils/youtube';
import { requireHostAuth } from '../middleware/auth';
import type { Track } from '../types';

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
    const allowedExts = ['.mp3', '.m4a', '.wav', '.aac', '.ogg'];
    const allowedMime = [
      'audio/mpeg',
      'audio/mp3',
      'audio/x-mp3',
      'audio/mpeg3',
      'audio/mp4',
      'audio/x-m4a',
      'audio/m4a',
      'audio/aac',
      'audio/x-aac',
      'video/mp4',
      'audio/wav',
      'audio/x-wav',
      'audio/wave',
      'audio/ogg',
      'application/ogg',
    ];
    if (!allowedExts.includes(ext)) {
      cb(
        new Error(
          'Formato inválido: apenas arquivos de áudio .mp3, .m4a (ou .wav/.aac/.ogg) são permitidos.'
        )
      );
      return;
    }
    if (
      !allowedMime.includes(file.mimetype.toLowerCase()) &&
      file.mimetype !== 'application/octet-stream'
    ) {
      cb(
        new Error(
          `Tipo MIME não suportado (${file.mimetype}). Envie um arquivo MP3 ou M4A válido.`
        )
      );
      return;
    }
    cb(null, true);
  },
});

/**
 * Checks if buffer starts with a valid audio signature:
 * - MP3 (ID3v2 tag or MPEG frame sync)
 * - M4A / MP4 ISO Base Media container ('ftyp', 'moov', 'mdat', 'styp', 'free', 'wide')
 * - WAV ('RIFF')
 * - Ogg ('OggS')
 */
function hasValidAudioSignature(buf: Buffer): boolean {
  if (buf.length < 8) return false;
  // ID3v2 tag ("ID3")
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return true;
  // MPEG / AAC ADTS Audio Frame Sync (0xFF followed by 0xE0..0xFF)
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return true;
  // RIFF WAVE ("RIFF")
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) return true;
  // Ogg ("OggS")
  if (buf[0] === 0x4f && buf[1] === 0x67 && buf[2] === 0x67 && buf[3] === 0x53) return true;

  // M4A / MP4 ISO Base Media File Format: box type at bytes 4..7 is 'ftyp', 'moov', 'mdat', 'styp', 'wide', or 'free'
  const boxType = buf.subarray(4, 8).toString('ascii');
  if (['ftyp', 'moov', 'mdat', 'styp', 'wide', 'free'].includes(boxType)) {
    return true;
  }

  // Scan first 512 bytes for MPEG frame sync or 'ftyp'
  const scanLen = Math.min(buf.length - 4, 512);
  for (let i = 0; i < scanLen; i++) {
    if (buf[i] === 0xff && (buf[i + 1] & 0xe0) === 0xe0) return true;
    if (
      buf[i] === 0x66 &&
      buf[i + 1] === 0x74 &&
      buf[i + 2] === 0x79 &&
      buf[i + 3] === 0x70
    ) {
      return true;
    }
  }
  return false;
}

function resolveStreamMimeType(storageKey: string, storedMime?: string | null): string {
  const ext = path.extname(storageKey).toLowerCase();
  if (ext === '.m4a') return 'audio/mp4';
  if (ext === '.wav') return 'audio/wav';
  if (ext === '.ogg') return 'audio/ogg';
  if (ext === '.aac') return 'audio/aac';
  if (
    storedMime &&
    (storedMime.includes('m4a') || storedMime === 'video/mp4' || storedMime === 'audio/mp4')
  ) {
    return 'audio/mp4';
  }
  return storedMime || 'audio/mpeg';
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
    const contentType = resolveStreamMimeType(track.storageKey, track.mimeType);
    await storage.streamFile(track.storageKey, req, res, contentType);
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
          error: 'O arquivo enviado não possui assinatura válida de áudio (MP3, M4A ou WAV).',
        });
        return;
      }

      const safeOriginal = sanitizeFilename(file.originalname);
      const ext = path.extname(safeOriginal).toLowerCase();
      const normalizedMime = ext === '.m4a' ? 'audio/mp4' : file.mimetype || 'audio/mpeg';

      const storage = getStorageProvider();
      const { storageKey, sizeBytes } = await storage.saveFile(
        file.buffer,
        safeOriginal,
        normalizedMime
      );

      const rawTitle =
        typeof req.body.title === 'string' && req.body.title.trim()
          ? req.body.title.trim()
          : path
              .basename(file.originalname, path.extname(file.originalname))
              .replace(/[_-]+/g, ' ');

      const defaultFormatTag = ext === '.m4a' ? 'm4a' : 'mp3';
      let tags: string[] = [defaultFormatTag];
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
      if (!tags.includes(defaultFormatTag)) {
        tags.push(defaultFormatTag);
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
        normalizedMime,
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

// POST /api/tracks/youtube (Supports single video links AND YouTube / YouTube Music playlist links)
tracksRouter.post('/youtube', requireHostAuth, async (req: Request, res: Response) => {
  try {
    const { url, title, tags, isAmbient, targetPlaylistId } = req.body || {};
    if (!url || typeof url !== 'string') {
      res.status(400).json({ error: 'Informe uma URL válida do YouTube ou YouTube Music.' });
      return;
    }

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

    const playlistId = extractYouTubePlaylistId(url);
    const directVideoId = extractYouTubeId(url);

    // If URL has a playlist ID (e.g. music.youtube.com/playlist?list=... or watch?v=...&list=...)
    if (playlistId && (!directVideoId || url.includes('/playlist') || req.body.importPlaylist !== false)) {
      try {
        const plResult = await fetchYouTubePlaylistMetadata(url, title);
        const now = new Date().toISOString();
        const createdTracks: Track[] = [];

        const insertTrackStmt = db.prepare(`
          INSERT INTO tracks (
            id, title, source_type, storage_key, original_filename, mime_type,
            size_bytes, youtube_id, youtube_url, thumbnail_url, duration_sec, tags, is_ambient, created_at
          ) VALUES (?, ?, 'youtube', NULL, NULL, NULL, NULL, ?, ?, ?, 0, ?, ?, ?)
        `);

        const newPlaylistId =
          typeof targetPlaylistId === 'string' && targetPlaylistId.trim()
            ? targetPlaylistId.trim()
            : `playlist-${crypto.randomUUID()}`;

        const importTx = db.transaction(() => {
          // If no existing targetPlaylistId was given, create a new Playlist in Ambiência for this YouTube Music playlist
          const existingPl = getPlaylistById(newPlaylistId);
          let startPos = 0;

          if (!existingPl) {
            db.prepare(`
              INSERT INTO playlists (id, name, description, created_at)
              VALUES (?, ?, ?, ?)
            `).run(
              newPlaylistId,
              plResult.playlistTitle.slice(0, 100),
              `Importada do YouTube / YouTube Music (${plResult.tracks.length} faixas)`,
              now
            );
          } else {
            startPos = existingPl.tracks.length;
          }

          const insertPtStmt = db.prepare(`
            INSERT INTO playlist_tracks (playlist_id, track_id, position)
            VALUES (?, ?, ?)
          `);

          plResult.tracks.forEach((meta, idx) => {
            const trackId = `track-${crypto.randomUUID()}`;
            insertTrackStmt.run(
              trackId,
              meta.title.slice(0, 140),
              meta.videoId,
              meta.canonicalUrl,
              meta.thumbnailUrl,
              JSON.stringify(cleanTags),
              isAmbient ? 1 : 0,
              now
            );
            insertPtStmt.run(newPlaylistId, trackId, startPos + idx);
            const tObj = getTrackById(trackId);
            if (tObj) createdTracks.push(tObj);
          });
        });

        importTx();

        const createdPlaylist = getPlaylistById(newPlaylistId);
        res.status(201).json({
          track: createdTracks[0] || null,
          tracks: createdTracks,
          playlist: createdPlaylist,
          isPlaylistImport: true,
        });
        return;
      } catch (playlistErr) {
        // If it also had a direct videoId (like watch?v=...&list=RD...), fall back to adding the single video
        if (!directVideoId) {
          throw playlistErr;
        }
      }
    }

    // Single video URL
    const metadata = await fetchYouTubeMetadata(url, title);
    const id = `track-${crypto.randomUUID()}`;
    const now = new Date().toISOString();

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
    res.status(201).json({ track: created, tracks: created ? [created] : [], isPlaylistImport: false });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Erro ao adicionar link do YouTube / YouTube Music.';
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
