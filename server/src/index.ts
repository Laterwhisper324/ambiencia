const handler = async (req: any, res: any) => {
  try {
    const mod = await import('./app');
    const app = mod.app || mod.default;
    return app(req, res);
  } catch (err: any) {
    console.error('[Bootstrap Error]:', err);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(
      JSON.stringify({
        bootstrapError: true,
        message: err?.message || String(err),
        stack: err?.stack,
        cwd: typeof process !== 'undefined' ? process.cwd() : null,
      })
    );
  }
};

if (typeof process !== 'undefined' && !process.env.VERCEL) {
  import('./app')
    .then((mod) => {
      mod.startStandaloneServer();
    })
    .catch((err) => {
      console.error('[Standalone Startup Error]:', err);
    });
}

export const app = handler;
export default handler;
