import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
  plugins: [react(), basicSsl()],
  server: {
    port: 3000,
    host: true,
    https: true,
    proxy: {
      '/ws/vision': {
        target: 'ws://localhost:8000',
        ws: true,
      },
      '/capture': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/reload-room': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
});
