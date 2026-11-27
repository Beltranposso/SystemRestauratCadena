import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// En desarrollo la web y la API comparten origen gracias al proxy: las cookies de sesión
// (refresh token) son de primera parte y Socket.IO viaja por el mismo puerto.
const API = process.env.VITE_API_PROXY ?? 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Código compartido de la propia app, sin paquetes ni compilación intermedia
    alias: {
      '@shared': fileURLToPath(new URL('./src/shared/index.ts', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: API, changeOrigin: true },
      '/socket.io': { target: API, ws: true, changeOrigin: true },
      '/uploads': { target: API, changeOrigin: true },
    },
  },
  preview: {
    port: 4173,
    proxy: {
      '/api': { target: API, changeOrigin: true },
      '/socket.io': { target: API, ws: true, changeOrigin: true },
      '/uploads': { target: API, changeOrigin: true },
    },
  },
});
