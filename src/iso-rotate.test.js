import assert from 'node:assert/strict'
import { test } from 'node:test'

import { rotateGarden, rotateLayout, turnCell, turnDir, turnPoint, turnRect, turnVector } from '../public/iso-rotate.js'
import { buildStudio, levelAt } from '../public/studio.js'

const layout = buildStudio()
const { width: W, height: H } = layout

test('four quarter turns bring a place, a direction and a vector back', () => {
  for (const [x, y] of [[0, 0], [3, 7], [W - 1, H - 1], [12.5, 40]]) {
    let [px, py] = [x, y]
    let [w, h] = [W, H]
    for (let turn = 0; turn < 4; turn++) {
      ;[px, py] = turnPoint(1, w, h, px, py)
      ;[w, h] = [h, w]
    }
    assert.deepEqual([px, py], [x, y])
  }
  for (const dir of ['right', 'down', 'left', 'up']) assert.equal(turnDir(4 % 4, dir), dir)
  assert.deepEqual(['right', 'down', 'left', 'up'].map(dir => turnDir(1, dir)), ['down', 'left', 'up', 'right'])
  assert.deepEqual(turnVector(1, 1, 0), [0, 1]) // east is south after a quarter turn
  assert.equal(turnDir(2, 'up'), 'down')
  assert.equal(turnDir(3, 'right'), 'up')
  assert.equal(turnDir(1, 'nonsense'), 'nonsense')
})

test('a tile of the plan goes to the tile the turn says, in the turned plan', () => {
  assert.deepEqual(turnCell(1, W, H, 0, 0), [H - 1, 0]) // the top left tile goes to the top right
  assert.deepEqual(turnCell(2, W, H, 0, 0), [W - 1, H - 1])
  assert.deepEqual(turnCell(3, W, H, 0, 0), [0, W - 1])
  assert.deepEqual(turnRect(1, W, H, { x: 2, y: 3, w: 4, h: 5 }), { x: H - 3 - 5, y: 2, w: 5, h: 4 })
})

test('a turned plan keeps every room, door, window and piece of furniture, the same tiles under their new names', () => {
  for (const k of [1, 2, 3]) {
    const turned = rotateLayout(layout, k)
    assert.equal(turned.rotation, k)
    assert.equal(turned.original, layout)
    assert.deepEqual([turned.width, turned.height], k % 2 ? [H, W] : [W, H])
    for (const key of ['rooms', 'doors', 'windows', 'furniture', 'rugs', 'lights']) assert.equal(turned[key].length, layout[key].length, `${k} ${key}`)
    let tiles = 0
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const [tx, ty] = turned.toOriginal(...turnCell(k, W, H, x, y).map(Math.round)) // there and back
        assert.deepEqual([tx, ty], [x, y])
        assert.equal(levelAt(turned, ...turnCell(k, W, H, x, y).map(Math.round)), levelAt(layout, x, y), `${k}: ${x},${y}`)
        tiles++
      }
    assert.equal(tiles, W * H)
  }
  assert.equal(rotateLayout(layout, 0), layout) // no turn: the plan itself
})

test('furniture faces, stairs and desks turn with the plan', () => {
  const turned = rotateLayout(layout, 1)
  const sofa = layout.furniture.findIndex(f => f.kind === 'sofa' && f.face === 'up')
  assert.equal(turned.furniture[sofa].face, 'right')
  assert.deepEqual([turned.furniture[sofa].w, turned.furniture[sofa].h], [layout.furniture[sofa].h, layout.furniture[sofa].w])
  const stairs = layout.rooms.findIndex(room => room.name === 'CEO stairs')
  assert.equal(layout.rooms[stairs].high, 'north')
  assert.equal(turned.rooms[stairs].high, 'east')
  const desk = layout.spots.desks[0]
  assert.deepEqual(turned.spots.desks[0].desk, { x: turned.toOriginal === undefined ? 0 : turnCell(1, W, H, desk.desk.x, desk.desk.y).map(Math.round)[0], y: turnCell(1, W, H, desk.desk.x, desk.desk.y).map(Math.round)[1] })
})

test('the garden turns: the pond, the fence with its gap and posts, and the trees remember where they were', () => {
  const garden = {
    pond: { cx: 36, cy: 47, rx: 9.5, ry: 6 },
    path: { x: 24, y: 49, w: 2, h: 6 },
    beds: [{ x: 7, y: 41, w: 3, h: 1 }],
    trees: [{ kind: 'round', x: 4, y: 7 }],
    bushes: [],
    rocks: [],
    fence: { rect: { x: 0, y: 0, w: W, h: H }, gap: { x: 24, y: H - 1, w: 2, h: 1 }, pillars: [{ x: 23, y: H - 1 }, { x: 26, y: H - 1 }] },
  }
  const turned = rotateGarden(garden, 1, W, H)
  assert.deepEqual([turned.pond.rx, turned.pond.ry], [6, 9.5])
  assert.deepEqual([turned.fence.rect.w, turned.fence.rect.h], [H, W])
  assert.deepEqual([turned.fence.gap.w, turned.fence.gap.h], [1, 2]) // a gap along the side now
  assert.equal(turned.fence.gap.x, 0) // on the west edge: the south edge went to the west
  assert.deepEqual([turned.trees[0].ox, turned.trees[0].oy], [4, 7])
  assert.deepEqual([turned.trees[0].x, turned.trees[0].y], turnCell(1, W, H, 4, 7).map(Math.round))
  assert.equal(rotateGarden(garden, 0, W, H).trees[0].x, 4)
})

test('the world of a turned plan has the same floors, walls, heights, steps and furniture, tile for tile', async () => {
  const { makeWorld } = await import('../public/iso-art.js')
  const flat = makeWorld(layout)
  for (const k of [1, 2, 3]) {
    const turned = makeWorld(rotateLayout(layout, k))
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const [tx, ty] = turnCell(k, W, H, x, y).map(Math.round)
        const at = `${k}: ${x},${y}`
        assert.equal(turned.isFloor(tx, ty), flat.isFloor(x, y), `${at} floor`)
        assert.equal(turned.isWall(tx, ty), flat.isWall(x, y), `${at} wall`)
        assert.equal(turned.baseZ(tx, ty), flat.baseZ(x, y), `${at} height`)
        assert.equal(turned.sharedTop(tx, ty), flat.sharedTop(x, y), `${at} podium wall`)
        assert.equal(turned.stairsAt(tx, ty)?.z ?? null, flat.stairsAt(x, y)?.z ?? null, `${at} step`)
        assert.equal(turned.furnAt(tx, ty)?.kind ?? null, flat.furnAt(x, y)?.kind ?? null, `${at} furniture`)
        assert.equal(Boolean(turned.doorAt(tx, ty)), Boolean(flat.doorAt(x, y)), `${at} door`)
      }
  }
})
