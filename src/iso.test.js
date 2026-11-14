import assert from 'node:assert/strict'
import { test } from 'node:test'

import { fit } from '../public/layout.js'
import { ISO_RISE, isoExtent, screenAt } from '../public/iso.js'
import { buildStudio } from '../public/studio.js'

const layout = buildStudio()
const view = { tile: 16, left: 0, top: 0 }

test('a flat plan puts a place at its tile times the tile size', () => {
  assert.deepEqual(screenAt({ tile: 10, left: 5, top: 7 }, layout, 3, 4, false), { x: 35, y: 47 })
})

test('in the angled view going east moves right and down, going south moves left and down', () => {
  const here = screenAt(view, layout, 10, 10, true)
  assert.deepEqual(screenAt(view, layout, 11, 10, true), { x: here.x + 8, y: here.y + 4 })
  assert.deepEqual(screenAt(view, layout, 10, 11, true), { x: here.x - 8, y: here.y + 4 })
})

test('every corner of the plan is inside the extent, and the extremes touch its edges', () => {
  const box = isoExtent(layout)
  const corners = [[0, 0], [layout.width, 0], [0, layout.height], [layout.width, layout.height]].map(([x, y]) => screenAt(view, layout, x, y, true))
  assert.equal(Math.min(...corners.map(p => p.x)), 0)
  assert.equal(Math.max(...corners.map(p => p.x)), box.width * view.tile)
  assert.equal(Math.min(...corners.map(p => p.y)), ISO_RISE * view.tile)
  assert.ok(Math.max(...corners.map(p => p.y)) < box.height * view.tile)
})

test('the angled plan fits a canvas, with the same tile size for both ways', () => {
  const box = isoExtent(layout)
  const { tile, left, top } = fit(1600, 800, box, 0)
  assert.ok(tile * box.width <= 1600 + 1e-9 && tile * box.height <= 800 + 1e-9)
  assert.ok(left >= 0 && top >= 0)
})

test('every kind of furniture in the plan has a drawer in the angled view', async () => {
  const { PIECES } = await import('../public/iso-furniture.js')
  const drawnElsewhere = new Set(['chair', 'desk', 'plant', 'tray', 'pendant']) // iso-art.js, or not drawn
  const missing = [...new Set(layout.furniture.map(f => f.kind))].filter(kind => !PIECES[kind] && !drawnElsewhere.has(kind))
  assert.deepEqual(missing, [])
})

test('lights: racks, the test machine, vending machines and windows blink, and every light is in its tile', async () => {
  const { lightsOf, makeWorld } = await import('../public/iso-art.js')
  const { PATTERNS } = await import('../public/lights.js')
  const { inPalette } = await import('../public/palette.js')
  const world = makeWorld(layout)
  const lightsAt = kind => layout.furniture.filter(f => f.kind === kind).flatMap(f => lightsOf(world, f.x, f.y + f.h - 1)) // the front tile of each
  assert.equal(lightsAt('rack').length, 8 * layout.furniture.filter(f => f.kind === 'rack').length)
  assert.ok(lightsAt('machine').length > 0 && lightsAt('vending').length > 0 && lightsAt('coffeebar').length > 0)
  const window = layout.windows.find(w => w.kind === 'window')
  const glints = lightsOf(world, window.x, window.y)
  assert.ok(glints.length === 6 && glints.every(l => l.pattern === 'glint'))
  for (const l of [...lightsAt('rack'), ...lightsAt('vending'), ...glints]) {
    assert.ok(PATTERNS.includes(l.pattern) && inPalette(l.on) && inPalette(l.off))
    assert.ok(l.dx >= 0 && l.dx + l.w <= 16 && l.dy >= -24 && l.dy < 10)
  }
})

test('the plan has hanging lamps, and a pool of light lifts the floor under it', async () => {
  const { makeWorld } = await import('../public/iso-art.js')
  const world = makeWorld(layout)
  assert.ok(world.pendants.length > 0)
  const pool = layout.lights[0]
  assert.equal(world.poolAt(Math.floor(pool.x), Math.floor(pool.y)), 2)
  assert.equal(world.poolAt(0, 0), 0)
})

test('doors: each knows which way its wall runs and how tall it is, and a sliding door has one blinking sensor', async () => {
  const { doorOf, lightsOf, makeWorld } = await import('../public/iso-art.js')
  const world = makeWorld(layout)
  for (const door of layout.doors) {
    const found = doorOf(world, door.x, door.y)
    assert.equal(found.kind, door.kind)
    assert.ok(found.axis === 'x' || found.axis === 'y')
    assert.ok([3, 8, 16].includes(found.wall), `${door.kind} at ${door.x},${door.y}: wall ${found.wall}`)
  }
  assert.equal(doorOf(world, 7, 17).axis, 'x') // a door in a wall that runs east to west
  assert.equal(doorOf(world, 20, 8).axis, 'y') // and one in a wall that runs north to south
  assert.equal(doorOf(world, 0, 0), null)
  const sliding = layout.doors.find(d => d.kind === 'sliding' && d.w === 3)
  const sensors = [0, 1, 2].flatMap(i => lightsOf(world, sliding.x + i, sliding.y))
  assert.equal(sensors.length, 1)
  assert.equal(sensors[0].pattern, 'slow')
})

test('the CEO suite is a storey up, the ground floor is not, and the stairs climb smoothly between', async () => {
  const { STOREY, liftAt, risingStairs, stepHeight } = await import('../public/iso.js')
  const stairs = risingStairs(layout)
  assert.equal(stairs.name, 'CEO stairs')
  assert.equal(liftAt(layout, 27, 5), STOREY) // the CEO's office
  assert.equal(liftAt(layout, 38, 9), STOREY) // the foyer, at the top of the stairs
  assert.equal(liftAt(layout, 30, 20), 0) // the hub
  assert.equal(liftAt(layout, 10, 36), 0) // the lobby
  const column = Array.from({ length: stairs.h + 2 }, (_, i) => liftAt(layout, 38, stairs.y + stairs.h - i)) // from the bottom up
  for (let i = 1; i < column.length; i++) assert.ok(column[i] >= column[i - 1], `${column}`)
  assert.equal(liftAt(layout, 38, stairs.y), STOREY) // the top step
  assert.equal(stepHeight(stairs, stairs.y + stairs.h - 1), STOREY / stairs.h) // the bottom step: a sixth
  assert.equal(liftAt(layout, 38, 16), 0) // the foot of the stairs
  assert.ok(liftAt(layout, 38, 12.5) > liftAt(layout, 38, 14)) // half way up is higher than near the bottom
})
