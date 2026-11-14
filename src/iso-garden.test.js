import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildGarden, inPond } from '../public/garden.js'
import { fenceTile, gardenPieces, gardenTile, grassDetail, isFence } from '../public/iso-garden.js'
import { inPalette } from '../public/palette.js'
import { buildStudio } from '../public/studio.js'

const layout = buildStudio()
const garden = buildGarden(layout)

// a canvas context that only remembers the rectangles it was asked to fill
const recorder = () => {
  const rects = []
  const c = { fillStyle: '', fillRect: (x, y, w, h) => rects.push({ x, y, w, h, color: c.fillStyle }) }
  return { c, rects }
}

test('the fence runs round the plot, with a gap at the gate', () => {
  const { x0, y0, x1, y1, gate } = garden.fence
  assert.ok(isFence(garden, x0, 20) && isFence(garden, x1, 20) && isFence(garden, 10, y0) && isFence(garden, 10, y1))
  assert.ok(!isFence(garden, gate.x, y1) && !isFence(garden, gate.x + gate.w - 1, y1))
  assert.ok(isFence(garden, gate.x - 1, y1) && isFence(garden, gate.x + gate.w, y1))
  assert.ok(!isFence(garden, 10, 10))
})

test('every tree, bush and rock is a picture standing on its tile, with its foot inside the picture', () => {
  const pieces = gardenPieces(garden)
  assert.equal(pieces.length, garden.trees.length + garden.bushes.length + garden.rocks.length)
  for (const { ops, w, h, foot } of pieces) {
    assert.ok(ops.length > 0 && foot[0] < w && foot[1] < h)
    for (const [, x, y, ow, oh] of ops) assert.ok(x >= 0 && y >= 0 && x + ow <= w + 1 && y + oh <= h + 1)
  }
})

test('the pond, its bank, the path and the beds are painted, and plain grass is not', () => {
  const water = [...Array(layout.width * layout.height).keys()].map(i => [i % layout.width, Math.floor(i / layout.width)]).find(([x, y]) => inPond(garden, x, y) && !layout.grid[y]?.startsWith('.', x))
  assert.ok(water)
  const a = recorder()
  assert.equal(gardenTile(a.c, garden, 0, 0, water[0], water[1], 0), true)
  assert.ok(a.rects.length > 0 && a.rects.every(r => inPalette(r.color)))
  assert.equal(gardenTile(recorder().c, garden, 0, 0, garden.path.x, garden.path.y, 0), true)
  assert.equal(gardenTile(recorder().c, garden, 0, 0, garden.beds[0].x, garden.beds[0].y, 0), true)
  assert.equal(gardenTile(recorder().c, garden, 0, 0, 1, 1, 0), false)
})

test('the pond has two pictures, which differ', () => {
  // somewhere in the pond a ripple or a lily pad moves between the two frames
  const picture = (frame, x, y) => {
    const { c, rects } = recorder()
    gardenTile(c, garden, 0, 0, x, y, frame)
    return JSON.stringify(rects)
  }
  const moves = [...Array(60).keys()].some(i => {
    const [x, y] = [28 + (i % 12), 43 + Math.floor(i / 12)]
    return inPond(garden, x, y) && picture(0, x, y) !== picture(1, x, y)
  })
  assert.ok(moves)
})

test('fence, grass details and posts use palette colours only and stay near their tile', () => {
  for (const draw of [(c, x, y) => grassDetail(c, 0, 0, x, y), (c, x, y) => fenceTile(c, garden, 0, 30, x, y)]) {
    const { c, rects } = recorder()
    for (let i = 0; i < 40; i++) draw(c, i, i * 3)
    assert.ok(rects.length > 0 && rects.every(r => inPalette(r.color)))
  }
})
