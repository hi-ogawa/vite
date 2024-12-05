import { test } from 'vitest'
import { editFile, isBuild, page, viteTestUrl } from '../../test-utils'

test('basic', async () => {
  await page.getByRole('button', { name: 'Count: 0' }).click()
  await page.getByRole('button', { name: 'Count: 1' }).click()
})

test.runIf(!isBuild)('hmr js', async () => {
  await page.goto(viteTestUrl)
  await page.getByRole('button', { name: 'Count: 0' }).click()

  editFile('./src/App.vue', (s) => s.replace('Count:', 'Count-x:'))
  await page.getByRole('button', { name: 'Count-x: 1' }).click()

  editFile('./src/app.tsx', (s) => s.replace('Count-x:', 'Count:'))
  await page.getByRole('button', { name: 'Count: 2' }).click()
})
