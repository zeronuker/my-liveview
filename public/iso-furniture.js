// The angled view's furniture, one drawer for each kind. A drawer paints one tile of a piece: (c, px, py, furn, part, at),
// where `part` says which tile of the piece it is ({ i, j, w, h }, counted from its top corner) and `at` is the tile
// ({ x, y }). Pieces are drawn a tile at a time, back to front, so a tile's neighbours in the same piece cover its
// inner faces; only the outer faces and what stands on top need care. Heights are in pixels (a person is 11 tall).
// Light is from the top-left: left faces (towards +y) are lighter than right faces (towards +x). Palette colours only.
import { BACK, BEHIND, block, blockTop, bottomEdge, cellHash, rect, seatTop, slab, table, topEdge } from './iso-draw.js'
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

// a TV on a stand, seen from the side: a thin dark panel along the +x edge
const tv = (c, px, py) => {
  block(c, px, py, 3, 'wood')
  slab(c, px, py, 3, 'lr', 9, shade('metal', 0), shade('metal', 2))
}

// ---- kitchen and drinks ----

// a run of cabinets with a stone top: a seam between doors and a handle on each tile's faces
const counter = (c, px, py, furn, part, extra) => {
  const h = 6
  blockTop(c, px, py, h, 'wood', 'stone')
  rect(c, px + 4, py - h + bottomEdge(4) + 1, 1, h - 2, shade('wood', 0))
  rect(c, px + 2, py - h + bottomEdge(2) + 2, 1, 2, shade('metal', 2))
  rect(c, px + 12, py - h + bottomEdge(3) + 1, 1, h - 2, shade('wood', 0))
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
  rect(c, px + 11, py - 16 + bottomEdge(4) + 3, 3, 3, shade('metal', 1)) // the coin panel on the other face
  rect(c, px + 12, py - 16 + bottomEdge(3) + 4, 1, 1, shade('light', 3))
}

const fridge = (c, px, py) => {
  block(c, px, py, 14, 'frost')
  for (let col = 1; col < 7; col++) rect(c, px + col, py - 14 + bottomEdge(col) + 5, 1, 1, shade('frost', 0)) // the door line
  rect(c, px + 6, py - 14 + bottomEdge(6) + 1, 1, 3, shade('metal', 1)) // the handles
  rect(c, px + 6, py - 14 + bottomEdge(6) + 7, 1, 3, shade('metal', 1))
}

// kinds that have no drawer yet: a plain box of this material and height
export const PLAIN = {
  ceodesk: ['leather', 6], shelf: ['wood', 18], cabinet: ['wood', 7], boardtable: ['wood', 5], machine: ['metal', 12],
  rail: ['metal', 4], rack: ['metal', 14], reception: ['wood', 7], labbench: ['metal', 6], cubicle: ['tile', 10],
  urinal: ['frost', 8], vanity: ['frost', 6], coatstand: ['wood', 14], umbrella: ['fabricCool', 4], parasol: ['fabricWarm', 3],
  deckrail: ['wood', 3],
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
}
