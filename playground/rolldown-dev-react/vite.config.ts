import { join } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  clearScreen: false,
  experimental: {
    rolldownDev: {
      hmr: true,
      reactRefresh: true,
    },
  },
  resolve: {
    alias: {
      'test-alias': join(import.meta.dirname, './src/test-alias-dest.tsx'),
    },
  },
  plugins: [
    {
      name: 'test',
      options() {
        console.log('[debug:options]', this.environment?.name)
      },
      buildStart() {
        console.log('[debug:buildStart]', this.environment?.name)
      },
      buildEnd() {
        console.log('[debug:buildEnd]', this.environment?.name)
      },
      resolveId: {
        handler(source, importer, _options) {
          if (source === 'virtual:test') {
            console.log('[debug:resolveId]', [
              this.environment?.name,
              source,
              importer,
            ])
            return `\0virtual:test`
          }
        },
      },
      load: {
        handler(id, _options) {
          if (id === '\0virtual:test') {
            console.log('[debug:load]', this.environment?.name)
            return `export default "test:virtual:ok, environment.name: ${this.environment.name}"`
          }
        },
      },
    },
  ],
})
