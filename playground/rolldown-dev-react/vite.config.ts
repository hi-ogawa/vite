import { defineConfig } from 'vite'

export default defineConfig({
  clearScreen: false,
  experimental: {
    rolldownDev: { hmr: true, reactRefresh: true },
  },
})
