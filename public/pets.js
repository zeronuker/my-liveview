// The garden's pets: a cat, a dog and some chickens that wander on their own over the grass. They are not
// workers, and nothing in the Office waits on them. Each rests (a chicken pecks at the ground) for a few
// seconds, then walks to a place over cells of the roam grid, and rests again. Most of the time a pet sets off
// for anywhere in its part of the garden (a cat or a dog more often than a chicken), by a route of its own each
// time; the rest of the time it takes a short stroll to a place near by.
// Plain data in, plain data out: `random` is a function giving a number from 0 up to 1, so a test can fix it.
import { findPath } from './walk.js'

const SPEED = { cat: 1.5, dog: 2.2, chicken: 1.1 } // tiles a second
const RANGE = 6 // the furthest a pet sets off to, in tiles each way
const MOST_STEPS = 10 // and the longest stroll, round trees and ponds
const TREK = { cat: 0.7, dog: 0.75, chicken: 0.35 } // how often a pet sets off for anywhere in its part of the garden
const APART = 0.9 // pets keep this many tiles from each other (a pet that has stopped is given way to by the others)
const FAR = 6 // a trek is to a place at least this many tiles away

export const createPets = (grid, starts, random = Math.random) => {
  const rest = pet => {
    pet.state = pet.kind === 'chicken' && random() < 0.6 ? 'peck' : 'rest'
    pet.wait = 1.5 + random() * 4
  }
  // every cell a pet can get to from where it starts (the garden is cut up by the building and the pond)
  const regionOf = start => {
    const seen = new Set([`${start.x},${start.y}`])
    const cells = [[start.x, start.y]]
    for (let head = 0; head < cells.length; head++)
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const [x, y] = [cells[head][0] + dx, cells[head][1] + dy]
        if (grid[y]?.[x] !== '.' || seen.has(`${x},${y}`)) continue
        seen.add(`${x},${y}`)
        cells.push([x, y])
      }
    return cells
  }
  const list = starts.map((start, i) => {
    const pet = { id: `${start.kind}${i}`, kind: start.kind, x: start.x, y: start.y, facing: 1, state: 'rest', wait: 0, held: 0, path: [], region: regionOf(start) }
    rest(pet)
    pet.wait *= random() // so they do not all set off together
    return pet
  })

  // somewhere new to go: mostly anywhere in the pet's part of the garden, far from here, by a route that differs each time
  const chooseTrek = pet => {
    const from = [Math.round(pet.x), Math.round(pet.y)]
    for (let tries = 0; tries < 6; tries++) {
      const to = pet.region[Math.floor(random() * pet.region.length)]
      if (Math.abs(to[0] - from[0]) + Math.abs(to[1] - from[1]) < FAR) continue
      const path = findPath(grid, from, to, undefined, { seed: Math.floor(random() * 2 ** 31) })
      if (path && path.length > 0) return path
    }
    return []
  }

  // or a few tries at a cell near by that can be reached without a long way round
  const chooseWalk = pet => {
    if (random() < TREK[pet.kind]) {
      const trek = chooseTrek(pet)
      if (trek.length > 0) return trek
    }
    for (let tries = 0; tries < 8; tries++) {
      const to = [Math.round(pet.x) + Math.floor(random() * (2 * RANGE + 1)) - RANGE, Math.round(pet.y) + Math.floor(random() * (2 * RANGE + 1)) - RANGE]
      const path = findPath(grid, [Math.round(pet.x), Math.round(pet.y)], to)
      if (path && path.length > 0 && path.length <= MOST_STEPS) return path
    }
    return []
  }

  // who is in the way of a pet going to (x, y): one who has stopped or been held up, one going the same way ahead of it (it
  // waits and follows), or, head on, the one that ranks first
  const blocker = (pet, x, y) =>
    list.find(o => {
      if (o === pet || Math.hypot(o.x - x, o.y - y) >= APART || Math.hypot(o.x - pet.x, o.y - pet.y) < Math.hypot(o.x - x, o.y - y)) return false
      if (o.path.length === 0 || o.held > 0) return true
      const same = (o.path[0][0] - o.x) * (x - pet.x) + (o.path[0][1] - o.y) * (y - pet.y) >= 0
      return same || list.indexOf(o) < list.indexOf(pet)
    })

  const step = (pet, dt) => {
    if (pet.path.length === 0) {
      pet.wait -= dt
      if (pet.wait > 0) return
      pet.path = chooseWalk(pet).filter((_, i, path) => i < path.length - 1 || !blocker(pet, ...path[i])) // not to a place someone is standing
      if (pet.path.length === 0) return rest(pet)
      pet.state = 'walk'
      pet.held = 0
    }
    const [tx, ty] = pet.path[0]
    const [dx, dy] = [tx - pet.x, ty - pet.y]
    const distance = Math.hypot(dx, dy)
    const reach = SPEED[pet.kind] * dt
    if (blocker(pet, pet.x + (dx / distance) * Math.min(reach + 0.3, distance), pet.y + (dy / distance) * Math.min(reach + 0.3, distance))) {
      // someone is just ahead: wait a moment, and give up the walk if they do not move
      pet.state = 'rest'
      if ((pet.held += dt) > 1.5) {
        pet.path = []
        rest(pet)
      }
      return
    }
    pet.state = 'walk'
    pet.held = 0
    if (dx !== 0) pet.facing = dx > 0 ? 1 : -1
    if (reach >= distance) {
      ;[pet.x, pet.y] = [tx, ty]
      pet.path.shift()
      if (pet.path.length === 0) rest(pet)
    } else {
      pet.x += (dx / distance) * reach
      pet.y += (dy / distance) * reach
    }
  }

  return {
    tick: dt => list.forEach(pet => step(pet, dt)),
    snapshot: () => list.map(({ id, kind, x, y, facing, state }) => ({ id, kind, x, y, facing, state })),
    region: id => list.find(pet => pet.id === id)?.region ?? [],
  }
}
