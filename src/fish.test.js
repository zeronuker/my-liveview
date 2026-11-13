import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createFish, FISH_COLORS, TURN } from '../public/fish.js'
import { buildGarden, waterGrid } from '../public/garden.js'
import { buildStudio } from '../public/studio.js'

const layout = buildStudio()
const garden = buildGarden(layout)
const water = waterGrid(layout, garden)

// a random number generator that gives the same numbers every time
const seeded = seed => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296

test('the water that can be seen is a good stretch of the pond, away from the terrace and the boardwalk', () => {
  assert.ok(water.join('').split('.').length - 1 >= 50, 'there is water to swim in')
  for (const room of layout.rooms.filter(r => r.name === 'Terrace' || r.name === 'Boardwalk'))
    for (let y = room.y; y < room.y + room.h; y++) for (let x = room.x; x < room.x + room.w; x++) assert.equal(water[y][x], '#', `${x},${y} is under the ${room.name}`)
  assert.equal(water[20][10], '#') // and grass and the building are not water
})

test('there are five koi, orange, white and gold, all in the water', () => {
  const fish = createFish(water, 5, seeded(1)).snapshot()

  assert.equal(fish.length, 5)
  assert.deepEqual(new Set(fish.map(f => f.color)), new Set(FISH_COLORS.slice(0, 3)))
  for (const f of fish) assert.equal(water[Math.round(f.y)][Math.round(f.x)], '.', `${f.id} starts in the water`)
})

test('fish stay in the water for ten minutes, and go over most of it', () => {
  const fish = createFish(water, 5, seeded(2))
  const visited = new Set()
  for (let i = 0; i < 12000; i++) {
    fish.tick(0.05)
    for (const f of fish.snapshot()) {
      assert.equal(water[Math.round(f.y)][Math.round(f.x)], '.', `${f.id} at ${f.x.toFixed(2)},${f.y.toFixed(2)} is out of the water`)
      visited.add(`${Math.round(f.x)},${Math.round(f.y)}`)
    }
  }
  const main = water.join('').split('.').length - 1

  assert.ok(visited.size > main * 0.5, `${visited.size} cells of about ${main}`)
})

test('fish move smoothly: each step is small, they turn no faster than they can, and they speed up and slow down gradually', () => {
  const fish = createFish(water, 5, seeded(3))
  let before = fish.snapshot()
  let moved = 0
  for (let i = 0; i < 6000; i++) {
    fish.tick(0.02)
    const now = fish.snapshot()
    now.forEach((f, k) => {
      const step = Math.hypot(f.x - before[k].x, f.y - before[k].y)
      assert.ok(step <= 0.9 * 0.02 + 1e-9, `${f.id} moved ${step} in one step`)
      const turn = Math.abs(((f.heading - before[k].heading + 3 * Math.PI) % (2 * Math.PI)) - Math.PI)
      assert.ok(turn <= TURN * 0.02 + 1e-9, `${f.id} turned ${turn} in one step`)
      assert.ok(Math.abs(f.speed - before[k].speed) < 0.04, `${f.id} changed speed by ${Math.abs(f.speed - before[k].speed)}`) // two tiles a second a second at the most
      moved += step
    })
    before = now
  }
  assert.ok(moved > 20, 'they swim')
})

test('fish rest now and then and move on, and each swims where it likes', () => {
  const fish = createFish(water, 5, seeded(4))
  const slow = new Set()
  const heading = new Set()
  for (let i = 0; i < 6000; i++) {
    fish.tick(0.05)
    for (const f of fish.snapshot()) {
      if (f.speed < 0.1) slow.add(f.id)
      heading.add(Math.round(f.heading))
    }
  }

  assert.ok(slow.size >= 3, 'rested')
  assert.ok(heading.size >= 5, 'swam every way')
})

test('the same numbers give the same fish, other numbers other fish', () => {
  const run = seed => {
    const fish = createFish(water, 5, seeded(seed))
    for (let i = 0; i < 2000; i++) fish.tick(0.05)
    return JSON.stringify(fish.snapshot())
  }

  assert.equal(run(7), run(7))
  assert.notEqual(run(7), run(8))
})

test('no water means no fish, and nothing breaks', () => {
  const none = createFish(['###', '###'], 5, seeded(1))
  none.tick(0.1)

  assert.deepEqual(none.snapshot(), [])
})
