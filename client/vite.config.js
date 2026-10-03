import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => {
  // Carga las variables de entorno (.env, .env.local, etc.)
  const env = loadEnv(mode, process.cwd(), '')
  const API_TARGET = env.API_TARGET || process.env.API_TARGET || 'http://localhost:3000'

  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: API_TARGET,
          changeOrigin: true, // Ponlo en true para desarrollo local
          // secure: false,   // Descomenta si usas HTTPS con certificado autofirmado en Express
        }
      }
    }
  }
})