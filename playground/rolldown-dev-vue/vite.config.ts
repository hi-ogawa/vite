import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  clearScreen: false,
  experimental: {
    rolldownDev: {
      hmr: true,
    },
  },
  plugins: [vue()],
})
