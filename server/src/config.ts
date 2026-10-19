import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const rootDir = process.cwd();

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:3001')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  hostPassword: process.env.HOST_PASSWORD || 'batatinha 123',
  databasePath: path.resolve(rootDir, process.env.DATABASE_PATH || './data/ambiencia.sqlite'),
  uploadDir: path.resolve(rootDir, process.env.UPLOAD_DIR || './uploads'),
  maxUploadMb: parseInt(process.env.MAX_UPLOAD_MB || '50', 10),
  get maxUploadBytes(): number {
    return this.maxUploadMb * 1024 * 1024;
  },
  storageProvider: (process.env.STORAGE_PROVIDER || 'local') as 'local' | 's3',
  s3: {
    endpoint: process.env.S3_ENDPOINT || '',
    region: process.env.S3_REGION || 'auto',
    bucket: process.env.S3_BUCKET || 'ambiencia-audio',
    accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
    publicBaseUrl: process.env.S3_PUBLIC_BASE_URL || '',
  },
};
