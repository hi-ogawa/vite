import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { createServer, resolveConfig } from '..'

describe('resolveBuildEnvironmentOptions in dev', () => {
  test('build.rollupOptions should not have input in lib', async () => {
    const config = await resolveConfig(
      {
        build: {
          lib: {
            entry: './index.js',
          },
        },
      },
      'serve',
    )

    expect(config.build.rollupOptions).not.toHaveProperty('input')
  })
})

describe('resolveId', () => {
  test('mainFields default', async () => {
    const server = await createServer({
      configFile: false,
      root: fileURLToPath(new URL('./', import.meta.url)),
      logLevel: 'silent',
      optimizeDeps: {
        noDiscovery: true,
      },
      environments: {
        custom: {},
      },
    })
    expect(
      (
        await server.pluginContainer.resolveId(
          '@vitejs/dep-main-fields',
          undefined,
        )
      )?.id,
    ).toContain('module.mjs')
    expect(
      (
        await server.environments.custom.pluginContainer.resolveId(
          '@vitejs/dep-main-fields',
          undefined,
        )
      )?.id,
    ).toContain('module.mjs')
  })

  test('mainFields empty environment', async () => {
    const server = await createServer({
      configFile: false,
      root: fileURLToPath(new URL('./', import.meta.url)),
      logLevel: 'silent',
      optimizeDeps: {
        noDiscovery: true,
      },
      environments: {
        custom: {
          resolve: {
            mainFields: [],
          },
        },
      },
    })
    expect(
      (
        await server.pluginContainer.resolveId(
          '@vitejs/dep-main-fields',
          undefined,
        )
      )?.id,
    ).toContain('module.mjs')
    expect(
      (
        await server.environments.custom.pluginContainer.resolveId(
          '@vitejs/dep-main-fields',
          undefined,
        )
      )?.id,
    ).toContain('main.cjs')
  })

  test('mainFields empty top level', async () => {
    const server = await createServer({
      configFile: false,
      root: fileURLToPath(new URL('./', import.meta.url)),
      logLevel: 'silent',
      optimizeDeps: {
        noDiscovery: true,
      },
      resolve: {
        mainFields: [],
      },
      environments: {
        custom: {},
      },
    })
    expect(
      (
        await server.pluginContainer.resolveId(
          '@vitejs/dep-main-fields',
          undefined,
        )
      )?.id,
    ).toContain('main.cjs')
    expect(
      (
        await server.environments.custom.pluginContainer.resolveId(
          '@vitejs/dep-main-fields',
          undefined,
        )
      )?.id,
    ).toContain('main.cjs')
  })
})
