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

test('recharge and exchange pages link to card purchase site when configured', async () => {
  const [billingPage, exchangePage, settingsHook] = await Promise.all([
    source('src/pages/user/UserBillingPage.tsx'),
    source('src/pages/user/UserExchangePage.tsx'),
    source('src/hooks/use-site-settings.ts'),
  ])

  assert.match(settingsHook, /cardPurchaseUrl/)
  assert.match(billingPage, /settings\.cardPurchaseUrl/)
  assert.match(exchangePage, /settings\.cardPurchaseUrl/)
  assert.match(billingPage, /购买卡密/)
  assert.match(exchangePage, /购买卡密/)
})
