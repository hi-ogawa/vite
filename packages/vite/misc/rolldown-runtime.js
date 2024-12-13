// based on
// https://github.com/rolldown/rolldown/blob/a29240168290e45b36fdc1a6d5c375281fb8dc3e/crates/rolldown/src/runtime/runtime-without-comments.js#L69
// https://github.com/hi-ogawa/rolldown/blob/27d203a74d8dd95aed256bde29232d535bd294f4/crates/rolldown/src/runtime/runtime-app.js

var __create = Object.create
var __defProp = Object.defineProperty
var __getOwnPropDesc = Object.getOwnPropertyDescriptor
var __getOwnPropNames = Object.getOwnPropertyNames
var __getProtoOf = Object.getPrototypeOf
var __hasOwnProp = Object.prototype.hasOwnProperty
var __esm = (fn, res) =>
  function () {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])((fn = 0))), res
  }
var __esmMin = (fn, res) => () => (fn && (res = fn((fn = 0))), res)
var __commonJS = (cb, mod) =>
  function () {
    return (
      mod ||
        (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod),
      mod.exports
    )
  }
var __commonJSMin = (cb, mod) => () => (
  mod || cb((mod = { exports: {} }).exports, mod), mod.exports
)
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true })
}
var __copyProps = (to, from, except, desc) => {
  if ((from && typeof from === 'object') || typeof from === 'function')
    for (
      var keys = __getOwnPropNames(from), i = 0, n = keys.length, key;
      i < n;
      i++
    ) {
      key = keys[i]
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, {
          get: ((k) => from[k]).bind(null, key),
          enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable,
        })
    }
  return to
}
var __reExport = (target, mod, secondTarget) => (
  __copyProps(target, mod, 'default'),
  secondTarget && __copyProps(secondTarget, mod, 'default')
)
var __toESM = (mod, isNodeMode, target) => (
  (target = mod != null ? __create(__getProtoOf(mod)) : {}),
  __copyProps(
    isNodeMode || !mod || !mod.__esModule
      ? __defProp(target, 'default', { value: mod, enumerable: true })
      : target,
    mod,
  )
)
var __toCommonJS = (mod) =>
  __copyProps(__defProp({}, '__esModule', { value: true }), mod)
var __toBinaryNode = (base64) => new Uint8Array(Buffer.from(base64, 'base64'))
var __toBinary = /* @__PURE__ */ (() => {
  var table = new Uint8Array(128)
  for (var i = 0; i < 64; i++)
    table[i < 26 ? i + 65 : i < 52 ? i + 71 : i < 62 ? i - 4 : i * 4 - 205] = i
  return (base64) => {
    var n = base64.length,
      bytes = new Uint8Array(
        (((n - (base64[n - 1] == '=') - (base64[n - 2] == '=')) * 3) / 4) | 0,
      )
    for (var i = 0, j = 0; i < n; ) {
      var c0 = table[base64.charCodeAt(i++)],
        c1 = table[base64.charCodeAt(i++)]
      var c2 = table[base64.charCodeAt(i++)],
        c3 = table[base64.charCodeAt(i++)]
      bytes[j++] = (c0 << 2) | (c1 >> 4)
      bytes[j++] = (c1 << 4) | (c2 >> 2)
      bytes[j++] = (c2 << 6) | c3
    }
    return bytes
  }
})()

/**
 * @typedef {(runtime: unknown) => void} ModuleFactory
 * @typedef {Record<string, ModuleFactory>} ModuleFactoryMap
 * @typedef {{ exports: unknown, parents: string[], hot: any }} ModuleCacheEntry
 * @typedef {Record<string, ModuleCacheEntry>} ModuleCache
 */

var __rolldown_runtime = {
  /**
   * @type {string[]}
   */
  executeModuleStack: [],
  /**
   * @type {ModuleCache}
   */
  moduleCache: {},
  /**
   * @type {ModuleFactoryMap}
   */
  moduleFactoryMap: {},
  /**
   * @param {string} id
   * @returns {unknown}
   */
  require: function (id) {
    const parent = this.executeModuleStack.at(-1)
    if (this.moduleCache[id]) {
      var module = this.moduleCache[id]
      if (parent && !module.parents.includes(parent)) {
        module.parents.push(parent)
      }
      return module.exports
    }
    var factory = this.moduleFactoryMap[id]
    if (!factory) {
      // handle external
      if (typeof __require_external !== 'undefined') {
        return __require_external(id)
      }
      throw new Error('Module not found: ' + id)
    }
    var module = (this.moduleCache[id] = {
      exports: {},
      parents: parent ? [parent] : [],
      hot: {
        selfAccept: false,
        acceptCallbacks: [],
        accept: function (callback) {
          this.selfAccept = true
          if (callback && typeof callback === 'function') {
            this.acceptCallbacks.push({
              deps: [id],
              callback,
            })
          }
        },
      },
    })
    this.executeModuleStack.push(id)
    factory({
      module,
      exports: module.exports,
      require: this.require.bind(this),
      ensureChunk: this.ensureChunk.bind(this),
      __toCommonJS,
      __toESM,
      __export,
      __reExport,
    })
    this.executeModuleStack.pop()
    return module.exports
  },
  /**
   * @param {ModuleFactoryMap} newModuleFactoryMap
   */
  patch: function (newModuleFactoryMap) {
    var boundaries = []
    var invalidModuleIds = []
    var acceptCallbacks = []

    const updateModuleIds = Object.keys(newModuleFactoryMap)
    for (var i = 0; i < updateModuleIds.length; i++) {
      foundBoundariesAndInvalidModuleIds(
        updateModuleIds[i],
        boundaries,
        invalidModuleIds,
        acceptCallbacks,
        this.moduleCache,
      )
    }

    for (var i = 0; i < invalidModuleIds.length; i++) {
      var id = invalidModuleIds[i]
      delete this.moduleCache[id]
    }

    Object.assign(this.moduleFactoryMap, newModuleFactoryMap)

    for (var i = 0; i < boundaries.length; i++) {
      this.require(boundaries[i])
    }

    for (var i = 0; i < acceptCallbacks.length; i++) {
      var item = acceptCallbacks[i]
      item.callback.apply(
        null,
        item.deps.map((dep) => this.moduleCache[dep].exports),
      )
    }

    function foundBoundariesAndInvalidModuleIds(
      updateModuleId,
      boundaries,
      invalidModuleIds,
      acceptCallbacks,
      moduleCache,
    ) {
      var queue = [{ moduleId: updateModuleId, chain: [updateModuleId] }]
      var visited = {}

      while (queue.length > 0) {
        var item = queue.pop()
        var moduleId = item.moduleId
        var chain = item.chain

        if (visited[moduleId]) {
          continue
        }

        var module = moduleCache[moduleId]
        if (!module) {
          continue
        }

        if (module.hot.selfAccept) {
          if (boundaries.indexOf(moduleId) === -1) {
            boundaries.push(moduleId)

            for (var i = 0; i < module.hot.acceptCallbacks.length; i++) {
              var item = module.hot.acceptCallbacks[i]
              acceptCallbacks.push(item)
            }
          }
          for (var i = 0; i < chain.length; i++) {
            if (invalidModuleIds.indexOf(chain[i]) === -1) {
              invalidModuleIds.push(chain[i])
            }
          }
          continue
        }

        boundaries.push(moduleId)
        invalidModuleIds.push(moduleId)
        if (module.parents.length === 0) {
          globalThis.window?.location.reload()
          break
        }

        for (var i = 0; i < module.parents.length; i++) {
          var parent = module.parents[i]
          queue.push({
            moduleId: parent,
            chain: chain.concat([parent]),
          })
        }

        visited[moduleId] = true
      }
    }
  },

  /** @type {{ chunks: Record<string, { file: string, dependencies: string[] }> }} */
  manifest: {},

  /** @type {(name: string) => Promise<void>} */
  async ensureChunk(name) {
    const entry = this.manifest.chunks[name]
    await Promise.all(
      [name, ...entry.dependencies].map((name) => this.loadChunkCached(name)),
    )
  },

  /** @type {Record<string, Promise<void>>} */
  loadChunkPromises: {},

  /** @type {(name: string) => Promise<void>} */
  async loadChunkCached(name) {
    return (this.loadChunkPromises[name] ??= this.loadChunk(name))
  },

  /** @type {(name: string) => Promise<void>} */
  async loadChunk(name) {
    // TODO: use classic script
    const file = this.manifest.chunks[name].file
    await import(`/` + file)
  },
}
