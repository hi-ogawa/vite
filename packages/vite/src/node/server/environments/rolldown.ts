/* eslint-disable no-console */
import assert from 'node:assert'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import MagicString from 'magic-string'
import type * as rolldown from 'rolldown'
import * as rolldownExperimental from 'rolldown/experimental'
import sirv from 'sirv'
import { createLogger, normalizePath } from '../../publicUtils'
import { DevEnvironment } from '../environment'
import type {
  ConfigEnv,
  DevEnvironmentOptions,
  HmrContext,
  UserConfig,
  ViteDevServer,
} from '../..'
import { CLIENT_ENTRY, VITE_PACKAGE_DIR } from '../../constants'
import { injectEnvironmentToHooks } from '../../build'
import { cleanUrl } from '../../../shared/utils'

const require = createRequire(import.meta.url)

export interface RolldownDevOptions {
  hmr?: boolean
  reactRefresh?: boolean
  ssrModuleRunner?: boolean
}

// TODO: polish logging
const logger = createLogger('info', {
  prefix: '[rolldown]',
  allowClearScreen: false,
})

//
// Vite plugin hooks
//

export function rolldownDevHandleConfig(
  config: UserConfig,
  env: ConfigEnv,
): UserConfig {
  if (!config.experimental?.rolldownDev) {
    return {}
  }
  if (env.command === 'build' || env.isPreview) {
    delete config.experimental?.rolldownDev
    return {}
  }
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
            ssrModuleRunner: false,
          }),
        },
        build: {
          modulePreload: false,
          assetsInlineLimit: 0,
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
            ssrModuleRunner: config.experimental?.rolldownDev?.ssrModuleRunner,
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

  // rolldown assets middleware
  server.middlewares.use(async (_req, _res, next) => {
    try {
      await environments.client.buildPromise
      next()
    } catch (e) {
      next(e)
    }
  })
  server.middlewares.use(
    sirv(environments.client.outDir, { dev: true, extensions: ['html'] }),
  )
}

export async function rolldownDevHandleHotUpdate(
  ctx: HmrContext,
): Promise<void> {
  const { environments } = asRolldown(ctx.server)
  await environments.ssr.handleUpdate(ctx)
  await environments.client.handleUpdate(ctx)
}

//
// Rolldown dev environment
//

class RolldownEnvironment extends DevEnvironment {
  instance!: Awaited<ReturnType<typeof rolldownExperimental.rebuild>>
  result!: rolldown.RolldownOutput
  outDir!: string
  buildTimestamp = Date.now()
  inputOptions!: rolldown.InputOptions
  outputOptions!: rolldown.OutputOptions
  lastModules: Record<string, string | null> = {}
  newModules: Record<string, string | null> = {}
  lastAssets: Record<string, string> = {}
  fileModuleIds = new Set<string>()
  buildPromise?: Promise<void>

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
  }

  // delay build till listen since some plugins expect `configureServer` before build
  override listen: DevEnvironment['listen'] = async () => {
    await this.build()
  }

  override close: DevEnvironment['init'] = async () => {
    await super.close()
    await this.instance?.close()
  }

  async build() {
    return (this.buildPromise = this.buildImpl())
  }

  async buildImpl() {
    if (!this.config.build.rollupOptions.input) {
      return
    }

    if (this.config.build.emptyOutDir !== false) {
      fs.rmSync(this.outDir, { recursive: true, force: true })
    }

    // all plugins are shared like Vite 6 `sharedConfigBuild`.
    let plugins = this._plugins!
    // TODO: enable more core plugins
    plugins = plugins.filter(
      (p) =>
        !(typeof p.name === 'number' || p.name?.startsWith('vite:')) ||
        [
          'vite:define',
          'vite:build-html',
          'vite:build-metadata',
          'vite:css',
          'vite:css-post',
          'vite:asset',
          'vite:vue',
        ].includes(p.name) ||
        [
          'AliasPlugin',
          'TransformPlugin',
          'LoadFallbackPlugin',
          'ManifestPlugin',
        ].includes(p.constructor.name),
    )
    plugins = plugins.map((p) => injectEnvironmentToHooks(this as any, p))

    console.time(`[rolldown:${this.name}:build]`)
    this.inputOptions = {
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
        patchRuntimePlugin(this),
        patchCssPlugin(),
        reactRefreshPlugin(),
        {
          // TODO: import.meta not supported by app format
          name: 'patch-import-meta',
          transform: {
            filter: {
              code: [/import\.meta\.hot/],
            },
            handler(code) {
              const output = new MagicString(code)
              output.replaceAll('import.meta.hot.accept', 'module.hot.accept')
              output.replaceAll('import.meta.hot.on', 'self.__rolldown_hot.on')
              return { code: output.toString(), map: output.generateMap() }
            },
          },
        },
      ],
      moduleTypes: {
        '.css': 'js',
      },
      // TODO: isolating finalizer doesn't rewrite yet
      // experimental: {
      //   resolveNewUrlToAsset: true,
      // },
    }

    const format: rolldown.ModuleFormat =
      this.name === 'client' || this.rolldownDevOptions.ssrModuleRunner
        ? 'experimental-app'
        : 'esm'
    this.outputOptions = {
      dir: this.outDir,
      format,
      // TODO: hmr_rebuild returns source map file when `sourcemap: true`
      sourcemap: 'inline',
      // TODO: https://github.com/rolldown/rolldown/issues/2041
      // handle `require("stream")` in `react-dom/server`
      banner:
        this.name === 'ssr' && format === 'esm'
          ? `import __nodeModule from "node:module"; const require = __nodeModule.createRequire(import.meta.url);`
          : undefined,
    }

    this.instance = await rolldownExperimental.rebuild({
      ...this.inputOptions,
      output: this.outputOptions,
    })
    await this.buildInner()

    this.buildTimestamp = Date.now()
    console.timeEnd(`[rolldown:${this.name}:build]`)
  }

  async buildInner() {
    this.result = await this.instance.build()
    this.fileModuleIds = new Set(
      this.result.output
        .flatMap((c) => (c.type === 'chunk' ? c.moduleIds : []))
        .map((id) => cleanUrl(id)),
    )
  }

  async buildHmr(file: string): Promise<{
    manifest: BuildManifest
    chunk?: rolldown.RolldownOutputChunk
  }> {
    logger.info(`hmr '${file}'`, { timestamp: true })
    console.time(`[rolldown:${this.name}:rebuild]`)
    await this.buildInner()
    console.timeEnd(`[rolldown:${this.name}:rebuild]`)
    const manifest = getChunkManifest(this.result.output)
    const chunk = this.result.output.find(
      (v) => v.type === 'chunk' && v.name === 'hmr-update',
    )
    if (chunk) {
      assert(chunk.type === 'chunk')
    }
    return { manifest, chunk }
  }

  async handleUpdate(ctx: HmrContext): Promise<void> {
    if (!this.result) {
      return
    }
    if (!this.fileModuleIds.has(ctx.file)) {
      return
    }
    for (const plugin of this.plugins) {
      // TODO: for now, simple hack for vue hmr
      if (plugin.name === 'vite:vue') {
        ;(plugin.handleHotUpdate as any)(ctx)
      }
    }
    if (
      this.rolldownDevOptions.hmr ||
      this.rolldownDevOptions.ssrModuleRunner
    ) {
      const result = await this.buildHmr(ctx.file)
      if (this.name === 'client') {
        ctx.server.ws.send('rolldown:hmr', {
          manifest: result.manifest,
          fileName: result.chunk?.fileName,
        })
        // full reload on html
        // TODO: what's the general way to handle this?
        // should plugin (vite:build-html) be responsible of handling this?
        if (ctx.file.endsWith('.html')) {
          ctx.server.ws.send({
            type: 'full-reload',
            path:
              '/' + normalizePath(path.relative(this.config.root, ctx.file)),
          })
        }
      } else {
        await (
          await this.getRunner()
        ).handleUpdate(result.manifest, result.chunk)
      }
    } else {
      await this.build()
      if (this.name === 'client') {
        ctx.server.ws.send({ type: 'full-reload' })
      }
    }
  }

  runner!: RolldownModuleRunner

  async getRunner() {
    // TODO: handle concurrent init
    if (!this.runner) {
      this.runner = new RolldownModuleRunner(this)
      await this.runner.init()
    }
    return this.runner
  }

  async import(input: string): Promise<unknown> {
    if (this.outputOptions.format === 'experimental-app') {
      return (await this.getRunner()).import(input)
    }
    // input is no use
    const output = this.result.output[0]
    const filepath = path.join(this.outDir, output.fileName)
    // TODO: source map not applied when adding `?t=...`?
    // return import(`${pathToFileURL(filepath)}`)
    return import(`${pathToFileURL(filepath)}?t=${this.buildTimestamp}`)
  }
}

class RolldownModuleRunner {
  // TODO: refactor something
  private context = {
    __rolldown_module_runner_context: {
      __rolldown_runtime: {} as any,
    },
    __require_external: require,
  }

  constructor(public environment: RolldownEnvironment) {
    this.runtime.loadChunk = this.loadChunk.bind(this)
  }

  async init() {
    const chunk = this.environment.result.output[0]
    assert(chunk.type === 'chunk' && chunk.isEntry)
    await this.evaluateChunk(chunk)
  }

  async handleUpdate(
    manifest: BuildManifest,
    chunk?: rolldown.RolldownOutputChunk,
  ) {
    this.runtime.manifest = manifest
    if (chunk) {
      await this.evaluateChunk(chunk)
    }
  }

  private get runtime() {
    return this.context.__rolldown_module_runner_context.__rolldown_runtime
  }

  async import(id: string): Promise<unknown> {
    // TODO: this supports only "stable id".
    // expose `resolveId` so we can support wider id here.
    return this.runtime.require(id)
  }

  async loadChunk(name: string) {
    const chunk = this.environment.result.output
      .filter((chunk) => chunk.type === 'chunk')
      .find((chunk) => chunk.name === name)
    assert(chunk)
    this.evaluateChunk(chunk)
  }

  async evaluateChunk(chunk: rolldown.RolldownOutputChunk) {
    const filepath = path.join(this.environment.outDir, chunk.fileName)
    await this.evaluate(chunk.code, filepath)
  }

  private async evaluate(code: string, sourceURL: string) {
    code = `\
'use strict';async(${Object.keys(this.context).join(',')})=>{{${code}
}}
//# sourceURL=${sourceURL}
//# sourceMappingSource=rolldown-module-runner
`
    code = moveInlineSourcemapToEnd(code)
    const fn = (0, eval)(code)
    try {
      await fn(...Object.values(this.context))
    } catch (e) {
      console.error('[RolldownModuleRunner:ERROR]', e)
      throw e
    }
  }
}

function patchRuntimePlugin(environment: RolldownEnvironment): rolldown.Plugin {
  return {
    name: 'vite:rolldown-patch-runtime',
    renderChunk(code) {
      // TODO: source map is broken otherwise
      // fixed https://github.com/rolldown/rolldown/issues/3090
      const output = new MagicString(code)
      return {
        code: output.toString(),
        map: output.generateMap({ hires: 'boundary' }),
      }
    },
    generateBundle(_options, bundle) {
      // inject chunk manifest
      const manifest = getChunkManifest(Object.values(bundle))
      for (const chunk of Object.values(bundle)) {
        if (chunk.type === 'chunk') {
          if (chunk.isEntry) {
            // inject runtime
            chunk.code +=
              '\n;' +
              fs.readFileSync(
                path.join(VITE_PACKAGE_DIR, 'misc', 'rolldown-runtime.js'),
                'utf-8',
              )
            if (environment.name === 'client') {
              chunk.code += getRolldownClientCode()
            }
            if (environment.rolldownDevOptions.reactRefresh) {
              chunk.code += getReactRefreshRuntimeCode()
            }
            // inject manifest
            chunk.code += `
__rolldown_runtime.manifest = ${JSON.stringify(manifest, null, 2)};
`
          }
          if (environment.name === 'ssr' && !chunk.isEntry) {
            chunk.code += `
var __rolldown_runtime = __rolldown_module_runner_context.__rolldown_runtime;
`
          }
          if (chunk.name === 'hmr-update') {
            // patch on hmr
            chunk.code += `
__rolldown_runtime.patch(__rolldown_modules);
`
          } else {
            // set module factory
            chunk.code += `
Object.assign(__rolldown_runtime.moduleFactoryMap, __rolldown_modules);
`
            if (chunk.isEntry) {
              // ensure entry chunk
              chunk.code += `
__rolldown_runtime.loadChunkPromises[${JSON.stringify(chunk.name)}] = Promise.resolve();
var __rolldown_entry_promise = __rolldown_runtime.ensureChunk(${JSON.stringify(chunk.name)});
`
              if (environment.name === 'client') {
                // execute entry on client
                assert(chunk.facadeModuleId)
                const stableId = path.relative(
                  environment.config.root,
                  chunk.facadeModuleId,
                )
                chunk.code += `
self.__rolldown_runtime = __rolldown_runtime;
__rolldown_entry_promise.then(function() {
  __rolldown_runtime.require(${JSON.stringify(stableId)})
});
`
              }
              if (environment.name === 'ssr') {
                chunk.code += `
__rolldown_module_runner_context.__rolldown_runtime = Object.assign(
  __rolldown_runtime,
  __rolldown_module_runner_context.__rolldown_runtime,
);
await __rolldown_entry_promise;
`
              }
            }
          }
          chunk.code = moveInlineSourcemapToEnd(chunk.code)
        }
      }
    },
  }
}

export type BuildManifest = {
  chunks: Record<string, { file: string; dependencies: string[] }>
}

function getChunkManifest(
  outputs: (rolldown.RolldownOutputChunk | rolldown.RolldownOutputAsset)[],
): BuildManifest {
  const chunks = outputs.filter((o) => o.type === 'chunk')
  const fileToChunkName: Record<string, string> = {}
  for (const chunk of chunks) {
    fileToChunkName[chunk.fileName] = chunk.name
  }

  const directDepMap: Record<string, string[]> = {}
  for (const chunk of chunks) {
    directDepMap[chunk.name] = chunk.imports.map(
      (file) => fileToChunkName[file],
    )
  }

  function traverse(name: string, adj: Record<string, string[]>): string[] {
    const visited = new Set<string>()
    function recurse(name: string) {
      if (!visited.has(name)) {
        visited.add(name)
        for (const dep of adj[name]) {
          recurse(dep)
        }
      }
    }
    recurse(name)
    return [...visited]
  }

  const manifest: BuildManifest = {
    chunks: {},
  }
  for (const chunk of chunks) {
    manifest.chunks[chunk.name] = {
      file: chunk.fileName,
      dependencies: traverse(chunk.name, directDepMap),
    }
  }
  return manifest
}

function moveInlineSourcemapToEnd(code: string) {
  const sourcemap = code.match(/^\/\/# sourceMappingURL=.*/m)?.[0]
  if (sourcemap) {
    code = code.replace(sourcemap, '') + '\n' + sourcemap
  }
  return code
}

// patch vite:css transform for hmr
function patchCssPlugin(): rolldown.Plugin {
  return {
    name: 'vite:rolldown-patch-css',
    transform: {
      filter: {
        id: {
          include: ['*.css'],
        },
        code: {
          include: ['__vite__updateStyle'],
        },
      },
      handler(code, id) {
        // TODO: import.meta.hot.prune
        const cssCode = code.match(/^const __vite__css = (.*)$/m)![1]
        const jsCode = `
          __rolldown_updateStyle(${JSON.stringify(id)}, ${cssCode});
          module.hot.accept();
        `
        return { code: jsCode, moduleSideEffects: true }
      },
    },
  }
}

// reuse /@vite/client for Websocket API
function getRolldownClientCode() {
  let code = fs.readFileSync(CLIENT_ENTRY, 'utf-8')
  const replacements = {
    // TODO: packages/vite/src/node/plugins/clientInjections.ts
    __BASE__: `"/"`,
    __SERVER_HOST__: `""`,
    __HMR_PROTOCOL__: `null`,
    __HMR_HOSTNAME__: `null`,
    __HMR_PORT__: `new URL(self.location.href).port`,
    __HMR_DIRECT_TARGET__: `""`,
    __HMR_BASE__: `"/"`,
    __HMR_TIMEOUT__: `30000`,
    __HMR_ENABLE_OVERLAY__: `true`,
    __HMR_CONFIG_NAME__: `""`,
  }
  for (const [k, v] of Object.entries(replacements)) {
    code = code.replaceAll(k, v)
  }
  // runtime define is not necessary
  code = code.replace(/^import\s*['"]@vite\/env['"]/gm, '')
  // remove esm
  code = code.replace(/^export\s*\{[^}]*\}/gm, '')
  code = code.replace(/\bimport.meta.url\b/g, 'self.location.href')
  code = code.replace(/^\/\/#.*/gm, '')
  // inject own hmr event handler
  code += `
const hot = createHotContext("/__rolldown");
hot.on("rolldown:hmr", (data) => {
  __rolldown_runtime.manifest = data.manifest;
  if (data.fileName) {
    import("/" + data.fileName + "?t=" + Date.now());
  }
});
self.__rolldown_hot = hot;
self.__rolldown_updateStyle = updateStyle;
`
  return `\n;(() => {/*** @vite/client ***/\n${code}}\n)();\n`
}

function reactRefreshPlugin(): rolldown.Plugin {
  return {
    name: 'vite:rolldown-react-refresh',
    transform: {
      filter: {
        code: {
          include: ['$RefreshReg$'],
        },
      },
      handler(code, id) {
        const output = new MagicString(code)
        output.prepend(
          `const [$RefreshSig$, $RefreshReg$] = __react_refresh_transform_define(${JSON.stringify(id)});`,
        )
        output.append(`;__react_refresh_transform_setupHot(module.hot);`)
        return {
          code: output.toString(),
          map: output.generateMap({ hires: 'boundary' }),
        }
      },
    },
  }
}

// inject react refresh runtime in client runtime to ensure initialized early
function getReactRefreshRuntimeCode() {
  const code = fs.readFileSync(
    path.resolve(
      require.resolve('react-refresh/runtime'),
      '..',
      'cjs/react-refresh-runtime.development.js',
    ),
    'utf-8',
  )
  const output = new MagicString(code)
  output.prepend('\n;self.__react_refresh_runtime = {};\n')
  output.replaceAll('process.env.NODE_ENV !== "production"', 'true')
  output.replaceAll(/\bexports\./g, '__react_refresh_runtime.')
  output.append(`
    (() => {
      __react_refresh_runtime.injectIntoGlobalHook(self);

      self.__react_refresh_transform_define = (file) => [
        __react_refresh_runtime.createSignatureFunctionForTransform,
        (type, id) => __react_refresh_runtime.register(type, file + '_' + id)
      ];

      self.__react_refresh_transform_setupHot = (hot) => {
        hot.accept((prev) => {
          debouncedRefresh();
        });
      };

      function debounce(fn, delay) {
        let handle
        return () => {
          clearTimeout(handle)
          handle = setTimeout(fn, delay)
        }
      }
      const debouncedRefresh = debounce(__react_refresh_runtime.performReactRefresh, 16);
    })()
  `)
  return output.toString()
}
