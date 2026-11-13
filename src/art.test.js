import assert from 'node:assert/strict'
import { test } from 'node:test'

import { commonArts, decalOps } from '../public/art/common.js'
import { lobbyArts } from '../public/art/lobby.js'
import { deskOnOps, officeArts } from '../public/art/office.js'
import { inPalette } from '../public/palette.js'
import { ellipseOps, glowOps, gridOps, ringOps } from '../public/pixel.js'
import { itemsOf } from '../public/scenery.js'
import { buildStudio } from '../public/studio.js'

const layout = buildStudio()
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

test('gridOps makes a rectangle of each run of a letter, skips the dots and names a missing colour', () => {
  const ops = gridOps(['..aab', 'cc...'], { a: '#111111', b: '#222222', c: '#333333' }, 10, 20)

  assert.deepEqual(ops, [['r', 12, 20, 2, 1, '#111111'], ['r', 14, 20, 1, 1, '#222222'], ['r', 10, 21, 2, 1, '#333333']])
  assert.throws(() => gridOps(['x'], {}), /no colour for 'x'/)
})

test('an ellipse stays inside its own box, is wider in the middle, and a ring has as many dots as asked', () => {
  const rows = ellipseOps(16, 16, 12, 8, '#000000')
  assert.ok(rows.every(([, x, y, w]) => x >= 4 && x + w <= 28 && y >= 8 && y < 24))
  const widths = rows.map(([, , , w]) => w)
  assert.ok(widths[Math.floor(widths.length / 2)] >= widths[0] * 2) // wider in the middle than at the top
  assert.equal(ringOps(0, 0, 5, 5, 12, '#000000').length, 12)
})

test('a pool of light is a dither: thicker inside, sparser towards the edge, and nothing outside', () => {
  const ops = glowOps(20, 20, 10, 6, '#ffffff')

  assert.ok(ops.length > 20)
  assert.ok(ops.every(([, x, y, w, h]) => w === 1 && h === 1 && Math.hypot((x + 0.5 - 20) / 10, (y + 0.5 - 20) / 6) < 1))
  assert.ok(ops.some(([, x, y]) => Math.hypot((x + 0.5 - 20) / 10, (y + 0.5 - 20) / 6) < 0.5)) // the thick part
  assert.ok(ops.some(([, x, y]) => Math.hypot((x + 0.5 - 20) / 10, (y + 0.5 - 20) / 6) >= 0.5)) // the sparse edge
})

test('every piece of furniture drawn by the lobby and common art fits its size and uses only the palette', () => {
  const kinds = new Set([...Object.keys(commonArts), ...Object.keys(lobbyArts), ...Object.keys(officeArts)])
  const items = itemsOf(layout).filter(item => kinds.has(item.kind))
  assert.ok(items.length >= 12)
  for (const item of items) checkOps(item.ops, item.w * TILE, item.h * TILE, `${item.kind} at ${item.x},${item.y}`)
})

test('a sofa or armchair is drawn for each way it can face, at each length, inside its cells', () => {
  for (const kind of ['sofa', 'armchair'])
    for (const face of ['up', 'down', 'left', 'right'])
      for (const length of [1, 3, 4]) {
        const [w, h] = face === 'up' || face === 'down' ? [length, 1] : [1, length]
        checkOps(commonArts[kind].ops({ w, h, face }), w * TILE, h * TILE, `${kind} facing ${face}, ${length} long`)
      }
})

test('a sofa facing one way does not look like the same sofa facing another', () => {
  const looks = ['up', 'down', 'left', 'right'].map(face => JSON.stringify(commonArts.sofa.ops({ w: 1, h: 4, face })))
  assert.equal(new Set(looks).size, 4)
})

test('a desk is drawn for each way someone can sit at it, and one in use shows a lit screen that fits the desk', () => {
  const sizes = { up: [2, 1], down: [2, 1], left: [1, 2], right: [1, 2] }
  const looks = new Set()
  for (const [face, [w, h]] of Object.entries(sizes)) {
    const desk = { kind: 'desk', x: 3, y: 4, w, h, face }
    checkOps(officeArts.desk.ops(desk), w * TILE, h * TILE, `desk for ${face}`)
    checkOps(deskOnOps(desk), w * TILE, h * TILE, `lit screen for ${face}`)
    looks.add(JSON.stringify(officeArts.desk.ops(desk)))
    assert.notDeepEqual(deskOnOps(desk), [])
  }
  assert.equal(looks.size, 4)
  checkOps(officeArts.desk.ops({ kind: 'desk', x: 0, y: 0, w: 6, h: 1, face: 'down' }), 6 * TILE, TILE, 'a long desk') // the CEO's
  checkOps(officeArts.tray.ops(), TILE, TILE, 'tray')
})

test('an office chair is drawn for each way it can face', () => {
  const looks = ['up', 'down', 'left', 'right'].map(face => {
    const ops = commonArts.chair.ops({ w: 1, h: 1, face })
    checkOps(ops, TILE, TILE, `chair facing ${face}`)
    return JSON.stringify(ops)
  })
  assert.equal(new Set(looks).size, 4)
  assert.ok(commonArts.chair.under)
})

test('the things on the floor (rugs, mats and light) fit the plan and use only the palette, the same every time', () => {
  const ops = decalOps(layout)
  checkOps(ops, layout.width * TILE, layout.height * TILE, 'decals')
  assert.deepEqual(ops, decalOps(buildStudio()))
})

test('sofas, armchairs, rugs and mats are under the people; counters, tables and plants are not', () => {
  assert.ok(commonArts.sofa.under && commonArts.armchair.under)
  assert.ok(!commonArts.plant.under && !lobbyArts.reception.under && !lobbyArts.coffeetable.under)
})
