import { expect, test } from 'vitest'
import { addFile, editFile, isBuild, page, viteTestUrl } from '../../test-utils'

test('basic', async () => {
  await page.getByRole('button', { name: 'Count: 0' }).click()
  await page.getByRole('button', { name: 'Count: 1' }).click()
  await page
    .getByText('[virtual] test:virtual:ok, environment.name: client')
    .click()
  await page.getByText('[alias] test-alias-dest:ok').click()
})

test('style', async () => {
  expect(
    await page
      .locator('.test-style')
      .evaluate((el) => getComputedStyle(el).color),
  ).toBe('rgb(255, 165, 0)')
  expect(
    await page
      .locator('.test-style-url')
      .evaluate((el) => getComputedStyle(el).color),
  ).toBe('rgb(255, 165, 0)')
  expect(
    await page
      .locator('.test-style-inline')
      .evaluate((el) => getComputedStyle(el).color),
  ).toBe('rgb(255, 165, 0)')
})

test.runIf(!isBuild)('hmr js', async () => {
  await page.goto(viteTestUrl)
  await page.getByRole('button', { name: 'Count: 0' }).click()

  editFile('./src/app.tsx', (s) => s.replace('Count:', 'Count-x:'))
  await page.getByRole('button', { name: 'Count-x: 1' }).click()

  editFile('./src/app.tsx', (s) => s.replace('Count-x:', 'Count:'))
  await page.getByRole('button', { name: 'Count: 2' }).click()
})

test.runIf(!isBuild)('hmr css', async () => {
  await page.goto(viteTestUrl)

  await expect
    .poll(() =>
      page.locator('.test-style').evaluate((el) => getComputedStyle(el).color),
    )
    .toBe('rgb(255, 165, 0)')
  await page.getByRole('button', { name: 'Count: 0' }).click()

  editFile('./src/test-style.css', (s) => s.replace('orange', 'blue'))
  await expect
    .poll(() =>
      page.locator('.test-style').evaluate((el) => getComputedStyle(el).color),
    )
    .toBe('rgb(0, 0, 255)')
  await page.getByRole('button', { name: 'Count: 1' }).click()

  editFile('./src/test-style-inline.css', (s) => s.replace('orange', 'green'))
  await expect
    .poll(() =>
      page
        .locator('.test-style-inline')
        .evaluate((el) => getComputedStyle(el).color),
    )
    .toBe('rgb(0, 128, 0)')
  await page.getByRole('button', { name: 'Count: 2' }).click()

  editFile('./src/test-style-url.css', (s) => s.replace('orange', 'red'))
  await expect
    .poll(() =>
      page
        .locator('.test-style-url')
        .evaluate((el) => getComputedStyle(el).color),
    )
    .toBe('rgb(255, 0, 0)')
  await page.getByRole('button', { name: 'Count: 3' }).click()
})

test.runIf(!isBuild).only('hmr new file', async () => {
  await page.goto(viteTestUrl)
  await page.getByRole('button', { name: 'Count: 0' }).click()

  addFile('./src/new-file.ts', 'export default "[new-file:ok]"')
  editFile(
    './src/app.tsx',
    (s) =>
      'import newFile from "./new-file";\n' +
      s.replace('Count:', 'Count-{newFile}:'),
  )

  await page.getByRole('button', { name: 'Count-[new-file:ok]: 1' }).click()
})
