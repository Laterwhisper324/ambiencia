import express from 'express';

export const app = express();

let innerApp: express.Express | null = null;

app.use(async (req, res, next) => {
  try {
    if (!innerApp) {
      const mod = await import('./app');
      innerApp = mod.app || mod.default;
    }
    return innerApp(req, res, next);
  } catch (err: any) {
    console.error('[Bootstrap Error]:', err);
    res.status(500).json({
      error: 'Falha ao inicializar módulo do servidor.',
      message: err?.message || String(err),
      stack: err?.stack,
    });
  }
});

if (!process.env.VERCEL) {
  import('./app')
    .then((mod) => {
      mod.startStandaloneServer();
    })
    .catch((err) => {
      console.error('[Standalone Startup Error]:', err);
    });
}

(app as any).default = app;
(app as any).app = app;
if (typeof module !== 'undefined' && module.exports) {
  module.exports = app;
}

export default app;
