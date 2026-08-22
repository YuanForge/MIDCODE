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
  const [billingPage, redemptionSection, settingsHook, userApi] = await Promise.all([
    source('src/pages/user/UserBillingPage.tsx'),
    source('src/pages/user/CardRedemptionSection.tsx'),
    source('src/hooks/use-site-settings.ts'),
    source('src/lib/api/user.ts'),
  ])

  assert.match(settingsHook, /cardPurchaseUrl:\s*String\(record\.card_purchase_url\s*\|\|\s*''\)/)
  assert.match(userApi, /http\.post<\{\s*credits\?: number;\s*message\?: string\s*\}>\('\/user\/cards\/redeem'/)
  assert.match(billingPage, /CardRedemptionSection/)
  assert.match(billingPage, /purchaseUrl=\{settings\.cardPurchaseUrl\}/)
  assert.match(billingPage, /onRedeemed=\{reloadBalance\}/)
  assert.ok(billingPage.indexOf('CardRedemptionSection') < billingPage.indexOf('选择充值套餐'))
  assert.match(redemptionSection, /redeemCard/)
  assert.match(redemptionSection, /getRedeemHistory/)
  assert.match(redemptionSection, /purchaseUrl\s*\?\s*\(/)
  assert.match(redemptionSection, /const trimmedCode = code\.trim\(\)/)
  assert.match(redemptionSection, /redeemCard\(trimmedCode\)/)
  assert.match(redemptionSection, /submittingRef\.current/)
  assert.match(redemptionSection, /<label[^>]*htmlFor="card-redemption-code"/)
  assert.match(redemptionSection, /aria-invalid=\{Boolean\(mutError\)\}/)
  assert.match(redemptionSection, /aria-describedby=\{mutError \? mutationErrorId : undefined\}/)
  assert.match(redemptionSection, /id=\{mutationErrorId\}/)
  assert.match(redemptionSection, /\{mutError \?\s*\(/)
  assert.match(redemptionSection, /\{loadError \?\s*\(/)
  assert.doesNotMatch(redemptionSection, /const error = loadError \|\| mutError/)
  assert.match(redemptionSection, /购买卡密/)
  assert.match(redemptionSection, /target="_blank"/)
  assert.match(redemptionSection, /rel="noopener noreferrer"/)
})
