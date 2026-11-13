import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createGlide } from '../public/glide.js'

// something that jumps a tile at a time, once a second, as people do on the stage
const walk = (glide, steps, dt = 1 / 60) => {
  const drawn = []
  let x = 0
  for (let i = 0; i < steps; i++) {
    if (i % 60 === 0) x += 1 // the true place moves a whole tile at once
    drawn.push(glide.place('a', x, 0, dt))
  }
  return drawn
}

test('the first time something is seen it is drawn where it is, not moving', () => {
  const glide = createGlide()

  assert.deepEqual(glide.place('a', 5, 7, 0.016), { x: 5, y: 7, vx: 0, speed: 0, stride: 0, moving: false })
})

test('it follows a jump in small steps, behind the true place, and gets there', () => {
  const glide = createGlide()
  glide.place('a', 0, 0, 0.016)
  const drawn = []
  for (let i = 0; i < 120; i++) drawn.push(glide.place('a', 1, 0, 1 / 60))

  assert.ok(drawn[0].x > 0 && drawn[0].x < 0.5, 'a little way on the first frame')
  for (let i = 1; i < drawn.length; i++) {
    assert.ok(drawn[i].x >= drawn[i - 1].x, 'never backwards')
    assert.ok(drawn[i].x <= 1, 'never past it')
    assert.ok(drawn[i].x - drawn[i - 1].x < 0.2, 'no jumps')
  }
  assert.ok(Math.abs(drawn.at(-1).x - 1) < 0.001, 'arrives')
})

test('it eases: it starts gently, is fastest in the middle of a move and slows down as it nears the place', () => {
  const glide = createGlide()
  glide.place('a', 0, 0, 0.016)
  const speeds = []
  let before = 0
  for (let i = 0; i < 60; i++) {
    const next = glide.place('a', 1, 0, 1 / 60).x
    speeds.push(next - before)
    before = next
  }
  const fastest = speeds.indexOf(Math.max(...speeds))

  assert.ok(speeds[0] < speeds[fastest] * 0.5, 'a gentle start')
  assert.ok(fastest > 2 && fastest < 25, `fastest at frame ${fastest}`)
  assert.ok(speeds[59] < speeds[fastest] * 0.5, 'slower as it arrives')
})

test('it says when something is going somewhere, and not when it is standing still', () => {
  const glide = createGlide()
  const drawn = walk(glide, 59) // a tile in the first frame, then nothing more for a second
  glide.place('a', 3, 0, 1 / 60)
  const standing = []
  for (let i = 0; i < 90; i++) standing.push(glide.place('a', 3, 0, 1 / 60))

  assert.ok(drawn.some(d => d.moving) || standing.slice(0, 20).some(d => d.moving), 'moving while it goes')
  assert.equal(standing.at(-1).moving, false)
  assert.ok(standing.at(-1).speed < 0.05)
})

test('the stride grows with the distance gone, so the size of a step stays the same at any speed', () => {
  const glide = createGlide()
  glide.place('a', 0, 0, 0.016)
  let last
  for (let i = 0; i < 20 * 15; i++) last = glide.place('a', Math.min(5, Math.floor(i / 15)), 0, 1 / 60) // a tile a quarter of a second, to five tiles
  for (let i = 0; i < 120; i++) last = glide.place('a', 5, 0, 1 / 60)

  assert.ok(Math.abs(last.stride - 5) < 0.05, `${last.stride} tiles gone for 5`)
})

test('a place that is far off is a jump: it goes there at once and is not dragged across the plan', () => {
  const glide = createGlide()
  glide.place('a', 0, 0, 0.016)
  const next = glide.place('a', 30, 20, 0.016)

  assert.deepEqual([next.x, next.y, next.moving], [30, 20, false])
})

test('every thing has its own place, and one that has gone is forgotten', () => {
  const glide = createGlide()
  glide.place('a', 0, 0, 0.016)
  glide.place('b', 9, 9, 0.016)
  glide.keep(['b'])

  assert.equal(glide.place('b', 9, 9, 0.016).x, 9)
  assert.deepEqual(glide.place('a', 4, 4, 0.016), { x: 4, y: 4, vx: 0, speed: 0, stride: 0, moving: false }) // new again
})

test('with no time passed it stays where it was, and a long wait does not overshoot', () => {
  const glide = createGlide()
  glide.place('a', 0, 0, 0.016)
  assert.equal(glide.place('a', 1, 0, 0).x, 0)
  assert.ok(glide.place('a', 1, 0, 10).x <= 1)
})
