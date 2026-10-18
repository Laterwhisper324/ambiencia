"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
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
async function bootstrap() {
    await (0, seed_1.ensureSeedData)();
    const app = (0, express_1.default)();
    // Prepare app to run behind HTTPS reverse proxies (Render, Railway, Nginx, Cloudflare)
    app.set('trust proxy', 1);
    // Security headers configured to allow official YouTube IFrame API & audio streaming
    app.use((0, helmet_1.default)({
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
                callback(null, true); // Allow public room listeners on custom domains
            }
        },
        credentials: true,
    };
    app.use((0, cors_1.default)(corsOptions));
    app.use(express_1.default.json({ limit: '2mb' }));
    // General API rate limiter
    const apiLimiter = (0, express_rate_limit_1.default)({
        windowMs: 1 * 60 * 1000,
        max: 300,
        standardHeaders: true,
        legacyHeaders: false,
    });
    app.use('/api', apiLimiter);
    // Healthcheck endpoint for Render / Railway
    app.get('/api/health', (_req, res) => {
        res.json({
            status: 'ok',
            app: 'Ambiência',
            storageProvider: config_1.config.storageProvider,
            maxUploadMb: config_1.config.maxUploadMb,
            serverTime: Date.now(),
        });
    });
    // Mount API routes
    app.use('/api/tracks', tracks_1.tracksRouter);
    app.use('/api/playlists', playlists_1.playlistsRouter);
    app.use('/api/scenes', scenes_1.scenesRouter);
    app.use('/api/rooms', rooms_1.roomsRouter);
    // Serve static frontend in production (when client/dist exists)
    const clientDistPath = path_1.default.resolve(__dirname, '../../client/dist');
    if (fs_1.default.existsSync(clientDistPath)) {
        app.use(express_1.default.static(clientDistPath));
        app.get('*', (req, res, next) => {
            if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
                next();
                return;
            }
            res.sendFile(path_1.default.join(clientDistPath, 'index.html'));
        });
    }
    const server = http_1.default.createServer(app);
    const io = new socket_io_1.Server(server, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST'],
        },
        pingInterval: 10000,
        pingTimeout: 8000,
    });
    (0, roomManager_1.setupSocketServer)(io);
    server.listen(config_1.config.port, () => {
        console.log(`========================================================`);
        console.log(`🎵 Ambiência Server rodando na porta ${config_1.config.port}`);
        console.log(`📁 Upload Dir: ${config_1.config.uploadDir} (Provider: ${config_1.config.storageProvider})`);
        console.log(`🗄️  SQLite DB:  ${config_1.config.databasePath}`);
        console.log(`🔑 Senha Anfitrião (HOST_PASSWORD): ${config_1.config.hostPassword}`);
        console.log(`========================================================`);
    });
}
bootstrap().catch((err) => {
    console.error('[Fatal] Falha ao iniciar servidor Ambiência:', err);
    process.exit(1);
});
