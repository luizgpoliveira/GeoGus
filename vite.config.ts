import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Todos os endpoints locais (/api/gvp, /api/reports, /api/phivolcs e /api/pvmbg)
      // precisam chegar ao backend Node. Proxiar somente /api/gvp fazia os demais
      // endpoints caírem no fallback HTML do Vite e gerarem 'Unexpected token <'.
      '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true },
    },
  },
  build: { sourcemap: false, chunkSizeWarningLimit: 900 },
});
