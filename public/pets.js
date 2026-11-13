// The garden's pets: a cat, a dog and some chickens that wander on their own over the grass. They are not
// workers, and nothing in the Office waits on them. Each rests (a chicken pecks at the ground) for a few
// seconds, then walks to a place a few tiles away, over cells of the roam grid, and rests again.
// Plain data in, plain data out: `random` is a function giving a number from 0 up to 1, so a test can fix it.
import { findPath } from './walk.js'

const SPEED = { cat: 1.5, dog: 2.2, chicken: 1.1 } // tiles a second
const RANGE = 6 // the furthest a pet sets off to, in tiles each way
const MOST_STEPS = 10 // and the longest walk, round trees and ponds

export const createPets = (grid, starts, random = Math.random) => {
  const rest = pet => {
    pet.state = pet.kind === 'chicken' && random() < 0.6 ? 'peck' : 'rest'
    pet.wait = 1.5 + random() * 4
  }
  const list = starts.map((start, i) => {
    const pet = { id: `${start.kind}${i}`, kind: start.kind, x: start.x, y: start.y, facing: 1, state: 'rest', wait: 0, path: [] }
    rest(pet)
    pet.wait *= random() // so they do not all set off together
    return pet
  })

  // somewhere new to go: a few tries at a cell near by that can be reached without a long way round
  const chooseWalk = pet => {
    for (let tries = 0; tries < 8; tries++) {
      const to = [Math.round(pet.x) + Math.floor(random() * (2 * RANGE + 1)) - RANGE, Math.round(pet.y) + Math.floor(random() * (2 * RANGE + 1)) - RANGE]
      const path = findPath(grid, [Math.round(pet.x), Math.round(pet.y)], to)
      if (path && path.length > 0 && path.length <= MOST_STEPS) return path
    }
    return []
  }

  const step = (pet, dt) => {
    if (pet.path.length === 0) {
      pet.wait -= dt
      if (pet.wait > 0) return
      pet.path = chooseWalk(pet)
      if (pet.path.length === 0) return rest(pet)
      pet.state = 'walk'
    }
    const [tx, ty] = pet.path[0]
    const [dx, dy] = [tx - pet.x, ty - pet.y]
    const distance = Math.hypot(dx, dy)
    const reach = SPEED[pet.kind] * dt
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
  }
}
