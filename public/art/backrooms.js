// The back rooms: the file room's shelves, the test lab's machine and benches, the server room's racks,
// the bathrooms' stalls and basins, and the meeting room's board table. Rectangles ['r', x, y, w, h, colour]
// in pixels, palette colours only, light from the top-left.
import { RAMPS } from '../palette.js'
import { hash } from '../pixel.js'

const TILE = 16
const r = (x, y, w, h, color) => ['r', x, y, w, h, color]
const [wood, metal, plaster, glass, brick, leaf, light, slate, frost, teal, warm, lilac] = [
  RAMPS.wood, RAMPS.metal, RAMPS.plaster, RAMPS.glass, RAMPS.brick, RAMPS.leaf, RAMPS.light, RAMPS.slate, RAMPS.frost, RAMPS.fabricCool, RAMPS.fabricWarm, RAMPS.lilac,
]
const BOOKS = [brick[2], glass[2], light[2], leaf[2], teal[2], warm[2], lilac[1]]

// Shelves one tile wide along a wall, seen from the front (squeezed into the tile): books of different heights and
// colours, and now and then a pair of archive boxes with labels. `h` tiles tall.
const shelfOps = ({ x: tx, y: ty, h }) => {
  const H = h * TILE
  const ops = [r(1, 0, 14, H, wood[1]), r(1, 0, 1, H, wood[2]), r(14, 1, 1, H - 1, wood[0])]
  for (let t = 0; t < h; t++) {
    const top = t * TILE
    ops.push(r(2, top + 1, 12, 14, wood[0]))
    for (const level of [0, 1]) {
      const y = top + 1 + level * 7
      const seed = hash(tx + t * 3, ty + level)
      if (seed % 4 === 0) {
        for (const bx of [2, 8]) ops.push(r(bx, y + 1, 5, 5, plaster[2]), r(bx, y + 1, 5, 1, plaster[3]), r(bx + 1, y + 3, 3, 1, wood[1])) // archive boxes with labels
      } else {
        let x = 2
        for (let i = 0; i < 5; i++) {
          const b = hash(seed + i, i * 7 + level)
          const width = 2 + (b % 2)
          if (x + width > 14) break
          const tall = 4 + ((b >>> 3) % 3)
          ops.push(r(x, y + 6 - tall, width, tall, BOOKS[(b >>> 6) % BOOKS.length]), r(x, y + 6 - tall, 1, tall, plaster[1]))
          x += width
        }
      }
      ops.push(r(2, y + 6, 12, 1, wood[2]))
    }
  }
  return ops
}

// the test lab's machine, two tiles by two: a screen on top, three lights, a vented cabinet
const machineOps = () => [
  r(3, 1, 26, 13, metal[0]), r(3, 1, 26, 1, metal[2]), r(4, 2, 24, 11, glass[0]), // the screen in its frame
  r(6, 4, 8, 1, leaf[3]), r(6, 6, 14, 1, glass[3]), r(6, 8, 6, 1, leaf[3]), r(6, 10, 10, 1, brick[3]), r(22, 4, 4, 7, glass[1]), // a test run on it
  r(1, 14, 30, 17, metal[1]), r(1, 14, 30, 1, metal[2]), r(1, 14, 1, 17, metal[2]), r(30, 15, 1, 16, metal[0]), // the cabinet
  r(4, 17, 2, 2, leaf[3]), r(8, 17, 2, 2, light[3]), r(12, 17, 2, 2, brick[2]), r(20, 17, 8, 3, metal[0]), r(21, 18, 6, 1, metal[2]), // lights and a card slot
  r(4, 23, 24, 1, metal[0]), r(4, 25, 24, 1, metal[0]), r(4, 27, 24, 1, metal[0]), // vents
  r(1, 30, 30, 2, metal[0]),
]

// a lab bench, two tiles long, with glassware on it or a microscope, chosen by where it stands
const labBenchOps = ({ x }) => {
  const ops = [
    r(0, 0, 32, 8, slate[3]), r(0, 0, 32, 1, plaster[3]), r(0, 0, 1, 8, plaster[3]), r(31, 1, 1, 7, slate[1]), // the top
    r(0, 8, 32, 8, slate[1]), r(0, 8, 32, 1, slate[0]), r(0, 15, 32, 1, slate[0]), r(2, 10, 12, 4, slate[0]), r(18, 10, 12, 4, slate[0]), r(8, 11, 2, 1, metal[2]), r(24, 11, 2, 1, metal[2]), // cupboards
  ]
  if ((x >> 1) % 2 === 0)
    ops.push(r(4, 1, 3, 6, glass[2]), r(4, 1, 3, 1, glass[3]), r(9, 3, 4, 4, leaf[2]), r(9, 3, 4, 1, leaf[3]), r(16, 2, 3, 5, brick[2]), r(16, 2, 3, 1, brick[3]), r(23, 2, 6, 5, glass[1]), r(24, 3, 4, 3, glass[2])) // beakers and a rack of tubes
  else ops.push(r(5, 1, 7, 6, metal[1]), r(5, 1, 7, 1, metal[3]), r(7, 2, 3, 3, glass[1]), r(14, 4, 6, 3, plaster[3]), r(23, 2, 5, 5, brick[1]), r(23, 2, 5, 1, brick[3])) // a microscope, notes, a box
  return ops
}

// a server rack, one tile wide and two tall: rows of units with their lights
const rackOps = ({ x }) => {
  const ops = [r(1, 0, 14, 32, metal[0]), r(1, 0, 14, 1, metal[2]), r(1, 0, 1, 32, metal[2]), r(14, 1, 1, 31, metal[1])]
  const leds = [leaf[3], light[3], leaf[3], brick[2]]
  for (let unit = 0; unit < 7; unit++) {
    const y = 2 + unit * 4
    ops.push(r(3, y, 10, 3, metal[1]), r(3, y, 10, 1, metal[2]), r(4, y + 1, 1, 1, leds[(unit + x) % leds.length]), r(6, y + 1, 5, 1, metal[0]))
  }
  ops.push(r(1, 31, 14, 1, metal[1]))
  return ops
}

// a bathroom stall, one tile wide and two tall: its top edge and its door, with a gap under it
const stallOps = ({ x }) => {
  const door = x % 2 === 0 ? leaf[2] : brick[2]
  return [
    r(0, 0, TILE, 3, frost[3]), r(0, 0, TILE, 1, plaster[3]), r(0, 2, TILE, 1, frost[1]), // the top edge
    r(1, 3, 14, 23, frost[2]), r(1, 3, 1, 23, frost[3]), r(14, 4, 1, 22, frost[1]), // the door
    r(3, 6, 10, 1, frost[1]), r(3, 20, 10, 1, frost[1]), r(11, 12, 2, 3, metal[2]), r(11, 10, 2, 1, door), // panels, the handle and the lock
    r(1, 26, 14, 6, slate[0]), r(3, 28, 3, 4, slate[1]), r(10, 28, 3, 4, slate[1]), // the gap under it, and feet
  ]
}

// a pedestal basin with a tap
const basinOps = () => [
  r(6, 9, 4, 6, plaster[2]), r(6, 9, 1, 6, plaster[3]), r(5, 14, 6, 2, plaster[1]), // the pedestal
  r(3, 4, 10, 5, plaster[3]), r(3, 4, 10, 1, plaster[3]), r(3, 8, 10, 1, plaster[1]), r(4, 5, 8, 3, frost[1]), r(4, 5, 8, 1, frost[0]), // the bowl
  r(7, 2, 2, 3, metal[3]), r(7, 2, 2, 1, plaster[3]), r(6, 3, 1, 2, metal[2]), // the tap
]

// the board table, five tiles by two: a polished top with an inlaid line, the edge, and what is on it
const boardTableOps = () => [
  r(0, 0, 80, 26, wood[2]), r(0, 0, 80, 1, wood[3]), r(0, 0, 1, 26, wood[3]), r(79, 1, 1, 25, wood[1]), // the top, lit top-left
  r(3, 3, 74, 1, wood[3]), r(3, 22, 74, 1, wood[1]), r(3, 3, 1, 20, wood[3]), r(76, 3, 1, 20, wood[1]), // an inlaid border
  r(0, 26, 80, 6, wood[0]), r(0, 26, 80, 1, wood[1]), // the edge
  r(36, 11, 6, 5, metal[1]), r(36, 11, 6, 1, metal[3]), r(38, 12, 2, 2, light[2]), // a speaker for calls
  r(10, 7, 8, 5, plaster[3]), r(10, 7, 8, 1, plaster[2]), r(11, 9, 5, 1, plaster[1]), r(60, 14, 8, 5, plaster[3]), r(61, 16, 5, 1, plaster[1]), // papers
  r(24, 15, 3, 6, glass[2]), r(24, 15, 3, 1, glass[3]), r(52, 6, 3, 3, plaster[3]), r(56, 6, 3, 3, brick[2]), // a carafe and cups
]

export const backroomArts = {
  shelf: { under: false, ops: shelfOps },
  machine: { under: false, ops: machineOps },
  labbench: { under: false, ops: labBenchOps },
  rack: { under: false, ops: rackOps },
  stall: { under: false, ops: stallOps },
  basin: { under: false, ops: basinOps },
  boardtable: { under: false, ops: boardTableOps },
}
