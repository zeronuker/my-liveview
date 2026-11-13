// The social wing: the TV, the ping-pong table, the vending machines, the water cooler, the bin, the
// pantry (counters, sink, coffee bar, island, stools, fridge) and the terrace (café tables and the railing).
// Rectangles ['r', x, y, w, h, colour] in pixels, palette colours only, light from the top-left.
import { RAMPS } from '../palette.js'
import { ellipseOps } from '../pixel.js'

const TILE = 16
const r = (x, y, w, h, color) => ['r', x, y, w, h, color]
const [wood, metal, plaster, glass, brick, leaf, light, stone, frost, teal] = [
  RAMPS.wood, RAMPS.metal, RAMPS.plaster, RAMPS.glass, RAMPS.brick, RAMPS.leaf, RAMPS.light, RAMPS.stone, RAMPS.frost, RAMPS.fabricCool,
]

// A TV on a low unit along a wall that runs north to south, facing west: the top of the unit, the TV
// standing on it seen edge on, its screen a thin lit strip, and the unit's front at the south end.
const tvOps = ({ h }) => {
  const H = h * TILE
  return [
    r(2, 0, 12, H - 4, wood[1]), r(2, 0, 12, 1, wood[2]), r(2, 0, 1, H - 4, wood[2]), // the top of the unit
    r(2, H - 4, 12, 4, wood[0]), r(2, H - 4, 12, 1, wood[1]), // its front
    r(8, 4, 3, H - 12, metal[0]), r(8, 4, 3, 1, metal[2]), r(7, 5, 1, H - 14, glass[1]), r(6, 6, 1, H - 18, glass[2]), // the TV, and the light from its screen
    r(7, H - 8, 5, 2, metal[1]), // its foot
  ]
}

// a table-tennis table, three tiles by two: the top with its lines and the net, the edge, the legs, two bats and a ball
const pingPongOps = () => [
  r(1, 3, 46, 21, teal[2]), r(1, 3, 46, 1, teal[3]), r(1, 3, 1, 21, teal[3]), // the top, lit top-left
  r(2, 4, 44, 1, plaster[3]), r(2, 22, 44, 1, plaster[3]), r(2, 4, 1, 19, plaster[3]), r(45, 4, 1, 19, plaster[3]), r(23, 5, 1, 17, plaster[3]), // the lines
  r(22, 1, 4, 1, metal[2]), r(23, 2, 2, 23, plaster[2]), r(23, 2, 2, 1, plaster[3]), r(22, 24, 4, 1, metal[1]), // the net on its posts
  r(1, 24, 46, 3, teal[0]), r(1, 24, 46, 1, teal[1]), // the edge
  r(3, 27, 2, 5, metal[1]), r(43, 27, 2, 5, metal[1]), // the legs
  r(8, 11, 4, 4, brick[2]), r(8, 11, 4, 1, brick[3]), r(30, 13, 4, 4, glass[2]), r(30, 13, 4, 1, glass[3]), // two bats
  r(17, 14, 1, 1, plaster[3]), // the ball
]

// A vending machine, one tile, seen from the front. Its colour is picked by where it stands: red, blue or yellow.
// It stands 22 pixels tall, a person and a bit, so its picture rises 6 pixels above its tile (VENDING_RISE).
const VENDING_RISE = 6
const vendingOps = ({ x }) => {
  const body = [brick, glass, light][x % 3]
  const y = VENDING_RISE
  return [
    r(1, 1, 14, 21, body[1]), r(1, 1, 14, 1, body[3]), r(1, 1, 1, 21, body[2]), r(14, 2, 1, 20, body[0]), // the body, lit top-left
    r(3, 2, 10, 3, metal[0]), r(4, 3, 8, 1, light[3]), r(4, 3, 3, 1, light[2]), // the lit sign on top
    r(3, y + 3, 10, 7, metal[0]), r(3, y + 6, 10, 1, metal[1]), // the window, and its shelf
    r(4, y + 4, 2, 2, brick[2]), r(7, y + 4, 2, 2, glass[2]), r(10, y + 4, 2, 2, light[2]), r(4, y + 7, 2, 2, leaf[2]), r(7, y + 7, 2, 2, light[2]), r(10, y + 7, 2, 2, brick[2]), // what is in it
    r(4, y + 11, 3, 3, metal[2]), r(5, y + 12, 1, 1, light[3]), r(9, y + 11, 3, 1, metal[0]), // the buttons and the coin slot
    r(4, y + 14, 8, 2, metal[0]), r(5, y + 14, 6, 1, metal[1]), // where it comes out
  ]
}

const coolerOps = () => [
  r(5, 1, 6, 7, glass[2]), r(5, 1, 6, 1, glass[3]), r(6, 2, 1, 5, glass[3]), r(5, 7, 6, 1, glass[1]), // the bottle
  r(3, 8, 10, 7, plaster[2]), r(3, 8, 10, 1, plaster[3]), r(3, 14, 10, 1, plaster[1]), r(12, 9, 1, 5, plaster[1]), // the cabinet
  r(6, 10, 1, 2, brick[2]), r(9, 10, 1, 2, glass[1]), // the taps
]

const binOps = () => [
  r(4, 5, 8, 10, metal[1]), r(4, 5, 1, 10, metal[2]), r(11, 6, 1, 9, metal[0]), r(4, 14, 8, 1, metal[0]), // the can
  r(3, 3, 10, 2, metal[2]), r(3, 3, 10, 1, metal[3]), r(6, 2, 4, 1, metal[2]), // the lid
]

// a kitchen counter, `w` tiles by one, seen from the front: a stone top, cupboard doors, a mug
const counterTop = W => [r(0, 0, W, 8, stone[3]), r(0, 0, W, 1, plaster[3]), r(0, 0, 1, 8, plaster[3]), r(W - 1, 1, 1, 7, stone[1])]
const cupboards = W => {
  const ops = [r(0, 8, W, 8, wood[1]), r(0, 8, W, 1, wood[0]), r(0, 15, W, 1, wood[0])]
  for (let x = 0; x < W; x += 16) ops.push(r(x + 2, 10, 12, 5, wood[0]), r(x + 2, 10, 12, 1, wood[2]), r(x + 7, 11, 2, 1, metal[2]))
  return ops
}
const counterOps = ({ w }) => [...counterTop(w * TILE), ...cupboards(w * TILE), r(4, 2, 3, 3, brick[2]), r(4, 2, 3, 1, brick[3])]

const sinkOps = ({ w }) => [
  ...counterTop(w * TILE), ...cupboards(w * TILE),
  r(7, 1, 18, 6, metal[2]), r(8, 2, 16, 4, metal[1]), r(8, 2, 16, 1, metal[0]), // the basin
  r(15, 0, 2, 2, metal[3]), // the tap
]

const coffeeBarOps = ({ w }) => [
  ...counterTop(w * TILE), ...cupboards(w * TILE),
  r(3, 0, 11, 8, brick[1]), r(3, 0, 11, 1, brick[3]), r(3, 0, 1, 8, brick[2]), r(13, 1, 1, 7, brick[0]), r(6, 6, 5, 2, metal[0]), r(7, 4, 3, 1, metal[2]), // the coffee machine
  r(17, 3, 3, 3, plaster[3]), r(21, 3, 3, 3, brick[2]), r(21, 3, 3, 1, brick[3]), // mugs
  r(26, 1, 4, 5, metal[2]), r(26, 1, 4, 1, metal[3]), r(30, 2, 1, 2, metal[2]), // a kettle
]

// the island: a stone top that overhangs, wooden sides, a fruit bowl
const islandOps = ({ w }) => {
  const W = w * TILE
  return [
    r(0, 0, W, 9, stone[3]), r(0, 0, W, 1, plaster[3]), r(0, 0, 1, 9, plaster[3]), r(W - 1, 1, 1, 8, stone[1]), r(0, 8, W, 1, stone[2]), // the top
    r(1, 9, W - 2, 7, wood[1]), r(1, 9, W - 2, 1, wood[0]), r(1, 15, W - 2, 1, wood[0]), // the side
    ...ellipseOps(W - 12, 4, 5, 3, wood[2]), r(W - 15, 2, 2, 2, brick[2]), r(W - 12, 1, 2, 2, light[2]), r(W - 9, 2, 2, 2, leaf[2]), // a fruit bowl
  ]
}

const stoolOps = () => [
  r(5, 11, 1, 4, metal[1]), r(10, 11, 1, 4, metal[1]), r(4, 14, 8, 1, metal[0]), // the legs and the ring
  ...ellipseOps(8, 9, 6, 4, wood[0]), ...ellipseOps(8, 8, 6, 4, wood[2]), ...ellipseOps(7, 7, 3, 2, wood[3]), // the round seat
]

// the fridge: one tile wide, two tall: its top, then the front with two doors and handles
const fridgeOps = () => [
  r(1, 0, 14, 7, frost[3]), r(1, 0, 14, 1, plaster[3]), r(1, 0, 1, 7, plaster[3]), // the top
  r(1, 7, 14, 25, frost[2]), r(1, 7, 1, 25, frost[3]), r(14, 8, 1, 24, frost[1]), r(1, 7, 14, 1, frost[1]), // the front
  r(1, 18, 14, 1, frost[1]), r(11, 9, 1, 7, metal[2]), r(11, 20, 1, 9, metal[2]), r(1, 31, 14, 1, frost[0]), // the two doors and their handles
]

// a round café table, one tile across, with a cup on it
const cafeTableOps = () => [
  r(7, 9, 2, 5, metal[1]), r(5, 14, 6, 2, metal[0]), // the pole and the foot
  ...ellipseOps(8, 7, 7, 5, metal[1]), ...ellipseOps(8, 6, 7, 5, plaster[3]), ...ellipseOps(5, 4, 2, 1, plaster[2]),
  r(9, 4, 3, 2, brick[2]), r(9, 4, 3, 1, brick[3]), r(12, 5, 1, 1, brick[2]), // a cup
]

// a wooden railing along the edge of the deck: a rail and posts, with balusters
const deckRailOps = ({ w, h }) => {
  const ops = []
  if (w >= h) {
    const W = w * TILE
    ops.push(r(0, 4, W, 3, wood[2]), r(0, 4, W, 1, wood[3]), r(0, 7, W, 1, wood[0]))
    for (let x = 3; x < W; x += 4) ops.push(r(x, 8, 1, 7, wood[1]))
    for (let x = 0; x < W; x += TILE) ops.push(r(x, 3, 3, 13, wood[2]), r(x, 3, 3, 1, wood[3]), r(x + 2, 4, 1, 12, wood[0]))
    ops.push(r(W - 3, 3, 3, 13, wood[2]), r(W - 3, 3, 3, 1, wood[3]))
    return ops
  }
  const H = h * TILE
  ops.push(r(6, 0, 3, H, wood[2]), r(6, 0, 1, H, wood[3]), r(8, 0, 1, H, wood[0]))
  for (let y = 0; y < H; y += TILE) ops.push(r(4, y + 5, 7, 4, wood[2]), r(4, y + 5, 7, 1, wood[3]), r(4, y + 8, 7, 1, wood[0]))
  return ops
}

export const socialArts = {
  tv: { under: false, ops: tvOps, lights: ({ h }) => [{ x: 6, y: 6, w: 1, h: h * TILE - 18, pattern: 'cycle', on: glass[2], colors: [glass[2], glass[3], plaster[3], light[2], leaf[2]] }] }, // the picture changes
  pingpong: { under: false, ops: pingPongOps },
  vending: { under: false, rise: VENDING_RISE, ops: vendingOps, lights: () => [{ x: 4, y: 3, w: 8, h: 1, pattern: 'flicker', on: light[3], off: light[1] }, { x: 5, y: VENDING_RISE + 12, w: 1, h: 1, pattern: 'slow', on: light[3], off: metal[2] }] }, // the sign and a button
  cooler: { under: false, ops: coolerOps },
  bin: { under: false, ops: binOps },
  counter: { under: false, ops: counterOps },
  sink: { under: false, ops: sinkOps },
  coffeebar: { under: false, ops: coffeeBarOps, lights: () => [{ x: 5, y: 2, w: 2, h: 1, pattern: 'slow', on: light[3], off: brick[2] }] }, // the machine's ready light
  island: { under: false, ops: islandOps },
  stool: { under: true, ops: stoolOps },
  fridge: { under: false, ops: fridgeOps },
  cafetable: { under: false, ops: cafeTableOps },
  deckrail: { under: false, ops: deckRailOps },
}
