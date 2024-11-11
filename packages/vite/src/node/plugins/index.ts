import aliasPlugin, { type ResolverFunction } from '@rollup/plugin-alias'
import type { ObjectHook } from 'rolldown'
import {
  aliasPlugin as nativeAliasPlugin,
  dynamicImportVarsPlugin as nativeDynamicImportVarsPlugin,
  importGlobPlugin as nativeImportGlobPlugin,
  jsonPlugin as nativeJsonPlugin,
  modulePreloadPolyfillPlugin as nativeModulePreloadPolyfillPlugin,
  transformPlugin as nativeTransformPlugin,
  wasmFallbackPlugin as nativeWasmFallbackPlugin,
  wasmHelperPlugin as nativeWasmHelperPlugin,
} from 'rolldown/experimental'
import type { PluginHookUtils, ResolvedConfig } from '../config'
import { isDepOptimizationDisabled } from '../optimizer'
import {
  type HookHandler,
  type Plugin,
  type PluginWithRequiredHook,
  createBuiltinPluginWithEnvironmentSupport,
} from '../plugin'
import { watchPackageDataPlugin } from '../packages'
import { jsonPlugin } from './json'
import { filteredResolvePlugin, resolvePlugin } from './resolve'
import { optimizedDepsPlugin } from './optimizedDeps'
import { importAnalysisPlugin } from './importAnalysis'
import { cssAnalysisPlugin, cssPlugin, cssPostPlugin } from './css'
import { assetPlugin } from './asset'
import { clientInjectionsPlugin } from './clientInjections'
import { buildHtmlPlugin, htmlInlineProxyPlugin } from './html'
import { wasmFallbackPlugin, wasmHelperPlugin } from './wasm'
import { modulePreloadPolyfillPlugin } from './modulePreloadPolyfill'
import { webWorkerPlugin } from './worker'
import { preAliasPlugin } from './preAlias'
import { definePlugin } from './define'
import { workerImportMetaUrlPlugin } from './workerImportMetaUrl'
import { assetImportMetaUrlPlugin } from './assetImportMetaUrl'
import { metadataPlugin } from './metadata'
import { dynamicImportVarsPlugin } from './dynamicImportVars'
import { importGlobPlugin } from './importMetaGlob'
import { oxcPlugin } from './oxc'

export async function resolvePlugins(
  config: ResolvedConfig,
  prePlugins: Plugin[],
  normalPlugins: Plugin[],
  postPlugins: Plugin[],
): Promise<Plugin[]> {
  const isBuild = config.command === 'build'
  const isWorker = config.isWorker
  const buildPlugins = isBuild
    ? await (await import('../build')).resolveBuildPlugins(config)
    : { pre: [], post: [] }
  const { modulePreload } = config.build
  const depOptimizationEnabled =
    !isBuild &&
    Object.values(config.environments).some(
      (environment) => !isDepOptimizationDisabled(environment.optimizeDeps),
    )
  const enableNativePlugin = config.experimental.enableNativePlugin
  const rolldownDev = config.experimental.rolldownDev

  return [
    depOptimizationEnabled ? optimizedDepsPlugin() : null,
    isBuild ? metadataPlugin() : null,
    !isWorker ? watchPackageDataPlugin(config.packageCache) : null,
    !isBuild ? preAliasPlugin(config) : null,
    enableNativePlugin
      ? nativeAliasPlugin({
          entries: config.resolve.alias.map((item) => {
            return {
              find: item.find,
              replacement: item.replacement,
            }
          }),
        })
      : aliasPlugin({
          entries: config.resolve.alias,
          customResolver: viteAliasCustomResolver,
        }),

    ...prePlugins,

    modulePreload !== false && modulePreload.polyfill
      ? enableNativePlugin
        ? createBuiltinPluginWithEnvironmentSupport(
            'native:modulepreload-polyfill',
            (environment) => {
              if (
                config.command !== 'build' ||
                environment.config.consumer !== 'client'
              )
                return false
              return nativeModulePreloadPolyfillPlugin({
                skip: false,
              })
            },
          )
        : modulePreloadPolyfillPlugin(config)
      : null,
    enableNativePlugin
      ? filteredResolvePlugin(
          {
            root: config.root,
            isProduction: config.isProduction,
            isBuild,
            packageCache: config.packageCache,
            asSrc: true,
            optimizeDeps: true,
            externalize: isBuild && !!config.build.ssr, // TODO: should we do this for all environments?
          },
          config.environments,
        )
      : resolvePlugin(
          {
            root: config.root,
            isProduction: config.isProduction,
            isBuild,
            packageCache: config.packageCache,
            asSrc: true,
            optimizeDeps: true,
            externalize: true,
          },
          config.environments,
        ),
    htmlInlineProxyPlugin(config),
    cssPlugin(config),
    config.oxc !== false
      ? rolldownDev
        ? createBuiltinPluginWithEnvironmentSupport(
            'native:transform',
            (environment) =>
              nativeTransformPlugin({
                reactRefresh:
                  environment.name === 'client' && rolldownDev?.reactRefresh,
              }),
          )
        : enableNativePlugin
          ? nativeTransformPlugin()
          : oxcPlugin(config)
      : null,
    enableNativePlugin
      ? nativeJsonPlugin({
          // TODO: support json.stringify: 'auto'
          stringify:
            !config.json?.stringify || config.json.stringify === 'auto'
              ? false
              : config.json?.stringify,
          isBuild,
        })
      : jsonPlugin(
          {
            stringify: 'auto',
            namedExports: true,
            ...config.json,
          },
          isBuild,
        ),
    enableNativePlugin ? nativeWasmHelperPlugin() : wasmHelperPlugin(),
    webWorkerPlugin(config),
    assetPlugin(config),

    ...normalPlugins,

    enableNativePlugin ? nativeWasmFallbackPlugin() : wasmFallbackPlugin(),
    definePlugin(config),
    cssPostPlugin(config),
    isBuild && buildHtmlPlugin(config),
    workerImportMetaUrlPlugin(config),
    assetImportMetaUrlPlugin(config),
    ...buildPlugins.pre,
    enableNativePlugin
      ? nativeDynamicImportVarsPlugin()
      : dynamicImportVarsPlugin(config),
    enableNativePlugin
      ? nativeImportGlobPlugin({
          root: config.root,
          restoreQueryExtension: config.experimental.importGlobRestoreExtension,
        })
      : importGlobPlugin(config),

    ...postPlugins,

    ...buildPlugins.post,

    // internal server-only plugins are always applied after everything else
    ...(isBuild
      ? []
      : [
          clientInjectionsPlugin(config),
          cssAnalysisPlugin(config),
          importAnalysisPlugin(config),
        ]),
  ].filter(Boolean) as Plugin[]
}

export function createPluginHookUtils(
  plugins: readonly Plugin[],
): PluginHookUtils {
  // sort plugins per hook
  const sortedPluginsCache = new Map<keyof Plugin, Plugin[]>()
  function getSortedPlugins<K extends keyof Plugin>(
    hookName: K,
  ): PluginWithRequiredHook<K>[] {
    if (sortedPluginsCache.has(hookName))
      return sortedPluginsCache.get(hookName) as PluginWithRequiredHook<K>[]
    const sorted = getSortedPluginsByHook(hookName, plugins)
    sortedPluginsCache.set(hookName, sorted)
    return sorted
  }
  function getSortedPluginHooks<K extends keyof Plugin>(
    hookName: K,
  ): NonNullable<HookHandler<Plugin[K]>>[] {
    const plugins = getSortedPlugins(hookName)
    return plugins.map((p) => getHookHandler(p[hookName])).filter(Boolean)
  }

  return {
    getSortedPlugins,
    getSortedPluginHooks,
  }
}

export function getSortedPluginsByHook<K extends keyof Plugin>(
  hookName: K,
  plugins: readonly Plugin[],
): PluginWithRequiredHook<K>[] {
  const sortedPlugins: Plugin[] = []
  // Use indexes to track and insert the ordered plugins directly in the
  // resulting array to avoid creating 3 extra temporary arrays per hook
  let pre = 0,
    normal = 0,
    post = 0
  for (const plugin of plugins) {
    const hook = plugin[hookName]
    if (hook) {
      if (typeof hook === 'object') {
        if (hook.order === 'pre') {
          sortedPlugins.splice(pre++, 0, plugin)
          continue
        }
        if (hook.order === 'post') {
          sortedPlugins.splice(pre + normal + post++, 0, plugin)
          continue
        }
      }
      sortedPlugins.splice(pre + normal++, 0, plugin)
    }
  }

  return sortedPlugins as PluginWithRequiredHook<K>[]
}

export function getHookHandler<T extends ObjectHook<Function>>(
  hook: T,
): HookHandler<T> {
  return (typeof hook === 'object' ? hook.handler : hook) as HookHandler<T>
}

// Same as `@rollup/plugin-alias` default resolver, but we attach additional meta
// if we can't resolve to something, which will error in `importAnalysis`
export const viteAliasCustomResolver: ResolverFunction = async function (
  id,
  importer,
  options,
) {
  const resolved = await this.resolve(id, importer, options)
  return resolved || { id, meta: { 'vite:alias': { noResolved: true } } }
}
