import type { DepOptimizationMetadata } from 'vite'
import { expect, test } from 'vitest'
import { isBuild, readFile } from '~utils'

test.runIf(!isBuild)('client - metadata', async () => {
  const meta = await readFile('node_modules/.vite/deps/_metadata.json')
  const metaJson: DepOptimizationMetadata = JSON.parse(meta)

  expect(metaJson.optimized['react']).toBeTruthy()
  expect(metaJson.optimized['react-dom/client']).toBeTruthy()
  expect(metaJson.optimized['react/jsx-dev-runtime']).toBeTruthy()

  expect(metaJson.optimized['react-dom/server']).toBeFalsy()
})

test.runIf(!isBuild)('ssr - metadata', async () => {
  const meta = await readFile('node_modules/.vite/deps_ssr/_metadata.json')
  const metaJson: DepOptimizationMetadata = JSON.parse(meta)

  expect(metaJson.optimized['react']).toBeTruthy()
  expect(metaJson.optimized['react-dom/server']).toBeTruthy()
  expect(metaJson.optimized['react/jsx-dev-runtime']).toBeTruthy()

  expect(metaJson.optimized['react-dom/client']).toBeFalsy()
})
