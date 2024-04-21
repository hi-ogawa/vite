import { expect, test, vi } from 'vitest'
import { page } from '~utils'

test('basic', async () => {
  await page.getByText('hydrated: true').isVisible()
  await page.getByText('Count: 0').isVisible()
  await page.getByRole('button', { name: '+' }).click()
  await page.getByText('Count: 1').isVisible()
})

test('css', async () => {
  await vi.waitFor(async () =>
    expect(
      await page
        .locator('#css-client')
        .evaluate((e) => window.getComputedStyle(e).padding),
    ).toBe('10px'),
  )
  await vi.waitFor(async () =>
    expect(
      await page
        .locator('#css-server')
        .evaluate((e) => window.getComputedStyle(e).padding),
    ).toBe('10px'),
  )
})
