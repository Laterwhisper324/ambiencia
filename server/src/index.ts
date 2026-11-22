import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { Server as SocketIOServer } from 'socket.io';
import { config } from './config';
import { ensureSeedData } from './db/seed';
import { getCloudSyncStatus } from './db/cloudPersistence';
import { tracksRouter } from './routes/tracks';
import { playlistsRouter } from './routes/playlists';
import { scenesRouter } from './routes/scenes';
import { roomsRouter } from './routes/rooms';
import { profilesRouter } from './routes/profiles';
import { backupRouter } from './routes/backup';
import { setupSocketServer } from './socket/roomManager';

export const app = express();

// Prepare app to run behind HTTPS reverse proxies (Vercel, Render, Railway, Nginx, Cloudflare)
app.set('trust proxy', 1);

// Security headers configured to allow official YouTube IFrame API & audio streaming
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false,
  })
);

// CORS configuration
const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (!origin || config.nodeEnv !== 'production') {
      callback(null, true);
      return;
    }
    if (config.corsOrigins.includes('*') || config.corsOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, true);
    }
  },
  credentials: true,
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '5mb' }));

// Ensure SQLite schema and seed data are initialized before handling requests
const seedReadyPromise = ensureSeedData().catch((err) => {
  console.error('[Seed] Erro ao inicializar dados:', err);
});

app.use(async (_req, _res, next) => {
  try {
    await seedReadyPromise;
  } catch (err) {
    console.error('[Seed Middleware] Erro:', err);
  }
  next();
});

// General API rate limiter
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
});
app.use('/api', apiLimiter);

// Healthcheck endpoint
const healthHandler: express.RequestHandler = (_req, res) => {
  res.json({
    status: 'ok',
    app: 'Ambiência',
    storageProvider: config.storageProvider,
    maxUploadMb: config.maxUploadMb,
    cloudSync: getCloudSyncStatus(),
    serverTime: Date.now(),
  });
};
app.get('/api/health', healthHandler);
app.get('/health', healthHandler);

// Mount API routes (both with and without /api prefix for Vercel Services compatibility)
app.use('/api/profiles', profilesRouter);
app.use('/profiles', profilesRouter);
app.use('/api/tracks', tracksRouter);
app.use('/tracks', tracksRouter);
app.use('/api/playlists', playlistsRouter);
app.use('/playlists', playlistsRouter);
app.use('/api/scenes', scenesRouter);
app.use('/scenes', scenesRouter);
app.use('/api/rooms', roomsRouter);
app.use('/rooms', roomsRouter);
app.use('/api/backup', backupRouter);
app.use('/backup', backupRouter);

// Serve static frontend in standalone production (when client/dist exists)
if (!process.env.VERCEL) {
  const candidateDistPaths = [
    path.resolve(process.cwd(), 'client/dist'),
    path.resolve(process.cwd(), '../client/dist'),
    path.resolve(__dirname, '../../client/dist'),
    path.resolve(__dirname, '../client/dist'),
  ];
  const clientDistPath = candidateDistPaths.find((p) => fs.existsSync(p));

  if (clientDistPath) {
    console.log(`[Frontend] Servindo arquivos estáticos de: ${clientDistPath}`);
    app.use(express.static(clientDistPath));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
        next();
        return;
      }
      res.sendFile(path.join(clientDistPath, 'index.html'));
    });
  } else {
    console.warn('[Frontend] Pasta client/dist não encontrada. Inicie após npm run build.');
  }
}

// Global error boundary to prevent unhandled serverless invocation crashes
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error('[Server Error]:', err);
    if (!res.headersSent) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Erro interno do servidor.',
      });
    }
  }
);

// Start HTTP + Socket.IO server when running as a continuous process (local / Docker / Render / Railway)
if (!process.env.VERCEL) {
  const server = http.createServer(app);
  const io = new SocketIOServer(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    pingInterval: 10000,
    pingTimeout: 8000,
  });

  setupSocketServer(io);

  seedReadyPromise.then(() => {
    const syncStatus = getCloudSyncStatus();
    server.listen(config.port, '0.0.0.0', () => {
      console.log(`========================================================`);
      console.log(`🎵 Ambiência Server rodando na porta ${config.port}`);
      console.log(`📁 Upload Dir: ${config.uploadDir} (Provider: ${config.storageProvider})`);
      console.log(`🗄️  SQLite DB:  ${config.databasePath}`);
      console.log(
        `☁️  Cloud Sync: ${
          syncStatus.enabled
            ? `Upstash Redis (Ativo${syncStatus.hydratedFromCloud ? ' • Restaurado da nuvem' : ''})`
            : 'Desativado (apenas local + backup JSON manual)'
        }`
      );
      console.log(`🔑 Senha Anfitrião: [Protegida]`);
      console.log(`========================================================`);
    });
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = app;
  (module.exports as any).default = app;
  (module.exports as any).app = app;
}

export default app;
