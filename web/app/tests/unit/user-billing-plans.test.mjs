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

test('billing owns card purchase, redemption, history, and balance refresh', async () => {
  const [billingPage, redemptionSection, settingsHook] = await Promise.all([
    source('src/pages/user/UserBillingPage.tsx'),
    source('src/pages/user/CardRedemptionSection.tsx'),
    source('src/hooks/use-site-settings.ts'),
  ])

  assert.match(settingsHook, /cardPurchaseUrl:\s*String\(record\.card_purchase_url\s*\|\|\s*''\)/)
  assert.match(billingPage, /CardRedemptionSection/)
  assert.match(billingPage, /purchaseUrl=\{settings\.cardPurchaseUrl\}/)
  assert.match(billingPage, /onRedeemed=\{reloadBalance\}/)
  assert.match(redemptionSection, /redeemCard/)
  assert.match(redemptionSection, /getRedeemHistory/)
  assert.match(redemptionSection, /购买卡密/)
  assert.match(redemptionSection, /target="_blank"/)
  assert.match(redemptionSection, /rel="noopener noreferrer"/)
})
