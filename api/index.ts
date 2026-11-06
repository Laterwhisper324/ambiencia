import { app } from '../server/src/index';

if (typeof module !== 'undefined' && module.exports) {
  module.exports = app;
  (module.exports as any).default = app;
  (module.exports as any).app = app;
}

export default app;
