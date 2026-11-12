// The Office's floor plan, in tiles. Plain data, so it can be tested; stage.js
// walks people over it and office.js draws it.
//
// Two floors in one grid: the CEO's office upstairs (rows 0-6), then a floor
// between (row 7), then the ground floor (rows 8-21). The stairs on the right
// are open all the way up and down, and are the only way through the floor.
//
// grid: rows of text, '#' is in the way (a wall, a desk, a shelf)
// rooms: [{ name, x, y, w, h, tone }]  to draw
// furniture: [{ kind, x, y, w, h, solid }]  to draw; the solid ones are also '#' in
//            the grid (a desk, a shelf), the rest are walked over (a chair, a sofa
//            that is sat on)
// Seats are on the far side of a desk from the viewer: the person sits behind
// it, facing the room, and the desk hides their legs.
// spots: where people stand for each kind of job; each is { x, y }

export const buildLayout = () => {
  const width = 38
  const height = 22
  const groundTop = 8
  const cells = Array.from({ length: height }, () => Array(width).fill('#'))
  const open = (x0, y0, x1, y1) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) cells[y][x] = '.'
  }
  const furniture = []
  const block = (kind, x, y, w = 1, h = 1) => {
    furniture.push({ kind, x, y, w, h, solid: true })
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) cells[j][i] = '#'
  }
  // furniture people walk over or sit on
  const lay = (kind, x, y, w = 1, h = 1) => furniture.push({ kind, x, y, w, h, solid: false })

  open(0, groundTop, 34, 21) // the ground floor
  open(22, 0, 34, 6) // the CEO's floor
  open(35, 0, 37, 21) // the stairs: up and down, through the floor between

  const rooms = [
    { name: 'File room', x: 0, y: groundTop, w: 5, h: 14, tone: 'gray' },
    { name: 'Lounge', x: 5, y: groundTop, w: 6, h: 14, tone: 'teal' },
    { name: 'Desks', x: 11, y: groundTop, w: 14, h: 14, tone: 'purple' },
    { name: 'Manager', x: 25, y: groundTop, w: 5, h: 14, tone: 'amber' },
    { name: 'Test lab', x: 30, y: groundTop, w: 5, h: 14, tone: 'coral' },
    { name: 'Stairs', x: 35, y: 0, w: 3, h: height, tone: 'gray' },
    { name: "CEO's office", x: 22, y: 0, w: 13, h: 7, tone: 'blue' },
  ]

  // the file room: shelves down both sides, an aisle between
  block('shelf', 0, 9, 1, 12)
  block('shelf', 4, 9, 1, 12)
  const files = []
  for (const y of [10, 13, 16, 19]) for (const x of [1, 2, 3]) files.push({ x, y })

  // the lounge: three sofas, each with three seats on it
  const seats = []
  for (const y of [10, 14, 18]) {
    lay('sofa', 6, y, 3, 1)
    for (const x of [6, 7, 8]) seats.push({ x, y })
  }

  // the desks: four across, four down, a chair above each (the desk is in front of it)
  const desks = []
  for (const y of [10, 13, 16, 19])
    for (const x of [12, 15, 18, 21]) {
      block('desk', x, y, 2, 1)
      lay('chair', x, y - 1)
      desks.push({ x, y: y - 1 })
    }

  // the manager's desk, with a tray beside it where work is handed in
  block('desk', 27, 11, 2, 1)
  lay('chair', 27, 10)
  block('tray', 26, 11, 1, 1)

  // plants in two corners
  block('plant', 10, 8)
  block('plant', 24, 8)

  // the test lab: a machine with places around it
  block('machine', 32, 10, 2, 3)
  const lab = [
    { x: 31, y: 10 }, { x: 31, y: 11 }, { x: 31, y: 12 },
    { x: 32, y: 13 }, { x: 33, y: 13 }, { x: 34, y: 12 },
    { x: 34, y: 11 }, { x: 34, y: 10 },
  ]

  // the CEO's desk, with the CEO's chair behind it
  block('desk', 28, 2, 3, 1)
  lay('chair', 29, 1)

  return {
    width,
    height,
    groundTop,
    grid: cells.map(row => row.join('')),
    rooms,
    furniture,
    spots: {
      entrance: { x: 9, y: 21 },
      files,
      seats,
      desks,
      lab,
      handIn: { x: 26, y: 10 },
      managerSeat: { x: 27, y: 10 },
      ceoSeat: { x: 29, y: 1 },
      ceoDelivery: { x: 29, y: 3 },
      ceoDoor: { x: 24, y: 4 },
      stairsBottom: { x: 36, y: 20 },
      stairsTop: { x: 36, y: 1 },
    },
  }
}

// How big a tile is, and where the plan starts, to fit the plan in a canvas
// of this size (in CSS pixels) with a little room round the edge.
export const fit = (canvasWidth, canvasHeight, layout, margin = 8) => {
  const tile = Math.max(1, Math.min((canvasWidth - 2 * margin) / layout.width, (canvasHeight - 2 * margin) / layout.height))
  return { tile, left: (canvasWidth - tile * layout.width) / 2, top: (canvasHeight - tile * layout.height) / 2 }
}
