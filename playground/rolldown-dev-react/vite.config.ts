import { defineConfig } from 'vite'

export default defineConfig({
  clearScreen: false,
  experimental: {
    rolldownDev: true,
    rolldownDevReactRefresh: true,
  },
})
