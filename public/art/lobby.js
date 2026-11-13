// The lobby's furniture and props: the reception counter, the coffee table, a side table with a lamp,
// the coat stand and the umbrella stand. Rectangles ['r', x, y, w, h, colour] in pixels, palette
// colours only, light from the top-left. (Its sofas, armchairs, plants, rug and lights are in common.js.)
import { RAMPS } from '../palette.js'
import { ellipseOps } from '../pixel.js'

const r = (x, y, w, h, color) => ['r', x, y, w, h, color]

// The reception counter is two pieces: the long side, with the front you see and a monitor, a bell
// and some papers on it, and the short arm, whose top you see, with a stand of leaflets.
const receptionOps = ({ w, h }) => {
  const [W, H] = [w * 16, h * 16]
  const wood = RAMPS.wood
  const warm = RAMPS.fabricWarm
  const metal = RAMPS.metal
  if (w > h)
    return [
      r(0, 0, W, 8, wood[2]), r(0, 0, W, 1, wood[3]), r(0, 0, 1, 8, wood[3]), r(W - 1, 1, 1, 7, wood[1]), // the top
      r(0, 8, W, 8, wood[1]), r(0, 8, W, 1, wood[0]), r(0, 15, W, 1, wood[0]), // the front
      ...[3, 18, 33].flatMap(x => [r(x, 10, 12, 4, wood[0]), r(x, 13, 12, 1, wood[2])]), // three panels
      r(5, 1, 9, 3, metal[1]), r(5, 1, 9, 1, metal[2]), r(8, 4, 3, 1, metal[0]), // the monitor
      r(30, 3, 4, 2, RAMPS.light[2]), r(30, 3, 4, 1, RAMPS.light[3]), // a bell
      r(37, 2, 6, 4, RAMPS.plaster[3]), r(44, 3, 1, 3, RAMPS.glass[1]), // papers and a pen
    ]
  return [
    r(0, 0, W, H, wood[2]), r(0, 0, W, 1, wood[3]), r(0, 0, 1, H, wood[3]), r(W - 1, 0, 1, H, wood[1]),
    r(4, 5, 8, 5, warm[1]), r(4, 5, 8, 1, warm[3]), r(5, 7, 2, 2, RAMPS.plaster[3]), r(9, 7, 2, 2, RAMPS.plaster[3]), // a stand of leaflets
  ]
}

// a round coffee table, one tile (about a metre) across
const coffeeTableOps = () => {
  const wood = RAMPS.wood
  return [
    ...ellipseOps(8, 9, 7, 6, wood[0]), ...ellipseOps(8, 8, 7, 6, wood[2]), ...ellipseOps(6, 6, 3, 2, wood[3]), // the round top, lit top-left
    r(4, 7, 4, 3, RAMPS.brick[2]), r(4, 7, 4, 1, RAMPS.brick[3]), // a magazine
    r(8, 8, 4, 3, RAMPS.glass[2]), r(8, 8, 4, 1, RAMPS.glass[3]), // and another
    r(10, 4, 2, 3, RAMPS.plaster[2]), r(10, 4, 2, 1, RAMPS.plaster[3]), r(10, 3, 2, 1, RAMPS.leaf[2]), // a small vase with a leaf
  ]
}

const sideTableOps = () => {
  const [wood, metal, light] = [RAMPS.wood, RAMPS.metal, RAMPS.light]
  return [
    r(7, 13, 2, 3, wood[0]), ...ellipseOps(8, 11, 6, 3, wood[0]), ...ellipseOps(8, 10, 6, 3, wood[2]), // the little round table
    r(7, 7, 2, 3, metal[1]), // the lamp's stand
    r(6, 2, 4, 1, light[3]), r(5, 3, 6, 1, light[2]), r(4, 4, 8, 1, light[2]), r(4, 5, 8, 2, light[1]), // its shade
  ]
}

const coatStandOps = () => {
  const [wood, fabric, brick, warm] = [RAMPS.wood, RAMPS.fabricCool, RAMPS.brick, RAMPS.fabricWarm]
  return [
    r(7, 2, 2, 13, wood[1]), r(7, 2, 1, 13, wood[2]), r(4, 4, 8, 1, wood[1]), r(5, 14, 6, 2, wood[0]), // the pole, the pegs and the foot
    r(3, 5, 4, 7, fabric[2]), r(3, 5, 4, 1, fabric[3]), r(3, 5, 1, 7, fabric[3]), r(6, 6, 1, 6, fabric[1]), // a coat
    r(9, 5, 4, 6, brick[2]), r(9, 5, 4, 1, brick[3]), r(12, 6, 1, 5, brick[1]), // and another
    r(6, 1, 4, 2, warm[2]), r(6, 1, 4, 1, warm[3]), // a hat on top
  ]
}

const umbrellaStandOps = () => {
  const [metal, glass, brick, leaf] = [RAMPS.metal, RAMPS.glass, RAMPS.brick, RAMPS.leaf]
  return [
    r(7, 3, 1, 6, glass[1]), r(6, 2, 2, 1, glass[1]), r(9, 4, 1, 5, brick[1]), r(10, 5, 1, 4, leaf[1]), // handles and umbrellas
    r(4, 8, 8, 7, metal[1]), r(4, 8, 8, 1, metal[3]), r(4, 8, 1, 7, metal[2]), r(11, 9, 1, 6, metal[0]), r(4, 15, 8, 1, metal[0]), // the can
  ]
}

export const lobbyArts = {
  reception: { under: false, ops: receptionOps },
  coffeetable: { under: false, ops: coffeeTableOps },
  sidetable: { under: false, ops: sideTableOps },
  coatstand: { under: false, ops: coatStandOps },
  umbrella: { under: false, ops: umbrellaStandOps },
}
