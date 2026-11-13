import assert from 'node:assert/strict'
import { test } from 'node:test'

import { backroomArts } from '../public/art/backrooms.js'
import { ceoArts } from '../public/art/ceo.js'
import { commonArts, decalOps } from '../public/art/common.js'
import { lobbyArts } from '../public/art/lobby.js'
import { deskOnOps, officeArts } from '../public/art/office.js'
import { socialArts } from '../public/art/social.js'
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
  const kinds = new Set([...Object.keys(commonArts), ...Object.keys(lobbyArts), ...Object.keys(officeArts), ...Object.keys(socialArts), ...Object.keys(backroomArts), ...Object.keys(ceoArts)])
  const items = itemsOf(layout).filter(item => kinds.has(item.kind))
  assert.ok(items.length >= 12)
  for (const item of items) checkOps(item.ops, item.w * TILE, item.h * TILE + item.rise, `${item.kind} at ${item.x},${item.y}`)
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

test('every kind of furniture in the social wing is drawn, at every size it is used, inside its cells, with palette colours', () => {
  const sizes = {
    tv: [[1, 2]], pingpong: [[3, 2]], vending: [[1, 1]], cooler: [[1, 1]], bin: [[1, 1]], counter: [[2, 1]], sink: [[2, 1]], coffeebar: [[2, 1]],
    island: [[3, 1]], stool: [[1, 1]], fridge: [[1, 2]], cafetable: [[1, 1]], deckrail: [[10, 1], [1, 5], [1, 3], [1, 1]],
  }
  assert.deepEqual(Object.keys(socialArts).sort(), Object.keys(sizes).sort())
  for (const [kind, list] of Object.entries(sizes))
    for (const [w, h] of list) for (const x of [28, 29, 30]) checkOps(socialArts[kind].ops({ kind, x, y: 33, w, h }), w * TILE, h * TILE + (socialArts[kind].rise ?? 0), `${kind} ${w} by ${h}`)
})

test('every piece of furniture in the back rooms is drawn, at every size it is used, inside its cells, with palette colours', () => {
  const sizes = { shelf: [[1, 4], [1, 5], [1, 6]], machine: [[2, 2]], labbench: [[2, 1]], rack: [[1, 1]], cubicle: [[1, 2]], urinal: [[1, 1]], vanity: [[1, 4]], boardtable: [[3, 2], [5, 2]] }
  assert.deepEqual(Object.keys(backroomArts).sort(), Object.keys(sizes).sort())
  for (const [kind, list] of Object.entries(sizes))
    for (const [w, h] of list) for (const x of [11, 13, 16, 17]) checkOps(backroomArts[kind].ops({ kind, x, y: 11, w, h }), w * TILE, h * TILE + (backroomArts[kind].rise ?? 0), `${kind} ${w} by ${h} at ${x}`)
})

test('the CEO desk and the drinks cabinet are drawn inside their cells with palette colours, and the suite\'s furniture is in leather', () => {
  assert.deepEqual(Object.keys(ceoArts).sort(), ['cabinet', 'ceodesk'])
  checkOps(ceoArts.ceodesk.ops({ kind: 'ceodesk', x: 26, y: 4, w: 3, h: 1, face: 'down' }), 3 * TILE, TILE, 'the CEO desk')
  checkOps(ceoArts.cabinet.ops({ kind: 'cabinet', x: 22, y: 2, w: 2, h: 1 }), 2 * TILE, TILE, 'the drinks cabinet')
  const plain = commonArts.chair.ops({ w: 1, h: 1, face: 'down' })
  const leather = commonArts.chair.ops({ w: 1, h: 1, face: 'down', tone: 'leather' })
  assert.notDeepEqual(plain, leather)
  checkOps(leather, TILE, TILE, 'a leather chair')
  checkOps(commonArts.sofa.ops({ w: 4, h: 1, face: 'up', tone: 'leather' }), 4 * TILE, TILE, 'a leather sofa')
  assert.ok(itemsOf(layout).some(item => item.kind === 'sofa' && item.tone === 'leather'))
  assert.ok(itemsOf(layout).some(item => item.kind === 'ceodesk'))
})

test('shelves differ from place to place, and the two lab benches are not alike', () => {
  const look = (kind, x, y, w, h) => JSON.stringify(backroomArts[kind].ops({ kind, x, y, w, h }))
  assert.notEqual(look('shelf', 6, 11, 1, 5), look('shelf', 9, 11, 1, 6))
  assert.notEqual(look('labbench', 11, 11, 2, 1), look('labbench', 13, 11, 2, 1))
  const coloured = tone => JSON.stringify(backroomArts.cubicle.ops({ kind: 'cubicle', x: 22, y: 11, w: 1, h: 2, tone }))
  assert.notEqual(coloured('lilac'), coloured(undefined)) // the women's cubicles are of their own colour
  const rack = face => backroomArts.rack.ops({ kind: 'rack', x: 17, y: 14, w: 1, h: 2, face })
  assert.notDeepEqual(rack('up'), rack(undefined)) // the back row shows its back
  checkOps(rack('up'), TILE, TILE + backroomArts.rack.rise, 'the back of a rack')
})

test('the three vending machines are not all the same colour, and the stools are under the people', () => {
  assert.equal(new Set([28, 29, 30].map(x => JSON.stringify(socialArts.vending.ops({ x })))).size, 3)
  assert.ok(socialArts.stool.under && !socialArts.vending.under)
})

test('a rug can be another colour, and the plan\'s rugs use colours of the palette', () => {
  const rugs = [{ kind: 'rug', tone: 'periwinkle', x: 0, y: 0, w: 7, h: 6 }, { kind: 'rug', x: 0, y: 0, w: 7, h: 6 }]
  const [a, b] = rugs.map(rug => decalOps({ rugs: [rug], lights: [] }))
  assert.notDeepEqual(a, b)
  assert.ok(layout.rugs.some(rug => rug.tone === 'periwinkle'))
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

test('plants come in several kinds, sofas in several styles and colours, and rugs in several shapes and patterns, all inside their own size', () => {
  const plants = itemsOf(layout).filter(item => item.kind === 'plant')
  assert.ok(new Set(plants.map(p => JSON.stringify(p.ops))).size >= 4, 'at least four different plants in the plan')
  for (let x = 0; x < 12; x++) for (let y = 0; y < 3; y++) checkOps(commonArts.plant.ops({ x, y }), TILE, TILE, `plant at ${x},${y}`)

  const looks = new Set()
  for (const x of [1, 2, 3, 4, 5, 6])
    for (const length of [1, 3]) {
      const ops = commonArts.sofa.ops({ x, y: 7, w: length, h: 1, face: 'down' })
      checkOps(ops, length * TILE, TILE, `sofa style at ${x}, ${length} long`)
      looks.add(JSON.stringify(ops))
    }
  assert.ok(looks.size >= 6)
  assert.ok(new Set(layout.furniture.filter(f => f.kind === 'sofa' || f.kind === 'armchair').map(f => f.tone ?? 'default')).size >= 5, 'the sofas are in several colours')

  const rugs = new Set()
  for (const pattern of ['diamond', 'stripes', 'check', undefined])
    for (const [w, h] of [[7, 4], [5, 3], [6, 4]]) {
      const ops = decalOps({ rugs: [{ kind: 'rug', shape: 'rect', pattern, tone: 'sage', x: 0, y: 0, w, h }], lights: [] })
      checkOps(ops, w * TILE, h * TILE, `${pattern} rug`)
      rugs.add(JSON.stringify(ops))
    }
  const samePlace = ['diamond', 'stripes', 'check', undefined].map(pattern => JSON.stringify(decalOps({ rugs: [{ kind: 'rug', shape: 'rect', pattern, tone: 'sage', x: 0, y: 0, w: 7, h: 4 }], lights: [] })))
  assert.equal(new Set(samePlace).size, 4, 'the four patterns look different')
  assert.ok(rugs.size >= 9)
  assert.ok(new Set(layout.rugs.filter(r => r.kind === 'rug').map(r => r.shape ?? 'oval')).size >= 2, 'some round, some rectangular')
})
