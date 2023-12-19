import path from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/main-esm-no-export.js'),
      formats: ['es'],
      fileName: 'my-lib',
    },
    outDir: 'dist/esm-no-export',
  },
})
