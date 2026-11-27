import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = () => readFile(new URL('../../../../internal/handler/auth_models.go', import.meta.url), 'utf8')

test('user model listing loads the provider bound to each channel', async () => {
  const handler = await source()

  assert.match(handler, /Select\("c\.\*, mp\.name AS model_provider"\)/)
  assert.match(handler, /Join\("INNER", "model_providers mp", "mp\.id = c\.model_provider_id"\)/)
})
