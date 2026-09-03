import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  base: '/tool/game/',
  plugins: [vue()],
  server: {
    proxy: {
      '/tool/game/steam-community': {
        target: 'https://steamcommunity.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/tool\/game\/steam-community/, ''),
      },
    },
  },
})
