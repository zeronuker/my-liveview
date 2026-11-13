// The back rooms: the file room's shelves, the test lab's machine and benches, the server room's racks,
// the bathrooms' cubicles, urinals and sink counters, and the meeting room's board table. Rectangles ['r', x, y, w, h, colour]
// in pixels, palette colours only, light from the top-left.
import { RAMPS } from '../palette.js'
import { ellipseOps, hash } from '../pixel.js'

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

// A server rack, one tile with its picture rising 4 pixels above it (RACK_RISE): 20 pixels tall, a little taller than a
// person, rows of units with their lights, seen from the front; one with `face: 'up'` (the back row of a pair, whose
// fronts face the aisle) shows its back, a fan and a loom of cables
const RACK_RISE = 4
const rackOps = ({ x, y = 0, face }) => {
  const ops = [r(1, 0, 14, 20, metal[0]), r(1, 0, 14, 1, metal[2]), r(1, 0, 1, 20, metal[2]), r(14, 1, 1, 19, metal[1])]
  if (face === 'up') {
    ops.push(r(3, 2, 10, 16, metal[1]), r(3, 2, 10, 1, metal[2]))
    ops.push(...ellipseOps(8, 7, 4, 4, metal[0]), ...ellipseOps(8, 7, 3, 3, metal[1]), r(7, 5, 2, 4, metal[0]), r(6, 6, 4, 2, metal[0]), r(7, 6, 2, 2, metal[2])) // the fan
    for (const cx of [4, 6, 9, 11]) ops.push(r(cx, 12, 1, 6, [brick[2], glass[2], leaf[2], light[2]][cx % 4]), r(cx, 12, 1, 1, plaster[3]))
    ops.push(r(1, 19, 14, 1, metal[1]))
    return ops
  }
  const leds = [leaf[3], light[3], leaf[3], brick[2]]
  for (let unit = 0; unit < 4; unit++) {
    const uy = 2 + unit * 4
    ops.push(r(3, uy, 10, 3, metal[1]), r(3, uy, 10, 1, metal[2]), r(4, uy + 1, 1, 1, leds[(unit + x + y) % leds.length]), r(6, uy + 1, 5, 1, metal[0]), r(11, uy + 1, 1, 1, leds[(unit + x + y + 2) % leds.length]))
  }
  ops.push(r(1, 19, 14, 1, metal[1]))
  return ops
}

// A wall urinal on a west wall, one tile, seen from the side: a privacy screen along its north edge, a ceramic bowl
// against the wall with a flush valve and pipe, and a drain. The bowl faces east, into the room.
const urinalOps = () => [
  r(0, 0, 11, 5, frost[2]), r(0, 0, 11, 1, frost[3]), r(0, 4, 11, 1, frost[1]), // the privacy screen
  ...ellipseOps(5, 10, 5, 5, plaster[1]), ...ellipseOps(5, 10, 4, 4, plaster[3]), ...ellipseOps(4, 10, 2, 3, slate[1]), r(3, 7, 2, 1, plaster[3]), // the bowl, its hollow and a highlight
  r(0, 6, 2, 4, metal[1]), r(0, 6, 1, 4, metal[3]), r(1, 5, 3, 1, metal[2]), // the flush valve and pipe on the wall
  r(5, 13, 2, 1, slate[0]), // the drain
]

// A cubicle on a west wall, one tile wide and two tall, seen from the side and a little above: its north partition, the
// toilet inside it (a cistern against the wall, a bowl with its seat and water), and its door on the east side in the
// cubicle's own colour (`tone`), with a lock and a gap under it.
const cubicleOps = ({ y = 0, tone }) => {
  const door = y % 4 === 0 ? leaf[2] : brick[2]
  const [dark, mid, lit] = tone ? [RAMPS[tone][1], RAMPS[tone][2], RAMPS[tone][3]] : [frost[1], frost[2], frost[3]]
  return [
    r(0, 0, 14, 5, mid), r(0, 0, 14, 1, lit), r(0, 4, 14, 1, dark), // the partition on the north side
    r(0, 31, 14, 1, dark), // and the foot of the next one
    r(1, 9, 4, 6, plaster[2]), r(1, 9, 4, 1, plaster[3]), r(1, 14, 4, 1, plaster[1]), // the cistern
    ...ellipseOps(8, 17, 5, 6, plaster[1]), ...ellipseOps(8, 17, 4, 5, plaster[3]), ...ellipseOps(8, 18, 3, 3, glass[2]), r(6, 13, 3, 1, plaster[3]), // the bowl, its seat and the water
    r(1, 22, 2, 2, plaster[3]), r(1, 22, 2, 1, plaster[2]), // a roll of paper
    r(13, 5, 3, 22, mid), r(13, 5, 1, 22, lit), r(15, 6, 1, 21, dark), r(13, 14, 2, 3, metal[2]), r(14, 12, 1, 1, door), // the door, its handle and the lock
    r(13, 25, 3, 2, slate[0]), r(0, 27, 13, 4, frost[1]), r(0, 27, 13, 1, frost[2]), // the gap under it, and the near partition's edge
  ]
}

// A sink counter against an east wall, `h` tiles long, with a basin to every two tiles: a stone top, the cabinet's front
// to the west, basins with a tap at the wall, and the end of the cabinet at the south.
const vanityOps = ({ h }) => {
  const H = h * TILE
  const ops = [r(0, 0, 3, H - 3, wood[1]), r(0, 0, 1, H - 3, wood[2]), r(0, H - 6, 16, 6, wood[1]), r(0, H - 6, 16, 1, wood[2]), r(0, H - 1, 16, 1, wood[0]), r(3, 0, 13, H - 6, slate[3]), r(3, 0, 1, H - 6, plaster[3]), r(15, 0, 1, H - 6, slate[1])]
  for (let i = 0; i < Math.floor(h / 2); i++) {
    const cy = i * 32 + 16
    ops.push(...ellipseOps(9, cy, 5, 6, slate[1]), ...ellipseOps(9, cy, 4, 5, plaster[3]), ...ellipseOps(9, cy, 3, 4, frost[2]), r(9, cy, 1, 1, slate[0]), r(13, cy - 2, 2, 5, metal[3]), r(11, cy - 1, 3, 1, metal[2])) // a basin, its drain and its tap
  }
  return ops
}

// the board table, three or five tiles by two: a polished top with an inlaid line, the edge, and what is on it
const boardTableOps = ({ w }) => {
  const W = w * TILE
  const [mid, carafe] = [W / 2, Math.round(W * 0.3)]
  return [
    r(0, 0, W, 26, wood[2]), r(0, 0, W, 1, wood[3]), r(0, 0, 1, 26, wood[3]), r(W - 1, 1, 1, 25, wood[1]), // the top, lit top-left
    r(3, 3, W - 6, 1, wood[3]), r(3, 22, W - 6, 1, wood[1]), r(3, 3, 1, 20, wood[3]), r(W - 4, 3, 1, 20, wood[1]), // an inlaid border
    r(0, 26, W, 6, wood[0]), r(0, 26, W, 1, wood[1]), // the edge
    r(mid - 4, 11, 6, 5, metal[1]), r(mid - 4, 11, 6, 1, metal[3]), r(mid - 2, 12, 2, 2, light[2]), // a speaker for calls
    r(10, 7, 8, 5, plaster[3]), r(10, 7, 8, 1, plaster[2]), r(11, 9, 5, 1, plaster[1]), r(W - 20, 14, 8, 5, plaster[3]), r(W - 19, 16, 5, 1, plaster[1]), // papers
    r(carafe, 15, 3, 6, glass[2]), r(carafe, 15, 3, 1, glass[3]), r(W - 28, 6, 3, 3, plaster[3]), r(W - 24, 6, 3, 3, brick[2]), // a carafe and cups
  ]
}

export const backroomArts = {
  shelf: { under: false, ops: shelfOps },
  machine: { under: false, ops: machineOps },
  labbench: { under: false, ops: labBenchOps },
  rack: { under: false, rise: RACK_RISE, ops: rackOps },
  cubicle: { under: false, ops: cubicleOps },
  urinal: { under: false, ops: urinalOps },
  vanity: { under: false, ops: vanityOps },
  boardtable: { under: false, ops: boardTableOps },
}
