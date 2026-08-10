import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    host: process.env.DEMO_FRONTEND_HOST || '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: false,
        xfwd: true,
      },
      '/ws': {
        target: 'ws://127.0.0.1:3000',
        changeOrigin: false,
        xfwd: true,
        ws: true,
      },
    },
    fs: {
      deny: [
        '.env',
        '.env.*',
        '*.{crt,pem}',
        '**/.git/**',
        '**/.data/**',
        '**/*.db',
        '**/*.sqlite',
        '**/*.sqlite3',
      ],
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
  },
})
