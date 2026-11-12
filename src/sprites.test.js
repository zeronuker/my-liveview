import assert from 'node:assert/strict'
import { test } from 'node:test'

import { carrySprite, framesOf, HEIGHT, lookOf, poses, shadeOf, spriteFor, tint, WIDTH } from '../public/sprites.js'

const LETTERS = new Set('.obBhHsSpkewlmygt'.split(''))

test('every frame of every pose, with either head, is a clean 12 by 16 grid of known letters', () => {
  for (const pose of poses())
    for (const head of ['short', 'long'])
      for (const [i, frame] of framesOf(pose, head).entries()) {
        assert.equal(frame.length, HEIGHT, `${pose} ${head} ${i}: rows`)
        for (const row of frame) {
          assert.equal(row.length, WIDTH, `${pose} ${head} ${i}: "${row}"`)
          for (const letter of row) assert.ok(LETTERS.has(letter), `${pose}: ${letter}`)
        }
      }
})

test('every pose the stage uses has a sprite, and walking has four frames', () => {
  for (const pose of ['idle', 'walk', 'sit', 'type', 'read', 'grab', 'give', 'ask', 'machine', 'scan', 'review', 'cheer', 'shake']) assert.ok(framesOf(pose), pose)
  assert.equal(framesOf('walk').length, 4)
  assert.equal(framesOf('nonsense'), null)
})

test('a pose with no sprite gives null, so the Office draws a shape instead', () => {
  assert.equal(spriteFor({ pose: 'nonsense', t: 0, id: 'w1', color: '#e76f51' }), null)
})

test('someone always looks the same, and different people differ', () => {
  assert.deepEqual(lookOf('w1'), lookOf('w1'))
  const looks = new Set(Array.from({ length: 40 }, (_, i) => JSON.stringify(lookOf(`w${i}`))))
  assert.ok(looks.size > 20)
})

test('a shade is darker than its colour and still a colour', () => {
  for (const hex of ['#e76f51', '#2a9d8f', '#e9c46a', '#457b9d', '#9b5de5']) {
    const shade = shadeOf(hex)
    assert.match(shade, /^#[0-9a-f]{6}$/)
    const light = c => [1, 3, 5].reduce((sum, i) => sum + parseInt(c.slice(i, i + 2), 16), 0)
    assert.ok(light(shade) < light(hex), `${hex} -> ${shade}`)
  }
})

test('tinting puts the shirt, the hair and the skin in, and leaves the rest clear', () => {
  const look = lookOf('w1')
  const cells = tint(framesOf('idle', look.head)[0], { look, shirt: '#e76f51' })

  assert.equal(cells.length, HEIGHT)
  assert.ok(cells.flat().includes('#e76f51'))
  assert.ok(cells.flat().includes(look.hair[0]))
  assert.ok(cells.flat().includes(look.skin[0]))
  assert.equal(cells[0][0], null)
})

test('the manager has a tie and glasses, a helper a hard hat, and a worker neither', () => {
  const colors = kind => spriteFor({ pose: 'idle', t: 0, id: 'x', kind, color: '#457b9d' }).cells.flat()

  assert.ok(colors('manager').includes('#c0392b')) // the tie
  assert.equal(colors('worker').includes('#c0392b'), false)
  assert.ok(colors('subagent').includes('#e9c46a')) // the hat
  assert.equal(colors('worker').includes('#e9c46a'), false)
})

test('the frame changes with time, and two people are not in step', () => {
  const frames = id => Array.from({ length: 8 }, (_, i) => spriteFor({ pose: 'walk', t: i * 0.15, id, color: '#2a9d8f' }).key)

  assert.ok(new Set(frames('w1')).size >= 3)
  assert.notDeepEqual(frames('w1'), frames('w2'))
})

test('the same person in the same frame has the same key, for the cache', () => {
  const a = spriteFor({ pose: 'type', t: 0.05, id: 'w1', color: '#2a9d8f' })
  const b = spriteFor({ pose: 'type', t: 0.05, id: 'w1', color: '#2a9d8f' })

  assert.equal(a.key, b.key)
})

test('a book and papers can be carried; nothing else', () => {
  assert.ok(carrySprite('book').cells.flat().includes('#a8652f'))
  assert.ok(carrySprite('papers'))
  assert.equal(carrySprite('anvil'), null)
  assert.equal(carrySprite(null), null)
})
