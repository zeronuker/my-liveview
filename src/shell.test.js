import assert from 'node:assert/strict'
import { test } from 'node:test'

import { doorOps, FLOOR_TONES, floorTileOps, shellOps, stairOps, thinWallOps, wallArtOps, wallOps, windowOps } from '../public/art/shell.js'
import { inPalette, RAMPS } from '../public/palette.js'
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

test('every kind of floor used by a room has art, and every tile of it fits and uses only the palette', () => {
  for (const room of layout.rooms) assert.ok(FLOOR_TONES.includes(room.tone), `${room.name} has the floor '${room.tone}'`)
  for (const tone of FLOOR_TONES) for (const [x, y] of [[0, 0], [3, 7], [20, 31]]) checkOps(floorTileOps(tone, x, y), TILE, TILE, `${tone} floor at ${x},${y}`)
})

test('neighbouring floor tiles are not all alike, and a tile is the same every time', () => {
  assert.deepEqual(floorTileOps('honey', 4, 5), floorTileOps('honey', 4, 5))
  assert.notDeepEqual(floorTileOps('honey', 4, 5), floorTileOps('honey', 5, 5))
  assert.notDeepEqual(floorTileOps('honey', 4, 5), floorTileOps('sage', 4, 5))
})

test('a plank floor has the same gaps at the top and bottom of every tile, so it runs on', () => {
  for (const [x, y] of [[0, 0], [9, 4]]) {
    const gaps = floorTileOps('honey', x, y).filter(([, , , w, h]) => w === TILE && h === 1).map(([, , oy]) => oy)
    assert.deepEqual(gaps, [3, 7, 11, 15])
  }
})

test('a wall with more wall to its south is all cap; one that ends there shows a plaster face with a skirting board', () => {
  const more = wallOps(5, 5, (x, y) => y >= 5 && y <= 8)
  assert.ok(more.every(([, , , , , color]) => !RAMPS.plaster.includes(color)))
  checkOps(more, TILE, TILE, 'cap')

  const ends = wallOps(5, 5, (x, y) => y <= 5)
  assert.ok(ends.some(([, , y, , , color]) => y === 6 && color === RAMPS.plaster[2]))
  assert.ok(ends.some(([, , y, , , color]) => y === 14 && RAMPS.wood.includes(color)))
  checkOps(ends, TILE, TILE, 'face')
})

test('each kind of door looks different, fits its opening and uses only the palette', () => {
  const along = (x, y) => y === 5 && (x < 5 || x > 8)
  const looks = ['swing', 'sliding', 'double', 'arch'].map(kind => {
    const door = { kind, x: 5, y: 5, w: kind === 'swing' ? 1 : 4, h: 1 }
    const ops = doorOps(door, along)
    checkOps(ops, door.w * TILE, TILE, `${kind} door`)
    return JSON.stringify(ops)
  })
  assert.equal(new Set(looks).size, 4)
  // in a wall that runs north to south a door is only a gap with a leaf beside it
  checkOps(doorOps({ kind: 'swing', x: 5, y: 5, w: 1, h: 1 }, (x, y) => x === 5 && y !== 5), TILE, TILE, 'door in a side wall')
})

test('a window, a tall window and a glass wall fit their cells and use only the palette', () => {
  checkOps(windowOps({ kind: 'window', x: 0, y: 0, w: 3, h: 1 }), 3 * TILE, TILE, 'window')
  checkOps(windowOps({ kind: 'window', x: 0, y: 0, w: 1, h: 4 }), TILE, 4 * TILE, 'tall window')
  checkOps(windowOps({ kind: 'glass', x: 0, y: 0, w: 9, h: 1 }), 9 * TILE, TILE, 'glass wall')
  checkOps(stairOps(), TILE, TILE, 'stairs')
})

test('a thin wall is six pixels of cap in the middle of its cell, with the rooms\' floors either side', () => {
  const ops = thinWallOps(5, 5, (x, y) => x === 5)
  checkOps(ops, TILE, TILE, 'thin wall')
  assert.ok(ops.some(([, x, , w, , color]) => x === 5 && w === 6 && color === RAMPS.wallcap[2]))
  assert.ok(ops.every(([, x, , w]) => x >= 5 && x + w <= 11))

  const inCell = (cx, cy) => shellOps(layout).filter(([, x, y]) => x >= cx * TILE && x < (cx + 1) * TILE && y >= cy * TILE && y < (cy + 1) * TILE)
  const capWidth = ops => Math.max(0, ...ops.filter(([, , , , , color]) => RAMPS.wallcap.includes(color)).map(([, , , w]) => w))
  assert.equal(capWidth(inCell(10, 12)), 6) // between the file room and the test lab
  assert.equal(capWidth(inCell(5, 25)), TILE) // the open office's west wall stays thick
  assert.equal(capWidth(inCell(15, 17)), TILE) // and so does a post of the wall with the back rooms' doors, between two doors
  assert.ok(inCell(10, 12).some(([, x, , , , color]) => x < 5 * TILE + 10 * TILE && RAMPS.stone.includes(color))) // the file room's floor carries on to the wall
})

test('the first floor and back rooms have thin vertical walls and thin door posts and windows; a whiteboard fits its cells', () => {
  checkOps(doorOps({ kind: 'swing', x: 5, y: 5, w: 1, h: 1 }, (x, y) => x === 5 && y !== 5, true), TILE, TILE, 'thin door')
  assert.ok(doorOps({ kind: 'swing', x: 5, y: 5, w: 1, h: 1 }, (x, y) => x === 5 && y !== 5, true).every(([, x, , w], i) => i >= 5 || (x >= 5 && x + w <= 11)))
  checkOps(windowOps({ kind: 'window', x: 0, y: 0, w: 1, h: 3 }, true), TILE, 3 * TILE, 'thin tall window')
  checkOps(wallArtOps({ kind: 'whiteboard', x: 0, y: 0, w: 2, h: 1 }), 2 * TILE, TILE, 'whiteboard')
  for (const w of [1, 2, 3]) checkOps(wallArtOps({ kind: 'picture', x: 0, y: 0, w, h: 1 }), w * TILE, TILE, `a picture ${w} wide`)
  assert.notDeepEqual(wallArtOps({ kind: 'picture', x: 0, y: 0, w: 2, h: 1 }), wallArtOps({ kind: 'whiteboard', x: 0, y: 0, w: 2, h: 1 }))
})

test('the whole shell of the plan is inside the plan, in whole pixels and palette colours, and is the same every time', () => {
  const ops = shellOps(layout)
  checkOps(ops, layout.width * TILE, layout.height * TILE, 'shell')
  assert.deepEqual(ops, shellOps(buildStudio()))
})
