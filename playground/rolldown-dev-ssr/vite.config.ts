import { defineConfig } from 'vite'

process.setSourceMapsEnabled(true)

export default defineConfig({
  environments: {
    client: {
      build: {
        outDir: 'dist/client',
        rollupOptions: {
          input: './src/entry-client',
        },
      },
    },
    ssr: {
      build: {
        outDir: 'dist/server',
        rollupOptions: {
          input: {
            index: './src/entry-server',
          },
        },
      },
    },
  },
  experimental: {
    rolldownDev: { hmr: true, reactRefresh: true },
  },
  plugins: [
    {
      name: 'ssr-middleware',
      configureServer(server) {
        return () => {
          server.middlewares.use(async (req, res, next) => {
            try {
              const mod = await (server.environments.ssr as any).import('index')
              await mod.default(req, res)
            } catch (e) {
              next(e)
            }
          })
        }
      },
    },
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
            return `export default "virtual-ok"`
          }
        },
      },
    },
  ],
})
