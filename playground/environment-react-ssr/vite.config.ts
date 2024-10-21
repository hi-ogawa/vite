import {
  type Connect,
  type Plugin,
  type PluginOption,
  createServerModuleRunner,
  defineConfig,
} from 'vite'

export default defineConfig((env) => ({
  clearScreen: false,
  appType: 'custom',
  plugins: [
    vitePluginSsrMiddleware({
      entry: '/src/entry-server',
      preview: new URL('./dist/server/index.js', import.meta.url).toString(),
    }),
    {
      name: 'global-server',
      configureServer(server) {
        Object.assign(globalThis, { __globalServer: server })
      },
    },
    {
      name: 'virtual-late-discovery',
      resolveId(source) {
        if (source === 'virtual:late-discovery') {
          return '\0' + source
        }
      },
      load(id) {
        if (id === '\0virtual:late-discovery') {
          return `export { default } from "@vitejs/test-dep/other"`
        }
      },
    },
  ],
  environments: {
    client: {
      dev: {
        optimizeDeps: {
          include: ['react/jsx-dev-runtime'],
        },
      },
      build: {
        minify: false,
        sourcemap: true,
        outDir: 'dist/client',
      },
    },
    ssr: {
      dev: {
        optimizeDeps: {
          noDiscovery: false,
          include: ['react/jsx-dev-runtime'],
        },
      },
      build: {
        outDir: 'dist/server',
        // [feedback]
        // is this still meant to be used?
        // for example, `ssr: true` seems to make `minify: false` automatically
        // and also externalization.
        ssr: true,
        rollupOptions: {
          input: {
            index: '/src/entry-server',
          },
        },
      },
    },
  },

  builder: {
    async buildApp(builder) {
      await builder.build(builder.environments.client)
      await builder.build(builder.environments.ssr)
    },
  },
}))

// vavite-style ssr middleware plugin
export function vitePluginSsrMiddleware({
  entry,
  preview,
}: {
  entry: string
  preview?: string
}): PluginOption {
  const plugin: Plugin = {
    name: vitePluginSsrMiddleware.name,

    configureServer(server) {
      const runner = createServerModuleRunner(server.environments.ssr, {
        hmr: { logger: false },
      })
      const handler: Connect.NextHandleFunction = async (req, res, next) => {
        try {
          const mod = await runner.import(entry)
          await mod['default'](req, res, next)
        } catch (e) {
          next(e)
        }
      }
      return () => server.middlewares.use(handler)
    },

    async configurePreviewServer(server) {
      if (preview) {
        const mod = await import(preview)
        return () => server.middlewares.use(mod.default)
      }
      return
    },
  }
  return [plugin]
}
