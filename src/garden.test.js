import assert from 'node:assert/strict'
import { test } from 'node:test'

import { flowerOps, gardenHighOps, gardenLowOps, gardenParts, pondOps } from '../public/art/garden.js'
import { PET_STATES, petSprite } from '../public/art/pets.js'
import { buildGarden, inPond, nearBuilding as near, roamGrid, treeCells, treeSize } from '../public/garden.js'
import { inPalette } from '../public/palette.js'
import { createPets } from '../public/pets.js'
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

const nearBuilding = (x, y) => near(layout, x, y)

// a number generator that gives the same numbers every time, so a walk can be repeated
const seeded = seed => () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
  return seed / 2 ** 32
}

const boxOf = tree => treeCells(tree)

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

test('every pet starts on free grass, there is plenty of grass, and trees, water and the building are in the way', () => {
  const grid = roamGrid(layout, garden)
  assert.equal(grid.length, layout.height)
  for (const row of grid) assert.equal(row.length, layout.width)
  assert.deepEqual(garden.pets.map(p => p.kind).sort(), ['cat', 'chicken', 'chicken', 'chicken', 'dog'])
  for (const pet of garden.pets) {
    assert.equal(grid[pet.y][pet.x], '.', `${pet.kind} at ${pet.x},${pet.y} is not on free grass`)
  }
  assert.ok(grid.join('').split('.').length > 400, 'there is grass to wander on')
  for (const tree of garden.trees) for (const [x, y] of treeCells(tree)) assert.equal(grid[y][x], '#', `a tree at ${x},${y}`)
  assert.ok(garden.trees.some(tree => treeSize(tree) === 5) && garden.trees.some(tree => treeSize(tree) === 3), 'big trees and small ones')
  for (const [x, y] of [[27, 47], [36, 50], [30, 10]]) assert.equal(grid[y][x], '#', `water or building at ${x},${y}`)
})

test('pets wander over free grass only, rest between walks, face the way they go, and do the same again with the same numbers', () => {
  const grid = roamGrid(layout, garden)
  const run = seed => {
    const pets = createPets(grid, garden.pets, seeded(seed))
    const seen = { states: new Set(), moved: new Set(), faces: new Set() }
    for (let i = 0; i < 4000; i++) {
      pets.tick(0.05)
      for (const pet of pets.snapshot()) {
        assert.equal(grid[Math.round(pet.y)][Math.round(pet.x)], '.', `${pet.id} at ${pet.x.toFixed(2)},${pet.y.toFixed(2)} is on something`)
        seen.states.add(`${pet.kind}:${pet.state}`)
        seen.faces.add(pet.facing)
        if (pet.x !== garden.pets[Number(pet.id.replace(/\D/g, ''))].x) seen.moved.add(pet.id)
      }
    }
    return { seen, end: pets.snapshot() }
  }
  const a = run(1)
  assert.deepEqual(run(1).end, a.end)
  assert.notDeepEqual(run(2).end, a.end)
  assert.equal(a.seen.moved.size, 5, 'every pet walks somewhere in the end')
  assert.deepEqual([...a.seen.faces].sort(), [-1, 1])
  for (const state of ['cat:walk', 'cat:rest', 'dog:walk', 'dog:rest', 'chicken:walk', 'chicken:rest', 'chicken:peck']) assert.ok(a.seen.states.has(state), state)
})

test('each pet has a picture for each of its states, whole, in palette colours, and a walk has two frames that differ', () => {
  assert.deepEqual(PET_STATES, { cat: ['walk', 'rest'], dog: ['walk', 'rest'], chicken: ['walk', 'rest', 'peck'] })
  for (const [kind, states] of Object.entries(PET_STATES))
    for (const state of states) {
      const frames = new Set()
      for (const t of [0, 0.2, 0.4]) {
        const sprite = petSprite(kind, state, t)
        assert.equal(sprite.cells.length, sprite.height)
        for (const row of sprite.cells) {
          assert.equal(row.length, sprite.width)
          for (const color of row) assert.ok(color === null || inPalette(color), `${kind} ${state}: ${color}`)
        }
        assert.ok(sprite.cells.flat().filter(Boolean).length > 20, `${kind} ${state} has something to see`)
        frames.add(sprite.key)
      }
      assert.equal(frames.size, state === 'walk' ? 2 : 1, `${kind} ${state}`)
    }
  assert.notDeepEqual(petSprite('cat', 'rest').cells, petSprite('dog', 'rest').cells.map(row => row.slice(0, 12)).slice(0, 9))
})

test('the front path, the boardwalk and the terrace are walkable, so the lawn and the terrace are one part of the garden; the east strip is another, with pets of its own', () => {
  const grid = roamGrid(layout, garden)
  const regions = createPets(grid, garden.pets)
  const cat = regions.region('cat0')
  const dog = regions.region('dog1')
  const has = (region, x, y) => region.some(([cx, cy]) => cx === x && cy === y)

  for (const [x, y] of [[24, 46], [28, 45], [33, 43]]) assert.equal(grid[y][x], '.', `${x},${y} is walkable`)
  for (const [x, y] of [[34, 44], [38, 44]]) assert.equal(grid[y][x], '#', `a table at ${x},${y}`)
  assert.ok(has(cat, 24, 46) && has(cat, 28, 45) && has(cat, 33, 43), 'the cat can get to the path, the boardwalk and the terrace')
  assert.ok(has(cat, 5, 2), 'and the north-west garden')
  assert.equal(has(cat, 49, 20), false) // the building and the pond keep the east strip apart
  assert.equal(has(dog, 49, 20), true)
  assert.equal(has(dog, 24, 46), false)
  // the pets are shared out: the east strip has the dog and a chicken, the lawn the cat and two chickens
  const east = garden.pets.filter(p => has(dog, p.x, p.y)).map(p => p.kind).sort()
  const west = garden.pets.filter(p => has(cat, p.x, p.y)).map(p => p.kind).sort()
  assert.deepEqual(east, ['chicken', 'dog'])
  assert.deepEqual(west, ['cat', 'chicken', 'chicken'])
})

test('over ten minutes a pet goes over most of its part of the garden, end to end, not round one spot', () => {
  const grid = roamGrid(layout, garden)
  const pets = createPets(grid, garden.pets, seeded(5))
  const visited = new Map(pets.snapshot().map(pet => [pet.id, new Set()]))
  for (let i = 0; i < 6000; i++) {
    pets.tick(0.1)
    for (const pet of pets.snapshot()) visited.get(pet.id).add(`${Math.round(pet.x)},${Math.round(pet.y)}`)
  }

  for (const pet of pets.snapshot()) {
    const region = pets.region(pet.id)
    const cells = [...visited.get(pet.id)].map(key => key.split(',').map(Number))
    const span = pick => Math.max(...cells.map(pick)) - Math.min(...cells.map(pick))
    const full = pick => Math.max(...region.map(pick)) - Math.min(...region.map(pick))
    const reach = pet.kind === 'chicken' ? 0.5 : 0.7 // a chicken is slow and sets off for far places less often
    assert.ok(cells.length > region.length * 0.35, `${pet.id} went over ${cells.length} of ${region.length} cells`)
    assert.ok(span(c => c[0]) >= full(c => c[0]) * reach && span(c => c[1]) >= full(c => c[1]) * reach, `${pet.id} stayed in one part`)
  }
})

test('pets never overlap: for ten minutes no two are closer than 0.7 of a tile, and they still get about', () => {
  const grid = roamGrid(layout, garden)
  for (const seed of [5, 33, 77]) {
    const pets = createPets(grid, garden.pets, seeded(seed))
    let walked = 0
    for (let i = 0; i < 6000; i++) {
      pets.tick(0.1)
      const all = pets.snapshot()
      walked += all.filter(p => p.state === 'walk').length
      for (let a = 0; a < all.length; a++)
        for (let b = a + 1; b < all.length; b++) assert.ok(Math.hypot(all[a].x - all[b].x, all[a].y - all[b].y) >= 0.7, `${all[a].id} and ${all[b].id} overlap at ${i / 10}s (seed ${seed})`)
    }
    assert.ok(walked > 6000, 'they walk')
  }
})
