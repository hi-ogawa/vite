import { defineConfig } from 'vite'

export default defineConfig({
  clearScreen: false,
  environments: {
    client: {
      build: {
        rollupOptions: {
          input: {
            index: './index.html',
            about: './about/index.html',
          },
        },
      },
    },
  },
  experimental: {
    rolldownDev: {
      hmr: true,
    },
  },
})
