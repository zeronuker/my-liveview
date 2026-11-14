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
    assert.ok(Number.isFinite(found.wall) && found.wall >= 3, `${door.kind} at ${door.x},${door.y}: wall ${found.wall}`)
  }
  assert.equal(doorOf(world, 7, 17).axis, 'x') // a door in a wall that runs east to west
  assert.equal(doorOf(world, 20, 8).axis, 'y') // and one in a wall that runs north to south
  assert.equal(doorOf(world, 0, 0), null)
  const sliding = layout.doors.find(d => d.kind === 'sliding' && d.w === 3)
  const sensors = [0, 1, 2].flatMap(i => lightsOf(world, sliding.x + i, sliding.y))
  assert.equal(sensors.length, 1)
  assert.equal(sensors[0].pattern, 'slow')
})

test('the CEO suite is a storey up, the mezzanine a third of that, the ground floor none, and the stairs climb smoothly between', async () => {
  const { MEZZANINE, STOREY, liftAt, stairsOf, stepHeight } = await import('../public/iso.js')
  const stairs = Object.fromEntries(stairsOf(layout).map(s => [s.room.name, s]))
  assert.deepEqual([stairs['CEO stairs'].zLow, stairs['CEO stairs'].zHigh], [0, STOREY])
  assert.deepEqual([stairs['Stairs A'].zLow, stairs['Stairs A'].zHigh], [0, MEZZANINE])
  assert.deepEqual([stairs['Stairs B'].zLow, stairs['Stairs B'].zHigh], [0, MEZZANINE])
  assert.equal(liftAt(layout, 27, 5), STOREY) // the CEO's office
  assert.equal(liftAt(layout, 38, 9), STOREY) // the foyer, at the top of the stairs
  assert.equal(liftAt(layout, 10, 26), MEZZANINE) // the open office
  assert.equal(liftAt(layout, 10, 36), MEZZANINE) // the lobby
  assert.equal(liftAt(layout, 20, 42), MEZZANINE) // the entrance
  assert.equal(liftAt(layout, 30, 24), 0) // the hub
  assert.equal(liftAt(layout, 12, 18), 0) // the main street, under the open office's north edge
  for (const stair of Object.values(stairs)) {
    const { room } = stair
    const x = room.x + 1
    const bottomUp = Array.from({ length: room.h + 2 }, (_, i) => liftAt(layout, x, (room.high === 'north' ? room.y + room.h : room.y - 1) + (room.high === 'north' ? -i : i)))
    for (let i = 1; i < bottomUp.length; i++) assert.ok(bottomUp[i] >= bottomUp[i - 1] - 1e-9, `${room.name}: ${bottomUp}`)
    assert.equal(bottomUp.at(-1), Math.max(stair.zLow, stair.zHigh)) // the top, level with the floor it reaches
  }
  assert.equal(stepHeight(stairs['CEO stairs'], 15), STOREY / 6) // the bottom step: a sixth
  assert.equal(liftAt(layout, 38, 16), 0) // the foot of the CEO stairs
  assert.ok(liftAt(layout, 38, 12.5) > liftAt(layout, 38, 14)) // half way up is higher than near the bottom
})

test('the steps down outside the entrance: the door is on the mezzanine, then half way, then the ground', async () => {
  const { MEZZANINE, entrancesOf, liftAt } = await import('../public/iso.js')
  const [door] = entrancesOf(layout)
  assert.equal(door.z, MEZZANINE)
  const column = [door.y - 1, door.y, door.y + 1, door.y + 2, door.y + 3].map(y => liftAt(layout, door.x, y))
  assert.deepEqual(column, [MEZZANINE, MEZZANINE, MEZZANINE / 2, 0, 0])
  assert.equal(liftAt(layout, door.x + door.w + 3, door.y + 2), 0) // the boardwalk beside the path is on the ground
})

test('a swing door is hinged on the side the flat view mirrors it to: the far end on an odd column', async () => {
  const { doorTile } = await import('../public/iso-doors.js')
  const { shade } = await import('../public/palette.js')
  const leafColumns = x => {
    const xs = []
    const c = { fillStyle: '', fillRect: px => c.fillStyle === shade('wood', 2) && xs.push(px) }
    doorTile(c, 0, 20, { kind: 'swing', x, i: 0, j: 0, w: 1, h: 1, axis: 'x', wall: 8 })
    return xs
  }
  assert.ok(leafColumns(12).length > 0 && leafColumns(12).every(px => px < 8)) // an even column: the leaf is at the near end
  assert.ok(leafColumns(7).length > 0 && leafColumns(7).every(px => px >= 8)) // an odd one: at the far end
})

test('a TV shows a picture that changes all together, and its two tiles stay in step', async () => {
  const { lightsOf, makeWorld } = await import('../public/iso-art.js')
  const { lightColor } = await import('../public/lights.js')
  const world = makeWorld(layout)
  const tv = layout.furniture.find(f => f.kind === 'tv')
  const tiles = [0, 1].map(j => lightsOf(world, tv.x, tv.y + j))
  assert.ok(tiles.every(lights => lights.length === 4 && lights.every(l => l.pattern === 'cycle')))
  for (const seconds of [0, 1, 2.5, 7, 13.25]) {
    const colors = new Set(tiles.flat().map(l => lightColor({ ...l, x: l.dx, y: l.dy }, seconds)))
    assert.equal(colors.size, 1, `at ${seconds}s: ${[...colors]}`)
  }
  const seen = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => lightColor({ ...tiles[0][0], x: 1, y: 1 }, i)))
  assert.ok(seen.size > 2) // and it does change
})
