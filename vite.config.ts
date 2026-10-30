import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import http from 'node:http'
import { spawn } from 'node:child_process'

function storageBackendPlugin(): Plugin {
  let serverProcess: any = null;

  return {
    name: 'storage-backend-starter',
    configureServer(server) {
      // Check if backend on 5001 is already running
      const req = http.get('http://localhost:5001/api/health', () => {});
      req.on('error', () => {
        console.log('[vite] Starting NotaryVault storage backend on port 5001...');
        serverProcess = spawn('node', ['server/index.js'], {
          stdio: 'inherit',
          shell: true,
        });
      });

      server.httpServer?.on('close', () => {
        if (serverProcess) {
          try { serverProcess.kill(); } catch {}
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), storageBackendPlugin()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
      },
    },
  },
})
