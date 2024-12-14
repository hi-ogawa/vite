import { expect, test } from 'vitest'
import { editFile, isBuild, page, viteTestUrl } from '../../test-utils'

test('basic', async () => {
  await page.getByText('hydrated: true').click()
  await page.getByRole('button', { name: 'Count: 0' }).click()
  await page.getByRole('button', { name: 'Count: 1' }).click()
  await page.getByText('[virtual] test:virtual:ok').click()

  const res = await page.request.get(viteTestUrl)
  expect(await res.text()).toContain('hydrated: <!-- -->false')
})

test.runIf(!isBuild)('server stacktrace', async () => {
  const res = await page.goto(viteTestUrl + '/crash-ssr')
  expect(await res?.text()).toContain('src/error.ts:8:9')
  expect(res?.status()).toBe(500)
})

test.runIf(!isBuild)('hmr', async () => {
  await page.goto(viteTestUrl)
  await page.getByRole('button', { name: 'Count: 0' }).click()

  editFile('./src/app.tsx', (s) => s.replace('Count:', 'Count-x:'))
  await page.getByRole('button', { name: 'Count-x: 1' }).click()

  editFile('./src/app.tsx', (s) => s.replace('Count-x:', 'Count-x-y:'))
  await page.getByRole('button', { name: 'Count-x-y: 2' }).click()

  const res = await page.request.get(viteTestUrl)
  expect(await res.text()).toContain('Count-x-y')
})

test('dynamic-import', async () => {
  const res = await page.goto(viteTestUrl + '/dynamic-import')
  expect(await res?.text()).toContain('[dynamic-import-ok]')
})
