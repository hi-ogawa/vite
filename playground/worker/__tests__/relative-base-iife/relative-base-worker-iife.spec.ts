import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { isBuild, page, testDir, untilUpdated } from '~utils'

test('normal', async () => {
  await untilUpdated(() => page.textContent('.pong'), 'pong')
  await untilUpdated(() => page.textContent('.mode'), process.env.NODE_ENV)
  await untilUpdated(
    () => page.textContent('.bundle-with-plugin'),
    'worker bundle with plugin success!'
  )
  await untilUpdated(
    () => page.textContent('.asset-url'),
    isBuild ? '/assets/vite' : '/vite.svg',
    true
  )
})
