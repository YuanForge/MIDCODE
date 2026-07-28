import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = () => readFile(new URL('../../src/components/shared/ModelGroupSelector.tsx', import.meta.url), 'utf8')

test('shared model group selector formats official discount badges', async () => {
  const component = await source()

  assert.match(component, /official_discount_bps/)
  assert.match(component, /\/ 1000/)
  assert.match(component, /toFixed\(2\)/)
  assert.match(component, /replace\(\/\\\.\?0\+\$\//)
  assert.match(component, /暂无官方价/)
  assert.match(component, /折扣不一致/)
})
