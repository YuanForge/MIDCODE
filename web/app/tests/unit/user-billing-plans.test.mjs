import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8')

test('recharge plan UI keeps package selection and bonus credits visible', async () => {
  const page = await source('src/pages/user/UserBillingPage.tsx')
  assert.match(page, /settings\.plans/)
  assert.match(page, /plan\.bonus/)
  assert.match(page, /selectedPlan/)
})
