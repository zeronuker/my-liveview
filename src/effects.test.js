import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createEffects } from '../public/effects.js'

// a random number generator that counts up, so a test is the same every time
const counting = () => {
  let n = 0
  return () => ((n += 0.137) % 1)
}

test('confetti is twenty bits that go up and then fall, and are gone within three seconds', () => {
  const effects = createEffects({ random: counting() })
  effects.spawn('confetti', 5, 5)
  assert.equal(effects.all().length, 20)

  const startY = effects.all()[0].y
  let lowest = startY
  for (let t = 0; t < 40; t++) {
    effects.update(0.05)
    for (const bit of effects.all()) lowest = Math.min(lowest, bit.y)
  }
  assert.ok(lowest < startY - 0.3, 'went up')
  effects.update(1)
  assert.ok(effects.all().every(bit => bit.y > lowest), 'and came down')
  effects.update(2)
  assert.equal(effects.all().length, 0)
})

test('a warning rises slowly and is gone after a little over a second', () => {
  const effects = createEffects()
  effects.spawn('warning', 3, 4)
  effects.update(0.5)

  assert.ok(effects.all()[0].y < 4)
  effects.update(0.8)
  assert.equal(effects.all().length, 0)
})

test('a ring stays where it is, takes its tone, and is gone after 0.6 seconds', () => {
  const effects = createEffects()
  effects.spawn('ring', 3, 4, { tone: 'ok' })
  effects.update(0.3)

  assert.deepEqual([effects.all()[0].x, effects.all()[0].y, effects.all()[0].tone], [3, 4, 'ok'])
  effects.update(0.4)
  assert.equal(effects.all().length, 0)
})

test('a glyph is one of the code characters and floats up', () => {
  const effects = createEffects({ random: counting() })
  effects.spawn('glyph', 3, 4)
  effects.update(0.5)
  const [glyph] = effects.all()

  assert.ok(['0', '1', '{', '}', ';', '>', '_'].includes(glyph.glyph))
  assert.ok(glyph.y < 4)
})

test('there is a limit on how many there are at once, and an unknown kind does nothing', () => {
  const effects = createEffects({ max: 30 })
  effects.spawn('confetti', 1, 1)
  effects.spawn('confetti', 1, 1)
  effects.spawn('sparkle', 1, 1)

  assert.equal(effects.all().length, 30)
})

test('nothing to update is fine', () => {
  const effects = createEffects()
  effects.update(1)

  assert.deepEqual(effects.all(), [])
})
