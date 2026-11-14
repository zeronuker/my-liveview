// The angled view's furniture, one drawer for each kind. A drawer paints one tile of a piece: (c, px, py, furn, part, at),
// where `part` says which tile of the piece it is ({ i, j, w, h }, counted from its top corner) and `at` is the tile
// ({ x, y }). Pieces are drawn a tile at a time, back to front, so a tile's neighbours in the same piece cover its
// inner faces; only the outer faces and what stands on top need care. Heights are in pixels (a person is 11 tall).
// Light is from the top-left: left faces (towards +y) are lighter than right faces (towards +x). Palette colours only.
import { BACK, BEHIND, block, blockTop, bottomEdge, cellHash, diamond, edgeY, rect, seatTop, slab, table, topEdge } from './iso-draw.js'
import { RAMPS, shade } from './palette.js'

// the material a piece is made of: its tone if it has one, else the usual
const toneOf = (furn, usual) => (furn.tone && RAMPS[furn.tone] ? furn.tone : usual)

// ---- seating ----

// A sofa or armchair: a seat, a back on the edge behind whoever sits, arms at the ends of the run, and a seam between
// cushions. The run goes along x when the seat faces up or down, along y when it faces left or right.
const seating = usual => (c, px, py, furn, part) => {
  const mat = toneOf(furn, usual)
  const back = BACK[furn.face] ?? 'ur'
  const alongX = furn.face ? furn.face === 'up' || furn.face === 'down' : furn.w >= furn.h
  const [at, length, ends] = alongX ? [part.i, furn.w, ['ul', 'lr']] : [part.j, furn.h, ['ur', 'll']]
  const arms = [at === 0 && ends[0], at === length - 1 && ends[1]].filter(Boolean)
  const arm = side => slab(c, px, py, 0, side, 7, shade(mat, 1), shade(mat, 3))
  const rest = () => slab(c, px, py, 4, back, 6, shade(mat, 1), shade(mat, 3))
  if (BEHIND.has(back)) rest()
  arms.filter(side => BEHIND.has(side)).forEach(arm)
  block(c, px, py, 4, mat)
  if (at > 0) for (let col = 0; col < 8; col++) rect(c, alongX ? px + col : px + 15 - col, py - 4 + topEdge(col), 1, 1, shade(mat, 1))
  if (!BEHIND.has(back)) rest()
  arms.filter(side => !BEHIND.has(side)).forEach(arm)
}

// ---- tables ----

const coffeetable = (c, px, py, furn, part) => {
  table(c, px, py, 4, 'wood', part)
  rect(c, px + 5, py - 2, 4, 2, shade('fabricCool', 2)) // a book
  rect(c, px + 5, py - 2, 4, 1, shade('fabricCool', 3))
  rect(c, px + 10, py - 3, 2, 2, shade('fabricWarm', 3)) // a mug
}

const sidetable = (c, px, py, furn, part) => {
  table(c, px, py, 5, 'wood', part)
  rect(c, px + 7, py - 6, 2, 5, shade('metal', 1)) // a lamp: a stem and a shade
  rect(c, px + 5, py - 11, 6, 5, shade('light', 2))
  rect(c, px + 5, py - 11, 6, 1, shade('light', 3))
}

const pingpong = (c, px, py, furn, part) => {
  table(c, px, py, 5, 'leaf', part)
  rect(c, px + 3, py - 1, 10, 1, shade('plaster', 3)) // the centre line
  if (part.i === 1) slab(c, px, py, 5, 'ul', 3, shade('plaster', 3), shade('plaster', 3)) // the net
}

// A TV on a stand: a thin dark panel along the +x edge with its screen on the face the viewer sees. (The plan has TVs facing west
// from the east wall; drawn so, the screen would turn its back on the viewer, so the picture is shown on the visible face.)
const SCREEN = [9, 10, 11, 12]
const tv = (c, px, py) => {
  block(c, px, py, 3, 'wood')
  slab(c, px, py, 3, 'lr', 9, shade('metal', 0), shade('metal', 2))
  for (const col of SCREEN) rect(c, px + col, py + edgeY('lr', col) - 10, 1, 6, shade('glass', 2))
}

// ---- work and meeting ----

const BOOKS = [shade('brick', 2), shade('leaf', 2), shade('periwinkle', 2), shade('light', 2), shade('fabricCool', 2), shade('lilac', 3), shade('terracotta', 2)]

// a bookcase: three shelves of books of different heights on its +x face
const shelf = (c, px, py, furn, part, at) => {
  block(c, px, py, 18, 'wood')
  for (let col = 8; col < 16; col++) {
    const top = py - 18 + bottomEdge(15 - col)
    for (let k = 0; k < 3; k++) {
      const n = cellHash(at.x * 31 + col, at.y * 7 + k)
      const height = 3 + (n % 2)
      const y = top + 2 + k * 5
      rect(c, px + col, y + 4 - height, 1, height, BOOKS[(n >>> 3) % BOOKS.length])
      rect(c, px + col, y + 4, 1, 1, shade('wood', 0))
    }
  }
}

// the CEO's desk: a leather-topped block with drawers, a laptop and a name plate
const ceodesk = (c, px, py, furn, part) => {
  block(c, px, py, 6, 'leather')
  for (let col = 1; col < 7; col++) rect(c, px + col, py - 6 + bottomEdge(col) + 2, 1, 1, shade('leather', 0))
  rect(c, px + 3, py - 6 + bottomEdge(3) + 3, 2, 1, shade('light', 2))
  const mid = py - 3
  if (part.i === 1) {
    rect(c, px + 4, mid - 6, 8, 5, shade('metal', 0))
    rect(c, px + 5, mid - 5, 6, 3, shade('glass', 2))
    rect(c, px + 4, mid - 1, 8, 1, shade('metal', 2))
  } else if (part.i === 2) rect(c, px + 6, mid - 1, 4, 1, shade('light', 3))
}

const cabinet = (c, px, py, furn, part) =>
  counter(c, px, py, furn, part, (c2, x, mid) => {
    rect(c2, x + 4, mid - 5, 2, 5, shade('glass', 2)) // bottles
    rect(c2, x + 4, mid - 6, 2, 1, shade('glass', 3))
    rect(c2, x + 7, mid - 6, 2, 6, shade('brick', 2))
    rect(c2, x + 10, mid - 4, 2, 4, shade('leaf', 2))
  }, { h: 7, mat: 'wood', topMat: 'wood' })

// a long meeting table: papers and a speakerphone
const boardtable = (c, px, py, furn, part) => {
  table(c, px, py, 5, 'wood', part)
  if ((part.i + part.j) % 2 === 0) rect(c, px + 5, py - 3, 4, 2, shade('plaster', 3))
  if (part.i === furn.w >> 1 && part.j === 0) rect(c, px + 6, py - 2, 4, 2, shade('metal', 0))
}

const reception = (c, px, py, furn, part) =>
  counter(c, px, py, furn, part, (c2, x, mid) => part.i === 0 && part.j === 0 && rect(c2, x + 6, mid - 2, 4, 2, shade('light', 3)), { h: 7, mat: 'wood', topMat: 'plaster' })

const coatstand = (c, px, py) => {
  rect(c, px + 6, py + 4, 4, 1, shade('wood', 0))
  rect(c, px + 7, py - 12, 2, 16, shade('wood', 2))
  rect(c, px + 4, py - 12, 8, 1, shade('wood', 1))
  rect(c, px + 9, py - 11, 3, 7, shade('fabricCool', 2)) // a coat
  rect(c, px + 9, py - 11, 1, 7, shade('fabricCool', 3))
  rect(c, px + 4, py - 13, 3, 2, shade('brick', 2)) // a hat
}

const umbrella = (c, px, py) => {
  rect(c, px + 5, py - 4, 6, 6, shade('metal', 2))
  rect(c, px + 5, py - 4, 2, 6, shade('metal', 3))
  rect(c, px + 9, py - 4, 2, 6, shade('metal', 1))
  rect(c, px + 6, py - 9, 1, 5, shade('fabricCool', 1))
  rect(c, px + 6, py - 10, 2, 1, shade('fabricCool', 2))
  rect(c, px + 9, py - 8, 1, 4, shade('brick', 1))
  rect(c, px + 9, py - 9, 2, 1, shade('brick', 2))
}

// ---- back rooms ----

// a server rack: bays with a blinking light each on the front, vents on the side
const rack = (c, px, py) => {
  block(c, px, py, 14, 'metal')
  for (let col = 1; col < 7; col++) for (let k = 0; k < 4; k++) rect(c, px + col, py - 14 + bottomEdge(col) + 2 + k * 3, 1, 2, shade('metal', 0))
  for (let k = 0; k < 4; k++) rect(c, px + 5, py - 14 + bottomEdge(5) + 2 + k * 3, 1, 1, shade(k % 2 ? 'leaf' : 'light', 3))
  for (let col = 9; col < 15; col += 2) rect(c, px + col, py - 14 + bottomEdge(15 - col) + 3, 1, 8, shade('metal', 0))
}

// the test machine: a block with a control panel on its front and a tank on top at the back
const machine = (c, px, py, furn, part) => {
  block(c, px, py, 10, 'metal')
  if (part.j === furn.h - 1) {
    for (let col = 1; col < 7; col++) rect(c, px + col, py - 10 + bottomEdge(col) + 2, 1, 5, shade('metal', 0))
    rect(c, px + 2, py - 10 + bottomEdge(2) + 3, 3, 2, shade('glass', 3))
    rect(c, px + 5, py - 10 + bottomEdge(5) + 3, 1, 1, shade('light', 3))
    rect(c, px + 5, py - 10 + bottomEdge(5) + 5, 1, 1, shade('leaf', 3))
  }
  if (part.i === 0 && part.j === 0) {
    rect(c, px + 4, py - 15, 8, 8, shade('glass', 2))
    rect(c, px + 4, py - 15, 2, 8, shade('glass', 3))
    rect(c, px + 5, py - 16, 6, 1, shade('metal', 1))
  }
}

const labbench = (c, px, py, furn, part) =>
  counter(c, px, py, furn, part, (c2, x, mid) => {
    if (part.i === 0) {
      rect(c2, x + 5, mid - 6, 4, 6, shade('glass', 2)) // a beaker with something in it
      rect(c2, x + 5, mid - 3, 4, 3, shade('brick', 2))
      rect(c2, x + 5, mid - 7, 4, 1, shade('glass', 3))
    } else {
      for (const dx of [4, 7, 10]) rect(c2, x + dx, mid - 5, 1, 5, shade('glass', 2)) // test tubes
      rect(c2, x + 4, mid - 2, 7, 1, shade('metal', 1))
    }
  }, { h: 6, mat: 'metal', topMat: 'stone' })

// a toilet cubicle: a partition with its door on the +x face
const cubicle = (c, px, py, furn, part) => {
  const mat = toneOf(furn, 'tile')
  block(c, px, py, 10, mat)
  if (part.j === 0)
    for (let col = 9; col < 14; col++) {
      const y = py - 10 + bottomEdge(15 - col)
      rect(c, px + col, y + 1, 1, 8, shade(mat, 2))
      rect(c, px + col, y + 9, 1, 1, shade(mat, 0))
    }
  if (part.j === 0) rect(c, px + 9, py - 10 + bottomEdge(6) + 4, 1, 1, shade('metal', 1))
}

const urinal = (c, px, py) => {
  rect(c, px + 4, py + 3, 8, 1, shade('frost', 1))
  rect(c, px + 5, py - 5, 6, 8, shade('frost', 2))
  rect(c, px + 5, py - 5, 2, 8, shade('frost', 3))
  rect(c, px + 9, py - 5, 2, 8, shade('frost', 1))
  rect(c, px + 6, py - 2, 4, 3, shade('frost', 0))
  rect(c, px + 7, py - 8, 2, 3, shade('metal', 1))
}

const vanity = (c, px, py, furn, part) =>
  counter(c, px, py, furn, part, (c2, x, mid) => part.j % 2 === 0 && basin(c2, x, mid), { h: 6, mat: 'frost', topMat: 'stone' })

// ---- outdoors ----

// a parasol: a pole, and a striped canopy high above the table, a dome with a scalloped edge and a finial in the middle
const parasol = (c, px, py, furn, part) => {
  if (part.i === 1) rect(c, px + 7, py - 12, 2, 16, shade('metal', 2))
  diamond(c, px, py - 18, shade('fabricWarm', part.i % 2 ? 2 : 3))
  ;[4, 8, 8, 4].forEach((w, j) => rect(c, px + 8 - w / 2, py - 20 + j, w, 1, shade('fabricWarm', part.i % 2 ? 3 : 2))) // the crown of the dome
  for (let col = 0; col < 8; col++) {
    const flap = col % 2 ? 2 : 1 // a scalloped edge
    rect(c, px + col, py - 18 + bottomEdge(col), 1, flap, shade('fabricWarm', 1))
    rect(c, px + 15 - col, py - 18 + bottomEdge(col), 1, flap, shade('fabricWarm', 0))
  }
  if (part.i === 1) rect(c, px + 7, py - 23, 2, 3, shade('metal', 3)) // the finial
}

// ---- railings ----

// posts with two rails between them, along the run of the piece (a single tile is just a post)
export const railing = (mat, h) => (c, px, py, furn) => {
  const alongX = furn.w >= furn.h
  if (furn.w * furn.h > 1)
    for (const z of [h, h >> 1])
      for (let t = 0; t <= 8; t++) rect(c, alongX ? px + 4 + t : px + 12 - t, py + 2 + (t >> 1) - z, 1, 1, shade(mat, 1))
  rect(c, px + 7, py + 4 - h, 2, h, shade(mat, 1))
  rect(c, px + 7, py + 4 - h, 1, h, shade(mat, 2))
}

// ---- kitchen and drinks ----

// a run of cabinets with a stone top: a seam between doors and a handle on each tile's faces
const counter = (c, px, py, furn, part, extra, { h = 6, mat = 'wood', topMat = 'stone' } = {}) => {
  blockTop(c, px, py, h, mat, topMat)
  rect(c, px + 4, py - h + bottomEdge(4) + 1, 1, h - 2, shade(mat, 0))
  rect(c, px + 2, py - h + bottomEdge(2) + 2, 1, 2, shade('metal', 2))
  rect(c, px + 12, py - h + bottomEdge(3) + 1, 1, h - 2, shade(mat, 0))
  rect(c, px + 13, py - h + bottomEdge(2) + 2, 1, 2, shade('metal', 1))
  extra?.(c, px, py - h + 3, part)
}

const coffeebar = (c, px, py, furn, part) =>
  counter(c, px, py, furn, part, (c2, x, mid) => {
    if (part.i === 0) {
      rect(c2, x + 5, mid - 8, 6, 8, shade('metal', 1)) // the machine
      rect(c2, x + 5, mid - 8, 6, 1, shade('metal', 3))
      rect(c2, x + 7, mid - 3, 2, 1, shade('metal', 0))
      rect(c2, x + 7, mid - 2, 2, 2, shade('plaster', 3)) // a cup under the spout
      rect(c2, x + 10, mid - 6, 1, 1, shade('light', 3))
    } else {
      rect(c2, x + 5, mid - 2, 2, 2, shade('plaster', 3)) // cups
      rect(c2, x + 9, mid - 2, 2, 2, shade('plaster', 2))
    }
  })

const island = (c, px, py, furn, part) =>
  counter(c, px, py, furn, part, (c2, x, mid) => {
    if (part.i !== 1) return
    rect(c2, x + 6, mid - 2, 4, 2, shade('terracotta', 2)) // a fruit bowl
    rect(c2, x + 6, mid - 3, 2, 1, shade('brick', 2))
    rect(c2, x + 8, mid - 3, 2, 1, shade('light', 2))
  })

// a basin set in a counter's top, with a tap; `mid` is the y of the middle of the top
const basin = (c, x, mid) => {
  rect(c, x + 5, mid - 2, 6, 1, shade('metal', 3))
  rect(c, x + 4, mid - 1, 8, 2, shade('metal', 2))
  rect(c, x + 5, mid + 1, 6, 1, shade('metal', 1))
  rect(c, x + 6, mid - 1, 4, 2, shade('glass', 1))
  rect(c, x + 7, mid - 7, 2, 5, shade('metal', 2))
  rect(c, x + 7, mid - 7, 4, 1, shade('metal', 2))
}
const sink = (c, px, py, furn, part) => counter(c, px, py, furn, part, (c2, x, mid) => part.i === 0 && basin(c2, x, mid))

const stool = (c, px, py) => {
  rect(c, px + 5, py + 4, 6, 1, shade('metal', 0)) // the foot
  rect(c, px + 7, py - 1, 2, 5, shade('metal', 1))
  seatTop(c, px, py, 5, shade('fabricWarm', 2))
  rect(c, px + 6, py - 3, 4, 1, shade('fabricWarm', 3))
}

const cafetable = (c, px, py, furn, part, at) => {
  rect(c, px + 5, py + 4, 6, 1, shade('metal', 0))
  rect(c, px + 7, py - 2, 2, 6, shade('metal', 1))
  ;[6, 10, 10, 6].forEach((w, j) => rect(c, px + 8 - w / 2, py - 4 + j, w, 1, shade('wood', j < 2 ? 3 : 2)))
  if (cellHash(at.x, at.y) % 2) {
    rect(c, px + 9, py - 6, 2, 2, shade('plaster', 3)) // a cup
    rect(c, px + 9, py - 6, 2, 1, shade('fabricWarm', 2))
  }
}

const cooler = (c, px, py) => {
  block(c, px, py, 7, 'frost')
  rect(c, px + 4, py - 7 + bottomEdge(4) + 2, 2, 1, shade('fabricCool', 2)) // a tap
  rect(c, px + 5, py - 14, 6, 10, shade('glass', 2)) // the bottle
  rect(c, px + 5, py - 14, 2, 10, shade('glass', 3))
  rect(c, px + 6, py - 15, 4, 1, shade('glass', 1))
}

const bin = (c, px, py) => {
  rect(c, px + 5, py - 4, 6, 6, shade('metal', 2))
  rect(c, px + 5, py - 4, 2, 6, shade('metal', 3))
  rect(c, px + 9, py - 4, 2, 6, shade('metal', 1))
  rect(c, px + 5, py - 5, 6, 1, shade('metal', 3))
  rect(c, px + 6, py - 5, 4, 1, shade('metal', 0)) // the opening
}

const vending = (c, px, py) => {
  const products = [shade('brick', 2), shade('light', 2), shade('leaf', 2), shade('periwinkle', 2)]
  block(c, px, py, 16, 'fabricCool')
  for (let col = 1; col < 7; col++) {
    const top = py - 16 + bottomEdge(col)
    rect(c, px + col, top + 2, 1, 10, shade('glass', 0)) // the window
    if (col % 2) {
      rect(c, px + col, top + 3, 2, 2, products[(col >> 1) % 4])
      rect(c, px + col, top + 6, 2, 2, products[(col + 1) % 4])
      rect(c, px + col, top + 9, 2, 2, products[(col + 2) % 4])
    }
  }
  for (let col = 1; col < 8; col++) rect(c, px + col, py - 16 + bottomEdge(col), 1, 1, shade('light', 2)) // the sign
  rect(c, px + 11, py - 16 + bottomEdge(4) + 3, 3, 3, shade('metal', 1)) // the coin panel on the other face
  rect(c, px + 12, py - 16 + bottomEdge(3) + 4, 1, 1, shade('light', 3))
}

const fridge = (c, px, py) => {
  block(c, px, py, 14, 'frost')
  for (let col = 1; col < 7; col++) rect(c, px + col, py - 14 + bottomEdge(col) + 5, 1, 1, shade('frost', 0)) // the door line
  rect(c, px + 6, py - 14 + bottomEdge(6) + 1, 1, 3, shade('metal', 1)) // the handles
  rect(c, px + 6, py - 14 + bottomEdge(6) + 7, 1, 3, shade('metal', 1))
}

export const PIECES = {
  sofa: seating('fabricWarm'),
  armchair: seating('fabricCool'),
  coffeetable,
  sidetable,
  pingpong,
  tv,
  counter: (c, px, py, furn, part) => counter(c, px, py, furn, part),
  coffeebar,
  island,
  sink,
  stool,
  cafetable,
  cooler,
  bin,
  vending,
  fridge,
  shelf,
  ceodesk,
  cabinet,
  boardtable,
  reception,
  coatstand,
  umbrella,
  machine,
  rack,
  labbench,
  cubicle,
  urinal,
  vanity,
  parasol,
  rail: railing('metal', 5),
  deckrail: railing('wood', 4),
}

// ---- lights ----

// The lights that blink on a piece, where the art above has its glowing spots: { dx, dy, w, h, pattern, on, off } with
// (dx, dy) from the left and top of the tile's box. The patterns are lights.js's; iso-scene.js draws them over the art
// each frame, and the art itself shows the `on` colour for a light that is out of the frame.
const lamp = (dx, dy, pattern, on, off, w = 1, h = 1) => ({ dx, dy, w, h, pattern, on, off })

export const LIGHTS = {
  // two LEDs to every unit, each at its own pace
  rack: (furn, part, at) =>
    [0, 1, 2, 3].flatMap(unit => [
      lamp(2, -14 + bottomEdge(2) + 2 + unit * 3, 'fast', [shade('leaf', 3), shade('light', 3), shade('leaf', 3), shade('brick', 2)][(unit + at.x + at.y) % 4], shade('metal', 1)),
      lamp(5, -14 + bottomEdge(5) + 2 + unit * 3, unit % 2 ? 'slow' : 'double', [shade('light', 3), shade('leaf', 3), shade('brick', 2), shade('glass', 3)][unit], shade('metal', 1)),
    ]),
  // the screen and two lights on the front of the test machine
  machine: (furn, part) =>
    part.j === furn.h - 1
      ? [
          lamp(2, -10 + bottomEdge(2) + 3, 'fast', shade('glass', 3), shade('glass', 2), 3, 2),
          lamp(5, -10 + bottomEdge(5) + 3, 'slow', shade('light', 3), shade('metal', 0)),
          lamp(5, -10 + bottomEdge(5) + 5, 'double', shade('leaf', 3), shade('metal', 0)),
        ]
      : [],
  // the sign flickers in three pieces, a button blinks on the side
  vending: () => [
    ...[2, 4, 6].map(col => lamp(col, -16 + bottomEdge(col), 'flicker', shade('light', 3), shade('light', 1), 2)),
    lamp(12, -16 + bottomEdge(3) + 4, 'slow', shade('light', 3), shade('metal', 1)),
  ],
  // the picture changes colour, all of it together (and a TV out of step with the next)
  tv: furn =>
    SCREEN.map(col => ({
      dx: col, dy: edgeY('lr', col) - 10, w: 1, h: 6, pattern: 'cycle', on: shade('glass', 2), off: shade('glass', 2),
      colors: [shade('glass', 2), shade('glass', 3), shade('plaster', 3), shade('light', 2), shade('leaf', 2)], phase: (furn.x * 3 + furn.y) % 16,
    })),
  coffeebar: (furn, part) => (part.i === 0 ? [lamp(10, -9, 'slow', shade('light', 3), shade('brick', 2))] : []),
  // the lamp's shade
  sidetable: () => [lamp(5, -10, 'flicker', shade('light', 2), shade('light', 1), 6, 4)],
}
