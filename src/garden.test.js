import assert from 'node:assert/strict'
import { test } from 'node:test'

import { flowerOps, gardenHighOps, gardenLowOps, gardenParts, pondOps } from '../public/art/garden.js'
import { buildGarden, inPond } from '../public/garden.js'
import { inPalette } from '../public/palette.js'
import { buildStudio } from '../public/studio.js'

const layout = buildStudio()
const garden = buildGarden(layout)
const TILE = 16

// every rectangle is whole pixels, has some size, lies inside w by h pixels, and is a colour of the palette
const checkOps = (ops, w, h, what) => {
  assert.ok(ops.length > 0, `${what} has something to draw`)
  for (const [kind, x, y, ow, oh, color] of ops) {
    assert.equal(kind, 'r', what)
    for (const n of [x, y, ow, oh]) assert.ok(Number.isInteger(n), `${what}: ${[x, y, ow, oh]}`)
    assert.ok(ow > 0 && oh > 0, `${what}: ${[x, y, ow, oh]} has no size`)
    assert.ok(x >= 0 && y >= 0 && x + ow <= w && y + oh <= h, `${what}: ${[x, y, ow, oh]} is outside ${w} by ${h}`)
    assert.ok(inPalette(color), `${what}: ${color} is not in the palette`)
  }
}

// a cell that is in a room, or in the wall one cell round a room
const nearBuilding = (x, y) => layout.rooms.some(room => x >= room.x - 1 && x <= room.x + room.w && y >= room.y - 1 && y <= room.y + room.h)

const boxOf = tree => {
  const cells = []
  for (let y = tree.y - 2; y <= tree.y; y++) for (let x = tree.x - 1; x <= tree.x + 1; x++) cells.push([x, y])
  return cells
}

test('the garden is the same every time, and the plan has room for it', () => {
  assert.deepEqual(buildGarden(buildStudio()), garden)
  assert.ok(layout.width >= 51 && layout.height >= 55)
})

test('the fence runs round the plot, with its gate where the front path goes on, down to the bottom edge', () => {
  const path = layout.rooms.find(room => room.name === 'Front path')
  assert.deepEqual(garden.fence, { x0: 0, y0: 0, x1: layout.width - 1, y1: layout.height - 1, gate: { x: path.x, w: path.w } })
  assert.deepEqual(garden.path, { x: path.x, y: path.y + path.h, w: path.w, h: layout.height - path.y - path.h })
  assert.equal(garden.path.y + garden.path.h, layout.height)
})

test('the pond is inside the fence and the boardwalk crosses it', () => {
  const { pond } = garden
  assert.ok(pond.cx - pond.rx > 1 && pond.cx + pond.rx < layout.width - 1 && pond.cy + pond.ry < layout.height - 1)
  const walk = layout.rooms.find(room => room.name === 'Boardwalk')
  const over = Array.from({ length: walk.w }, (_, i) => inPond(garden, walk.x + i, walk.y)).filter(Boolean).length
  assert.ok(over >= 4, `${over} cells of the boardwalk are over water`)
  const terrace = layout.rooms.find(room => room.name === 'Terrace')
  assert.ok(inPond(garden, terrace.x + 5, terrace.y + 4), 'the terrace floats over the pond')
})

test('trees, bushes, beds and rocks keep clear of the building, the paths, the pond and each other', () => {
  const taken = new Set()
  const claim = (cells, what) => {
    for (const [x, y] of cells) {
      assert.ok(x > 0 && x < layout.width - 1 && y > 0 && y < layout.height - 1, `${what} at ${x},${y} is outside the fence`)
      assert.ok(!nearBuilding(x, y), `${what} at ${x},${y} is on the building`)
      assert.ok(!(x >= garden.path.x && x < garden.path.x + garden.path.w && y >= garden.path.y), `${what} at ${x},${y} is on the path to the gate`)
      assert.ok(!taken.has(`${x},${y}`), `${what} at ${x},${y} is on something else`)
      taken.add(`${x},${y}`)
    }
  }
  for (const tree of garden.trees) {
    claim(boxOf(tree), `${tree.kind} tree`)
    for (const [x, y] of boxOf(tree)) assert.ok(!inPond(garden, x, y, 1.08), `${tree.kind} tree at ${x},${y} is in the pond`)
  }
  for (const bed of garden.beds)
    for (let y = bed.y; y < bed.y + bed.h; y++)
      for (let x = bed.x; x < bed.x + bed.w; x++) {
        claim([[x, y]], 'bed')
        assert.ok(!inPond(garden, x, y, 1.08), `bed at ${x},${y} is in the pond`)
      }
  for (const bush of garden.bushes) claim([[bush.x, bush.y]], 'bush')
  for (const rock of garden.rocks) claim([[rock.x, rock.y]], 'rock')
})

test('every piece of the garden fits its box and uses only the palette', () => {
  for (const [name, part] of Object.entries(gardenParts)) checkOps(part.ops, part.w, part.h, name)
  for (let h = 0; h < 5000; h += 97) checkOps(flowerOps(h), TILE, TILE, `a flower at ${h}`)
})

test('the pond has two frames that differ, both inside the plan, and the garden is drawn the same every time', () => {
  const [a, b] = [pondOps(garden, 0), pondOps(garden, 1)]
  assert.notDeepEqual(a, b)
  assert.equal(a.length > 100, true)
  for (const ops of [a, b, gardenLowOps(garden), gardenHighOps(garden)]) checkOps(ops, layout.width * TILE, layout.height * TILE, 'garden ops')
  assert.deepEqual(gardenHighOps(garden), gardenHighOps(buildGarden(buildStudio())))
})
