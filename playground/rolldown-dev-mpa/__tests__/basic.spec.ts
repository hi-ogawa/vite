import { test } from 'vitest'
import { page } from '../../test-utils'

test('basic', async () => {
  page.setDefaultTimeout(1000)
  await page.getByRole('heading', { name: 'Home' }).click()
  await page.getByText('Rendered by /index.js').click()
  await page.getByText('shared: [ok]').click()
  await page.getByRole('link', { name: 'About' }).click()
  await page.waitForURL(/\/about/)
  await page.getByRole('heading', { name: 'About' }).click()
  await page.getByText('Rendered by /about/index.js').click()
  await page.getByText('shared: [ok]').click()
})
