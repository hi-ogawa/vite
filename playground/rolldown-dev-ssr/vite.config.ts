import { defineConfig } from 'vite'

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
    rolldownDev: true,
    rolldownDevReactRefresh: true,
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
  ],
})
