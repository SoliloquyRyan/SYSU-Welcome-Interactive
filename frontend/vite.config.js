import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [vue()],
  build: {
    // Split the framework from app code: the Vue vendor chunk is cache-stable
    // across app-only deploys and loads in parallel on the LAN event site.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('vue-router') || id.includes('/vue/') || id.includes('@vue/')) return 'vendor-vue'
          return undefined
        },
      },
    },
  },
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
