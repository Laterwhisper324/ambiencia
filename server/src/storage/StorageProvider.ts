import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { Request, Response } from 'express';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config';

/**
 * Sanitizes an untrusted filename, removing path traversal sequences,
 * directory separators, and special characters.
 */
export function sanitizeFilename(rawName: string): string {
  const base = path.basename(rawName || 'audio.mp3');
  const ext = path.extname(base).toLowerCase();
  const allowedExts = ['.mp3', '.m4a', '.wav', '.aac', '.ogg'];
  const safeExt = allowedExts.includes(ext) ? ext : '.mp3';
  const nameWithoutExt = base.slice(0, base.length - ext.length);

  const slug = nameWithoutExt
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);

  return `${slug || 'faixa'}${safeExt}`;
}

export interface StorageProvider {
  saveFile(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
    fixedKey?: string
  ): Promise<{ storageKey: string; sizeBytes: number }>;
  deleteFile(storageKey: string): Promise<void>;
  streamFile(
    storageKey: string,
    req: Request,
    res: Response,
    mimeType?: string
  ): Promise<void>;
  fileExists(storageKey: string): Promise<boolean>;
}

/**
 * Local Disk Storage Provider (default).
 * Stores files inside UPLOAD_DIR and serves them with HTTP Range request support (206 Partial Content).
 */
export class LocalDiskStorageProvider implements StorageProvider {
  private readonly uploadDir: string;

  constructor(uploadDir: string) {
    this.uploadDir = path.resolve(uploadDir);
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  /**
   * Resolves a storage key safely within uploadDir and prevents path traversal.
   */
  private resolveSafePath(storageKey: string): string {
    const cleanKey = path.basename(storageKey);
    if (!cleanKey || cleanKey.includes('..') || cleanKey.includes('/') || cleanKey.includes('\\')) {
      throw new Error('Chave de armazenamento inválida (tentativa de path traversal bloqueada).');
    }
    const resolved = path.resolve(this.uploadDir, cleanKey);
    const rootWithSep = this.uploadDir.endsWith(path.sep)
      ? this.uploadDir
      : `${this.uploadDir}${path.sep}`;

    if (resolved !== this.uploadDir && !resolved.startsWith(rootWithSep)) {
      throw new Error('Acesso fora do diretório de uploads bloqueado.');
    }
    return resolved;
  }

  async saveFile(
    buffer: Buffer,
    originalName: string,
    _mimeType: string,
    fixedKey?: string
  ): Promise<{ storageKey: string; sizeBytes: number }> {
    const safeName = sanitizeFilename(originalName);
    const storageKey = fixedKey
      ? sanitizeFilename(fixedKey)
      : `${crypto.randomUUID()}-${safeName}`;
    const targetPath = this.resolveSafePath(storageKey);

    await fs.promises.writeFile(targetPath, buffer);
    return {
      storageKey,
      sizeBytes: buffer.byteLength,
    };
  }

  async deleteFile(storageKey: string): Promise<void> {
    try {
      const targetPath = this.resolveSafePath(storageKey);
      if (fs.existsSync(targetPath)) {
        await fs.promises.unlink(targetPath);
      }
    } catch (err) {
      console.warn(`[Storage] Aviso ao remover arquivo ${storageKey}:`, err);
    }
  }

  async fileExists(storageKey: string): Promise<boolean> {
    try {
      const targetPath = this.resolveSafePath(storageKey);
      await fs.promises.access(targetPath, fs.constants.R_OK);
      return true;
    } catch {
      return false;
    }
  }

  async streamFile(
    storageKey: string,
    req: Request,
    res: Response,
    mimeType = 'audio/mpeg'
  ): Promise<void> {
    const targetPath = this.resolveSafePath(storageKey);
    if (!fs.existsSync(targetPath)) {
      res.status(404).json({ error: 'Arquivo de áudio não encontrado no armazenamento.' });
      return;
    }

    const stat = await fs.promises.stat(targetPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (isNaN(start) || isNaN(end) || start >= fileSize || end >= fileSize || start > end) {
        res.status(416).setHeader('Content-Range', `bytes */${fileSize}`).end();
        return;
      }

      const chunkSize = end - start + 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Content-Length': chunkSize,
        'Content-Type': mimeType,
      });

      const stream = fs.createReadStream(targetPath, { start, end });
      stream.on('error', (err) => {
        console.error('[Storage] Erro no stream parcial:', err);
        if (!res.headersSent) res.status(500).end();
      });
      stream.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': mimeType,
      });
      const stream = fs.createReadStream(targetPath);
      stream.on('error', (err) => {
        console.error('[Storage] Erro no stream completo:', err);
        if (!res.headersSent) res.status(500).end();
      });
      stream.pipe(res);
    }
  }
}

/**
 * S3 / Cloudflare R2 Compatible Storage Provider.
 * Activated by setting STORAGE_PROVIDER=s3 in environment variables.
 */
export class S3StorageProvider implements StorageProvider {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;

  constructor() {
    this.bucket = config.s3.bucket;
    this.publicBaseUrl = config.s3.publicBaseUrl.replace(/\/$/, '');
    this.client = new S3Client({
      region: config.s3.region || 'auto',
      endpoint: config.s3.endpoint || undefined,
      credentials: {
        accessKeyId: config.s3.accessKeyId,
        secretAccessKey: config.s3.secretAccessKey,
      },
    });
  }

  async saveFile(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
    fixedKey?: string
  ): Promise<{ storageKey: string; sizeBytes: number }> {
    const safeName = sanitizeFilename(originalName);
    const storageKey = fixedKey
      ? sanitizeFilename(fixedKey)
      : `${crypto.randomUUID()}-${safeName}`;

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        Body: buffer,
        ContentType: mimeType || 'audio/mpeg',
      })
    );

    return {
      storageKey,
      sizeBytes: buffer.byteLength,
    };
  }

  async deleteFile(storageKey: string): Promise<void> {
    try {
      const cleanKey = sanitizeFilename(storageKey);
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: cleanKey,
        })
      );
    } catch (err) {
      console.warn(`[S3Storage] Aviso ao excluir objeto ${storageKey}:`, err);
    }
  }

  async fileExists(storageKey: string): Promise<boolean> {
    try {
      const cleanKey = sanitizeFilename(storageKey);
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: cleanKey,
        })
      );
      return true;
    } catch {
      return false;
    }
  }

  async streamFile(
    storageKey: string,
    _req: Request,
    res: Response,
    _mimeType = 'audio/mpeg'
  ): Promise<void> {
    const cleanKey = sanitizeFilename(storageKey);
    if (this.publicBaseUrl) {
      res.redirect(302, `${this.publicBaseUrl}/${encodeURIComponent(cleanKey)}`);
      return;
    }

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: cleanKey,
    });
    const signedUrl = await getSignedUrl(this.client, command, { expiresIn: 3600 });
    res.redirect(302, signedUrl);
  }
}

let storageInstance: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (!storageInstance) {
    if (config.storageProvider === 's3') {
      console.log('[Storage] Inicializando S3StorageProvider (S3 / Cloudflare R2)');
      storageInstance = new S3StorageProvider();
    } else {
      console.log(`[Storage] Inicializando LocalDiskStorageProvider em: ${config.uploadDir}`);
      storageInstance = new LocalDiskStorageProvider(config.uploadDir);
    }
  }
  return storageInstance;
}
