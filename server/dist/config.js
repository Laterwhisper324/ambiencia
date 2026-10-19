"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config();
const rootDir = process.cwd();
const isVercel = Boolean(process.env.VERCEL);
exports.config = {
    port: parseInt(process.env.PORT || '3001', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    corsOrigins: (process.env.CORS_ORIGINS ||
        'http://localhost:5173,http://127.0.0.1:5173,http://localhost:3001')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    hostPassword: process.env.HOST_PASSWORD || 'batatinha 123',
    databasePath: process.env.DATABASE_PATH
        ? path_1.default.resolve(rootDir, process.env.DATABASE_PATH)
        : isVercel
            ? '/tmp/ambiencia.sqlite'
            : path_1.default.resolve(rootDir, './data/ambiencia.sqlite'),
    uploadDir: process.env.UPLOAD_DIR
        ? path_1.default.resolve(rootDir, process.env.UPLOAD_DIR)
        : isVercel
            ? '/tmp/uploads'
            : path_1.default.resolve(rootDir, './uploads'),
    maxUploadMb: parseInt(process.env.MAX_UPLOAD_MB || '50', 10),
    get maxUploadBytes() {
        return this.maxUploadMb * 1024 * 1024;
    },
    storageProvider: (process.env.STORAGE_PROVIDER || 'local'),
    s3: {
        endpoint: process.env.S3_ENDPOINT || '',
        region: process.env.S3_REGION || 'auto',
        bucket: process.env.S3_BUCKET || 'ambiencia-audio',
        accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
        publicBaseUrl: process.env.S3_PUBLIC_BASE_URL || '',
    },
};
