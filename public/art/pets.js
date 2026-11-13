// The garden's pets as small pixel pictures: a cat, a dog and a chicken, each facing right (the Office
// flips them to face left), walking in two frames, resting, and the chicken pecking. Each picture is a list of
// rectangles [x, y, w, h, letter] in pixels; the letter says which colour of the animal's own set it is,
// all from the palette, light from the top left. A picture is { key, width, height, cells }, like a person's.
import { RAMPS } from '../palette.js'

const [terracotta, wood, plaster, leaf, brick, light, metal] = [RAMPS.terracotta, RAMPS.wood, RAMPS.plaster, RAMPS.leaf, RAMPS.brick, RAMPS.light, RAMPS.metal]
const COLORS = {
  cat: { o: terracotta[2], s: terracotta[1], l: terracotta[3], e: leaf[3], n: brick[2] },
  dog: { o: wood[2], s: wood[1], d: wood[0], l: wood[3], t: brick[2], k: metal[0] },
  chicken: { w: plaster[3], s: plaster[2], c: brick[2], b: light[2], f: light[1], k: metal[0] },
}
const r = (x, y, w, h, letter) => [x, y, w, h, letter]

// a cat, 12 by 9: striped, with its tail up
const catWalk = frame => [
  r(2, 3, 7, 4, 'o'), r(2, 6, 7, 1, 's'), r(4, 3, 1, 2, 's'), r(6, 3, 1, 2, 's'), // the body, its underside and stripes
  r(8, 2, 4, 4, 'o'), r(8, 1, 1, 1, 's'), r(11, 1, 1, 1, 's'), r(10, 3, 1, 1, 'e'), r(11, 4, 1, 1, 'n'), r(9, 5, 3, 1, 'l'), // the head: ears, an eye, a nose, a pale cheek
  r(1, 4, 1, 2, 'o'), r(0, 1, 1, 4, 'o'), r(0, 1, 1, 1, 's'), // the tail
  ...(frame ? [3, 5, 7, 8] : [2, 4, 6, 8]).map(x => r(x, 7, 1, 2, 'o')), // the legs
]
const catRest = () => [
  r(2, 4, 7, 4, 'o'), r(2, 7, 7, 1, 's'), r(4, 4, 1, 2, 's'), r(6, 4, 1, 2, 's'), // sat in a loaf
  r(8, 2, 4, 5, 'o'), r(8, 1, 1, 1, 's'), r(11, 1, 1, 1, 's'), r(10, 3, 1, 1, 'e'), r(11, 5, 1, 1, 'n'), r(9, 6, 3, 1, 'l'),
  r(8, 8, 4, 1, 's'), r(0, 6, 2, 1, 'o'), r(0, 5, 1, 1, 'o'), r(1, 7, 1, 1, 's'), // paws, and the tail curled round
]

// a dog, 14 by 10: brown with a pale patch and floppy ears
const dogWalk = frame => [
  r(3, 3, 8, 4, 'o'), r(3, 6, 8, 1, 's'), r(5, 3, 3, 2, 'l'), // the body, its underside and a patch
  r(10, 1, 4, 4, 'o'), r(10, 1, 2, 3, 'd'), r(12, 2, 1, 1, 'k'), r(13, 3, 1, 2, 'l'), r(13, 3, 1, 1, 'k'), r(13, 5, 1, 1, 't'), // the head: an ear, an eye, a snout, a nose, a tongue
  r(2, 2, 1, 2, 'o'), r(1, 1, 1, 2, 's'), // the tail
  ...(frame ? [4, 6, 7, 9] : [3, 5, 8, 10]).flatMap(x => [r(x, 7, 1, 3, 's'), r(x, 9, 1, 1, 'd')]), // the legs and paws
]
const dogRest = () => [
  r(5, 3, 5, 6, 'o'), r(8, 4, 2, 3, 'l'), r(3, 5, 3, 4, 's'), // sitting: the body, a pale chest, a haunch
  r(8, 0, 4, 4, 'o'), r(8, 0, 2, 3, 'd'), r(10, 1, 1, 1, 'k'), r(11, 2, 2, 2, 'l'), r(12, 2, 1, 1, 'k'), // the head
  r(8, 7, 1, 3, 's'), r(9, 7, 1, 3, 's'), r(8, 9, 2, 1, 'd'), r(1, 8, 3, 1, 'o'), r(0, 7, 1, 2, 's'), // front legs, paws and the tail
]

// a chicken, 8 by 8: white with a red comb
const chicken = (state, frame) => [
  r(1, 3, 5, 4, 'w'), r(1, 6, 5, 1, 's'), r(2, 4, 3, 2, 's'), r(0, 2, 1, 3, 's'), // the body, its underside, a wing and the tail
  ...(state === 'peck'
    ? [r(5, 4, 3, 2, 'w'), r(5, 3, 2, 1, 'c'), r(6, 4, 1, 1, 'k'), r(7, 5, 1, 1, 'b')] // the head down at the ground
    : [r(5, 1, 2, 3, 'w'), r(5, 0, 2, 1, 'c'), r(6, 2, 1, 1, 'k'), r(7, 2, 1, 1, 'b'), r(6, 4, 1, 1, 'c')]), // the head up: comb, eye, beak, wattle
  ...(frame ? [3, 5] : [2, 4]).map(x => r(x, 7, 1, 1, 'f')), // the legs
]

const SHAPES = {
  cat: { size: [12, 9], walk: [catWalk(0), catWalk(1)], rest: [catRest()] },
  dog: { size: [14, 10], walk: [dogWalk(0), dogWalk(1)], rest: [dogRest()] },
  chicken: { size: [8, 8], walk: [chicken('walk', 0), chicken('walk', 1)], rest: [chicken('rest', 0)], peck: [chicken('peck', 0)] },
}

export const PET_STATES = Object.fromEntries(Object.entries(SHAPES).map(([kind, shape]) => [kind, Object.keys(shape).filter(name => name !== 'size')]))

const cellsOf = (kind, rects) => {
  const [width, height] = SHAPES[kind].size
  const cells = Array.from({ length: height }, () => Array(width).fill(null))
  for (const [x, y, w, h, letter] of rects) {
    if (!COLORS[kind][letter]) throw new Error(`pets: no colour '${letter}' for a ${kind}`)
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) cells[j][i] = COLORS[kind][letter]
  }
  return cells
}

const PICTURES = Object.fromEntries(
  Object.entries(SHAPES).map(([kind, shape]) => [
    kind,
    Object.fromEntries(PET_STATES[kind].map(state => [state, shape[state].map((rects, frame) => ({ key: `pet-${kind}-${state}-${frame}`, width: shape.size[0], height: shape.size[1], cells: cellsOf(kind, rects) }))])),
  ]),
)

// the picture of a pet in a state at a time in seconds: walking steps through its two frames, the rest stay as they are
export const petSprite = (kind, state, t = 0) => {
  const frames = PICTURES[kind][state]
  return frames[state === 'walk' ? Math.floor(t * 6) % frames.length : 0]
}
