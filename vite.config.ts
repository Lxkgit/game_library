import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  base: '/tool/game/',
  plugins: [vue()],
  server: {
    proxy: {
      '/steam-community': {
        target: 'https://steamcommunity.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/steam-community/, ''),
      },
    },
  },
})
