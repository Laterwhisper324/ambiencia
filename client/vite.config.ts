import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
  ?.env;
const serverTarget = env?.SERVER_URL || 'http://localhost:3001';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: serverTarget,
        changeOrigin: true,
      },
      '/socket.io': {
        target: serverTarget,
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
