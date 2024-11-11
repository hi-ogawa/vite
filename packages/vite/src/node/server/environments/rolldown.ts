/* eslint-disable no-console */
import assert from 'node:assert'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import MagicString from 'magic-string'
import * as rolldown from 'rolldown'
import sirv from 'sirv'
import { createLogger } from '../../publicUtils'
import { DevEnvironment } from '../environment'
import type {
  DevEnvironmentOptions,
  HmrContext,
  ResolvedConfig,
  UserConfig,
  ViteDevServer,
} from '../..'
import { CLIENT_ENTRY } from '../../constants'
import { injectEnvironmentToHooks } from '../../build'

const require = createRequire(import.meta.url)

export interface RolldownDevOptions {
  hmr?: boolean
  reactRefresh?: boolean
}

const logger = createLogger('info', {
  prefix: '[rolldown]',
  allowClearScreen: false,
})

export function rolldownDevHandleConfig(config: UserConfig): UserConfig {
  return {
    appType: 'custom',
    optimizeDeps: {
      noDiscovery: true,
      include: [],
    },
    experimental: {
      enableNativePlugin: true,
    },
    environments: {
      client: {
        dev: {
          createEnvironment: RolldownEnvironment.createFactory({
            hmr: config.experimental?.rolldownDev?.hmr,
            reactRefresh: config.experimental?.rolldownDev?.reactRefresh,
          }),
        },
        // NOTE
        // this is not "build" option any more (or is there a way to handle entry lazily?)
        build: {
          rollupOptions: {
            input:
              config.build?.rollupOptions?.input ??
              config.environments?.client.build?.rollupOptions?.input ??
              './index.html',
          },
        },
      },
      ssr: {
        dev: {
          createEnvironment: RolldownEnvironment.createFactory({
            hmr: false,
            reactRefresh: false,
          }),
        },
      },
    },
  }
}

// type casting helper
function asRolldown(server: ViteDevServer): Omit<
  ViteDevServer,
  'environments'
> & {
  environments: {
    client: RolldownEnvironment
    ssr: RolldownEnvironment
  }
} {
  return server as any
}

export function rolldownDevConfigureServer(server: ViteDevServer): void {
  const { environments } = asRolldown(server)

  // rolldown server as middleware
  server.middlewares.use(
    sirv(environments.client.outDir, { dev: true, extensions: ['html'] }),
  )

  // reuse /@vite/client for Websocket API but serve it on our own
  // TODO: include it in `rolldown_runtime`?
  const rolldownClientCode = getRolldownClientCode()
  server.middlewares.use((req, res, next) => {
    const url = new URL(req.url ?? '', 'https://rolldown.rs')
    if (url.pathname === '/@rolldown/client') {
      res.setHeader('content-type', 'text/javascript;charset=utf-8')
      res.end(rolldownClientCode)
      return
    }
    next()
  })

  // full build on non self accepting entry
  server.ws.on('rolldown:hmr-deadend', async (data) => {
    logger.info(`hmr-deadend '${data.moduleId}'`, { timestamp: true })
    await environments.client.build()
    server.ws.send({ type: 'full-reload' })
  })

  // disable automatic html reload
  // https://github.com/vitejs/vite/blob/01cf7e14ca63988c05627907e72b57002ffcb8d5/packages/vite/src/node/server/hmr.ts#L590-L595
  const oldSend = server.ws.send
  server.ws.send = function (...args: any) {
    const arg = args[0]
    if (
      arg &&
      typeof arg === 'object' &&
      arg.type === 'full-reload' &&
      typeof arg.path === 'string' &&
      arg.path.endsWith('.html')
    ) {
      return
    }
    oldSend.apply(this, args)
  }
}

export async function rolldownDevHandleHotUpdate(
  ctx: HmrContext,
): Promise<void> {
  const { environments } = asRolldown(ctx.server)
  await environments.ssr.handleUpdate(ctx)
  await environments.client.handleUpdate(ctx)
}

function getRolldownClientCode() {
  let code = fs.readFileSync(CLIENT_ENTRY, 'utf-8')
  const replacements = {
    // TODO: packages/vite/src/node/plugins/clientInjections.ts
    __BASE__: `"/"`,
    __SERVER_HOST__: `""`,
    __HMR_PROTOCOL__: `null`,
    __HMR_HOSTNAME__: `null`,
    __HMR_PORT__: `new URL(import.meta.url).port`,
    __HMR_DIRECT_TARGET__: `""`,
    __HMR_BASE__: `"/"`,
    __HMR_TIMEOUT__: `30000`,
    __HMR_ENABLE_OVERLAY__: `true`,
    __HMR_CONFIG_NAME__: `""`,
    // runtime define is not necessary
    [`import '@vite/env';`]: ``,
    [`import "@vite/env";`]: ``, // for local pnpm dev
  }
  for (const [k, v] of Object.entries(replacements)) {
    code = code.replaceAll(k, v)
  }
  code = code.replace(/\/\/# sourceMappingURL.*/, '')
  // inject own hmr event handler
  code += `
const hot = createHotContext("/__rolldown");
hot.on("rolldown:hmr", (data) => {
	(0, eval)(data[1]);
});
window.__rolldown_hot = hot;
`
  return code
}

class RolldownEnvironment extends DevEnvironment {
  instance!: rolldown.RolldownBuild
  result!: rolldown.RolldownOutput
  outDir!: string
  buildTimestamp = Date.now()

  static createFactory(
    rolldownDevOptioins: RolldownDevOptions,
  ): NonNullable<DevEnvironmentOptions['createEnvironment']> {
    return (name, config) =>
      new RolldownEnvironment(rolldownDevOptioins, name, config)
  }

  constructor(
    public rolldownDevOptions: RolldownDevOptions,
    name: ConstructorParameters<typeof DevEnvironment>[0],
    config: ConstructorParameters<typeof DevEnvironment>[1],
  ) {
    super(name, config, { hot: false })
    this.outDir = path.join(this.config.root, this.config.build.outDir)
  }

  override init: DevEnvironment['init'] = async () => {
    await super.init()
    // patch out plugin container hooks
    assert(this._pluginContainer)
    this._pluginContainer.buildStart = async () => {}
    this._pluginContainer.close = async () => {}
    await this.build()
  }

  override close: DevEnvironment['init'] = async () => {
    await super.close()
    await this.instance?.close()
  }

  async build(): Promise<void> {
    if (!this.config.build.rollupOptions.input) {
      return
    }

    await this.instance?.close()

    if (this.config.build.emptyOutDir !== false) {
      fs.rmSync(this.outDir, { recursive: true, force: true })
    }

    // all plugins are shared like Vite 6 `sharedConfigBuild`.
    let plugins = this._plugins!
    // enable some core plugins
    // TODO: adopt more (should we filter inside `resolvePlugins`?)
    plugins = plugins.filter(
      (p) =>
        !(typeof p.name === 'number' || p.name?.startsWith('vite:')) ||
        ['vite:define'].includes(p.name) ||
        ['AliasPlugin', 'TransformPlugin'].includes(p.constructor.name),
    )
    plugins = plugins.map((p) => injectEnvironmentToHooks(this as any, p))

    console.time(`[rolldown:${this.name}:build]`)
    const inputOptions: rolldown.InputOptions = {
      dev: this.rolldownDevOptions.hmr,
      input: this.config.build.rollupOptions.input,
      cwd: this.config.root,
      platform: this.name === 'client' ? 'browser' : 'node',
      resolve: {
        conditionNames: this.config.resolve.conditions,
        mainFields: this.config.resolve.mainFields,
        symlinks: !this.config.resolve.preserveSymlinks,
      },
      plugins: [
        ...plugins,
        viterollEntryPlugin(this.config, this.rolldownDevOptions),
        reactRefreshPlugin(this.rolldownDevOptions),
      ],
    }
    this.instance = await rolldown.rolldown(inputOptions)

    // `generate` should work but we use `write` so it's easier to see output and debug
    const outputOptions: rolldown.OutputOptions = {
      dir: this.outDir,
      format: this.rolldownDevOptions.hmr ? 'app' : 'esm',
      // TODO: hmr_rebuild returns source map file when `sourcemap: true`
      sourcemap: 'inline',
      // TODO: https://github.com/rolldown/rolldown/issues/2041
      // handle `require("stream")` in `react-dom/server`
      banner:
        this.name === 'ssr'
          ? `import __nodeModule from "node:module"; const require = __nodeModule.createRequire(import.meta.url);`
          : undefined,
    }
    this.result = await this.instance.write(outputOptions)

    this.buildTimestamp = Date.now()
    console.timeEnd(`[rolldown:${this.name}:build]`)
  }

  async handleUpdate(ctx: HmrContext): Promise<void> {
    if (!this.result) {
      return
    }
    const output = this.result.output[0]
    if (!output.moduleIds.includes(ctx.file)) {
      return
    }
    if (this.rolldownDevOptions.hmr) {
      logger.info(`hmr '${ctx.file}'`, { timestamp: true })
      console.time(`[rolldown:${this.name}:hmr]`)
      const result = await this.instance.experimental_hmr_rebuild([ctx.file])
      console.timeEnd(`[rolldown:${this.name}:hmr]`)
      ctx.server.ws.send('rolldown:hmr', result)
    } else {
      await this.build()
      if (this.name === 'client') {
        ctx.server.ws.send({ type: 'full-reload' })
      }
    }
  }

  async import(input: string): Promise<unknown> {
    const output = this.result.output.find((o) => o.name === input)
    assert(output, `invalid import input '${input}'`)
    const filepath = path.join(this.outDir, output.fileName)
    return import(`${pathToFileURL(filepath)}?t=${this.buildTimestamp}`)
  }
}

// TODO: use vite:build-html plugin
function viterollEntryPlugin(
  config: ResolvedConfig,
  rolldownDevOptions: RolldownDevOptions,
): rolldown.Plugin {
  const htmlEntryMap = new Map<string, MagicString>()

  return {
    name: 'viteroll:entry',
    transform: {
      filter: {
        id: {
          include: [/\.html$/],
        },
      },
      async handler(code, id) {
        // process html (will be emiited later during generateBundle)
        const htmlOutput = new MagicString(code)
        htmlEntryMap.set(id, htmlOutput)

        let jsOutput = ``
        if (rolldownDevOptions?.reactRefresh) {
          jsOutput += `import "virtual:react-refresh/entry";\n`
        }

        // extract <script src="...">
        const matches = code.matchAll(
          /<script\b[^>]+\bsrc=["']([^"']+)["'][^>]*>.*?<\/script>/dg,
        )
        for (const match of matches) {
          const src = match[1]
          const resolved = await this.resolve(src, id)
          if (!resolved) {
            this.warn(`unresolved src '${src}' in '${id}'`)
            continue
          }
          jsOutput += `import ${JSON.stringify(resolved.id)};\n`
          const [start, end] = match.indices![0]
          htmlOutput.remove(start, end)
        }

        // emit js entry
        return {
          code: jsOutput,
          moduleSideEffects: 'no-treeshake',
        }
      },
    },
    renderChunk(code) {
      // patch rolldown_runtime to workaround a few things
      if (code.includes('//#region rolldown:runtime')) {
        const output = new MagicString(code)
        // patch out hard-coded WebSocket setup "const socket = WebSocket(`ws://localhost:8080`)"
        output.replace(/const socket =.*?\n\};/s, '')
        // trigger full rebuild on non-accepting entry invalidation
        output
          .replace('parents: [parent],', 'parents: parent ? [parent] : [],')
          .replace(
            'for (var i = 0; i < module.parents.length; i++) {',
            `
						if (module.parents.length === 0) {
							__rolldown_hot.send("rolldown:hmr-deadend", { moduleId });
							break;
						}
						for (var i = 0; i < module.parents.length; i++) {`,
          )
        return { code: output.toString(), map: output.generateMap() }
      }
    },
    generateBundle(options, bundle) {
      for (const key in bundle) {
        const chunk = bundle[key]
        // emit final html
        if (chunk.type === 'chunk' && chunk.facadeModuleId) {
          const htmlId = chunk.facadeModuleId
          const htmlOutput = htmlEntryMap.get(htmlId)
          if (htmlOutput) {
            // inject js entry
            htmlOutput.appendLeft(
              htmlOutput.original.indexOf(`</body>`),
              `<script ${options.format === 'es' ? 'type="module"' : ''} src="/${chunk.fileName}"></script>`,
            )

            // inject client
            htmlOutput.appendLeft(
              htmlOutput.original.indexOf(`</head>`),
              `<script type="module" src="/@rolldown/client"></script>`,
            )

            this.emitFile({
              type: 'asset',
              fileName: path.relative(config.root, htmlId),
              originalFileName: htmlId,
              source: htmlOutput.toString(),
            })
          }
        }
      }
    },
  }
}

// TODO: workaround rolldownExperimental.reactPlugin which injects js to html via `load` hook
function reactRefreshPlugin(
  rolldownDevOptions: RolldownDevOptions,
): rolldown.Plugin {
  return {
    name: 'react-hmr',
    transform: {
      filter: {
        code: {
          include: ['$RefreshReg$'],
        },
      },
      handler(code, id) {
        const output = new MagicString(code)
        output.prepend(`
					import * as __$refresh from 'virtual:react-refresh';
					const [$RefreshSig$, $RefreshReg$] = __$refresh.create(${JSON.stringify(id)});
				`)
        output.append(`
					__$refresh.setupHot(module.hot);
				`)
        return { code: output.toString(), map: output.generateMap() }
      },
    },
    resolveId: {
      filter: {
        id: {
          include: [/^virtual:react-refresh/],
        },
      },
      handler: (source) => '\0' + source,
    },
    load: {
      filter: {
        id: {
          include: [/^\0virtual:react-refresh/],
        },
      },
      async handler(id) {
        if (!rolldownDevOptions.reactRefresh) {
          return `export {}`
        }
        const resolved = require.resolve('react-refresh/runtime')
        if (id === '\0virtual:react-refresh/entry') {
          return `
						import runtime from ${JSON.stringify(resolved)};
						runtime.injectIntoGlobalHook(window);
					`
        }
        if (id === '\0virtual:react-refresh') {
          return `
						import runtime from ${JSON.stringify(resolved)};

						export const create = (file) => [
							runtime.createSignatureFunctionForTransform,
							(type, id) => runtime.register(type, file + '_' + id),
						];

						function debounce(fn, delay) {
							let handle
							return () => {
								clearTimeout(handle)
								handle = setTimeout(fn, delay)
							}
						}
						const debouncedRefresh = debounce(runtime.performReactRefresh, 16);

						export function setupHot(hot) {
							hot.accept((prev) => {
								debouncedRefresh();
							});
						}
					`
        }
      },
    },
  }
}
