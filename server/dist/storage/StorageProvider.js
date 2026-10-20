"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.S3StorageProvider = exports.LocalDiskStorageProvider = void 0;
exports.sanitizeFilename = sanitizeFilename;
exports.getStorageProvider = getStorageProvider;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const config_1 = require("../config");
/**
 * Sanitizes an untrusted filename, removing path traversal sequences,
 * directory separators, and special characters.
 */
function sanitizeFilename(rawName) {
    const base = path_1.default.basename(rawName || 'audio.mp3');
    const ext = path_1.default.extname(base).toLowerCase();
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
/**
 * Local Disk Storage Provider (default).
 * Stores files inside UPLOAD_DIR and serves them with HTTP Range request support (206 Partial Content).
 */
class LocalDiskStorageProvider {
    uploadDir;
    constructor(uploadDir) {
        this.uploadDir = path_1.default.resolve(uploadDir);
        if (!fs_1.default.existsSync(this.uploadDir)) {
            fs_1.default.mkdirSync(this.uploadDir, { recursive: true });
        }
    }
    /**
     * Resolves a storage key safely within uploadDir and prevents path traversal.
     */
    resolveSafePath(storageKey) {
        const cleanKey = path_1.default.basename(storageKey);
        if (!cleanKey || cleanKey.includes('..') || cleanKey.includes('/') || cleanKey.includes('\\')) {
            throw new Error('Chave de armazenamento inválida (tentativa de path traversal bloqueada).');
        }
        const resolved = path_1.default.resolve(this.uploadDir, cleanKey);
        const rootWithSep = this.uploadDir.endsWith(path_1.default.sep)
            ? this.uploadDir
            : `${this.uploadDir}${path_1.default.sep}`;
        if (resolved !== this.uploadDir && !resolved.startsWith(rootWithSep)) {
            throw new Error('Acesso fora do diretório de uploads bloqueado.');
        }
        return resolved;
    }
    async saveFile(buffer, originalName, _mimeType, fixedKey) {
        const safeName = sanitizeFilename(originalName);
        const storageKey = fixedKey
            ? sanitizeFilename(fixedKey)
            : `${crypto_1.default.randomUUID()}-${safeName}`;
        const targetPath = this.resolveSafePath(storageKey);
        await fs_1.default.promises.writeFile(targetPath, buffer);
        return {
            storageKey,
            sizeBytes: buffer.byteLength,
        };
    }
    async deleteFile(storageKey) {
        try {
            const targetPath = this.resolveSafePath(storageKey);
            if (fs_1.default.existsSync(targetPath)) {
                await fs_1.default.promises.unlink(targetPath);
            }
        }
        catch (err) {
            console.warn(`[Storage] Aviso ao remover arquivo ${storageKey}:`, err);
        }
    }
    async fileExists(storageKey) {
        try {
            const targetPath = this.resolveSafePath(storageKey);
            await fs_1.default.promises.access(targetPath, fs_1.default.constants.R_OK);
            return true;
        }
        catch {
            return false;
        }
    }
    async streamFile(storageKey, req, res, mimeType = 'audio/mpeg') {
        const targetPath = this.resolveSafePath(storageKey);
        if (!fs_1.default.existsSync(targetPath)) {
            res.status(404).json({ error: 'Arquivo de áudio não encontrado no armazenamento.' });
            return;
        }
        const stat = await fs_1.default.promises.stat(targetPath);
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
            const stream = fs_1.default.createReadStream(targetPath, { start, end });
            stream.on('error', (err) => {
                console.error('[Storage] Erro no stream parcial:', err);
                if (!res.headersSent)
                    res.status(500).end();
            });
            stream.pipe(res);
        }
        else {
            res.writeHead(200, {
                'Content-Length': fileSize,
                'Content-Type': mimeType,
            });
            const stream = fs_1.default.createReadStream(targetPath);
            stream.on('error', (err) => {
                console.error('[Storage] Erro no stream completo:', err);
                if (!res.headersSent)
                    res.status(500).end();
            });
            stream.pipe(res);
        }
    }
}
exports.LocalDiskStorageProvider = LocalDiskStorageProvider;
/**
 * S3 / Cloudflare R2 Compatible Storage Provider.
 * Activated by setting STORAGE_PROVIDER=s3 in environment variables.
 */
class S3StorageProvider {
    client;
    s3Mod;
    presignerMod;
    bucket;
    publicBaseUrl;
    constructor() {
        const dynReq = typeof require !== 'undefined' ? require : null;
        if (!dynReq) {
            throw new Error('S3StorageProvider requer suporte a CommonJS require.');
        }
        this.s3Mod = dynReq('@aws-sdk/client-s3');
        this.presignerMod = dynReq('@aws-sdk/s3-request-presigner');
        this.bucket = config_1.config.s3.bucket;
        this.publicBaseUrl = config_1.config.s3.publicBaseUrl.replace(/\/$/, '');
        this.client = new this.s3Mod.S3Client({
            region: config_1.config.s3.region || 'auto',
            endpoint: config_1.config.s3.endpoint || undefined,
            credentials: {
                accessKeyId: config_1.config.s3.accessKeyId,
                secretAccessKey: config_1.config.s3.secretAccessKey,
            },
        });
    }
    async saveFile(buffer, originalName, mimeType, fixedKey) {
        const safeName = sanitizeFilename(originalName);
        const storageKey = fixedKey
            ? sanitizeFilename(fixedKey)
            : `${crypto_1.default.randomUUID()}-${safeName}`;
        await this.client.send(new this.s3Mod.PutObjectCommand({
            Bucket: this.bucket,
            Key: storageKey,
            Body: buffer,
            ContentType: mimeType || 'audio/mpeg',
        }));
        return {
            storageKey,
            sizeBytes: buffer.byteLength,
        };
    }
    async deleteFile(storageKey) {
        try {
            const cleanKey = sanitizeFilename(storageKey);
            await this.client.send(new this.s3Mod.DeleteObjectCommand({
                Bucket: this.bucket,
                Key: cleanKey,
            }));
        }
        catch (err) {
            console.warn(`[S3Storage] Aviso ao excluir objeto ${storageKey}:`, err);
        }
    }
    async fileExists(storageKey) {
        try {
            const cleanKey = sanitizeFilename(storageKey);
            await this.client.send(new this.s3Mod.HeadObjectCommand({
                Bucket: this.bucket,
                Key: cleanKey,
            }));
            return true;
        }
        catch {
            return false;
        }
    }
    async streamFile(storageKey, _req, res, _mimeType = 'audio/mpeg') {
        const cleanKey = sanitizeFilename(storageKey);
        if (this.publicBaseUrl) {
            res.redirect(302, `${this.publicBaseUrl}/${encodeURIComponent(cleanKey)}`);
            return;
        }
        const command = new this.s3Mod.GetObjectCommand({
            Bucket: this.bucket,
            Key: cleanKey,
        });
        const signedUrl = await this.presignerMod.getSignedUrl(this.client, command, {
            expiresIn: 3600,
        });
        res.redirect(302, signedUrl);
    }
}
exports.S3StorageProvider = S3StorageProvider;
let storageInstance = null;
function getStorageProvider() {
    if (!storageInstance) {
        if (config_1.config.storageProvider === 's3') {
            console.log('[Storage] Inicializando S3StorageProvider (S3 / Cloudflare R2)');
            storageInstance = new S3StorageProvider();
        }
        else {
            console.log(`[Storage] Inicializando LocalDiskStorageProvider em: ${config_1.config.uploadDir}`);
            storageInstance = new LocalDiskStorageProvider(config_1.config.uploadDir);
        }
    }
    return storageInstance;
}
