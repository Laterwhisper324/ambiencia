"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const socket_io_1 = require("socket.io");
const config_1 = require("./config");
const seed_1 = require("./db/seed");
const tracks_1 = require("./routes/tracks");
const playlists_1 = require("./routes/playlists");
const scenes_1 = require("./routes/scenes");
const rooms_1 = require("./routes/rooms");
const roomManager_1 = require("./socket/roomManager");
exports.app = (0, express_1.default)();
// Prepare app to run behind HTTPS reverse proxies (Vercel, Render, Railway, Nginx, Cloudflare)
exports.app.set('trust proxy', 1);
// Security headers configured to allow official YouTube IFrame API & audio streaming
exports.app.use((0, helmet_1.default)({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false,
}));
// CORS configuration
const corsOptions = {
    origin: (origin, callback) => {
        if (!origin || config_1.config.nodeEnv !== 'production') {
            callback(null, true);
            return;
        }
        if (config_1.config.corsOrigins.includes('*') || config_1.config.corsOrigins.includes(origin)) {
            callback(null, true);
        }
        else {
            callback(null, true);
        }
    },
    credentials: true,
};
exports.app.use((0, cors_1.default)(corsOptions));
exports.app.use(express_1.default.json({ limit: '2mb' }));
// Ensure SQLite schema and seed data are initialized before handling requests
const seedReadyPromise = (0, seed_1.ensureSeedData)().catch((err) => {
    console.error('[Seed] Erro ao inicializar dados:', err);
});
exports.app.use(async (_req, _res, next) => {
    await seedReadyPromise;
    next();
});
// General API rate limiter
const apiLimiter = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
});
exports.app.use('/api', apiLimiter);
// Healthcheck endpoint
const healthHandler = (_req, res) => {
    res.json({
        status: 'ok',
        app: 'Ambiência',
        storageProvider: config_1.config.storageProvider,
        maxUploadMb: config_1.config.maxUploadMb,
        serverTime: Date.now(),
    });
};
exports.app.get('/api/health', healthHandler);
exports.app.get('/health', healthHandler);
// Mount API routes (both with and without /api prefix for Vercel Services compatibility)
exports.app.use('/api/tracks', tracks_1.tracksRouter);
exports.app.use('/tracks', tracks_1.tracksRouter);
exports.app.use('/api/playlists', playlists_1.playlistsRouter);
exports.app.use('/playlists', playlists_1.playlistsRouter);
exports.app.use('/api/scenes', scenes_1.scenesRouter);
exports.app.use('/scenes', scenes_1.scenesRouter);
exports.app.use('/api/rooms', rooms_1.roomsRouter);
exports.app.use('/rooms', rooms_1.roomsRouter);
// Serve static frontend in standalone production (when client/dist exists)
if (!process.env.VERCEL) {
    const clientDistPath = path_1.default.resolve(process.cwd(), '../client/dist');
    if (fs_1.default.existsSync(clientDistPath)) {
        exports.app.use(express_1.default.static(clientDistPath));
        exports.app.get('*', (req, res, next) => {
            if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
                next();
                return;
            }
            res.sendFile(path_1.default.join(clientDistPath, 'index.html'));
        });
    }
}
// Global error boundary to prevent unhandled serverless invocation crashes
exports.app.use((err, _req, res, _next) => {
    console.error('[Server Error]:', err);
    if (!res.headersSent) {
        res.status(500).json({
            error: err instanceof Error ? err.message : 'Erro interno do servidor.',
        });
    }
});
// Start HTTP + Socket.IO server when running as a continuous process (local / Docker / Render / Railway)
if (!process.env.VERCEL) {
    const server = http_1.default.createServer(exports.app);
    const io = new socket_io_1.Server(server, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST'],
        },
        pingInterval: 10000,
        pingTimeout: 8000,
    });
    (0, roomManager_1.setupSocketServer)(io);
    seedReadyPromise.then(() => {
        server.listen(config_1.config.port, () => {
            console.log(`========================================================`);
            console.log(`🎵 Ambiência Server rodando na porta ${config_1.config.port}`);
            console.log(`📁 Upload Dir: ${config_1.config.uploadDir} (Provider: ${config_1.config.storageProvider})`);
            console.log(`🗄️  SQLite DB:  ${config_1.config.databasePath}`);
            console.log(`🔑 Senha Anfitrião: [Protegida]`);
            console.log(`========================================================`);
        });
    });
}
exports.default = exports.app;
