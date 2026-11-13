// The Garden Studio: the renovated Office floor plan, in tiles (docs/office-design-brief.md).
// Plain data, so it can be tested. It is not drawn or walked yet: the Office still
// uses layout.js until the stage and the art are switched over.
//
// One grid for the whole world. Every cell starts as a wall ('#'); rooms, doors and
// stairs are carved out of it, so people can only get from one room to another through
// a door, an archway or a stair. Walls are one tile thick and shared by neighbours.
//
// Levels (kept in each room): 'first' (the CEO suite), 'ground', 'mezzanine' (the lobby and
// the open office), 'outside' (the gate path, the boardwalk, the terrace) and 'stairs'. A person
// may change level only on a stair cell or when going out of or into the building.
//
// rooms: [{ name, x, y, w, h, tone, level }]  the floor to draw (inside the walls)
// doors: [{ kind, x, y, w, h, level }]        open cells in a wall: swing, double, sliding, arch
// furniture: [{ kind, x, y, w, h, solid }]    solid ones are '#' in the grid (a desk, a rail)
// spots: where people stand for each kind of job. A seat also says which way it faces and,
//        for a desk seat, which desk cell is in front of it.

export const buildStudio = () => {
  const width = 47
  const height = 49
  const cells = Array.from({ length: height }, () => Array(width).fill('#'))
  const rooms = []
  const doors = []
  const furniture = []

  const carve = (x, y, w, h) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) cells[j][i] = '.'
  }
  const room = (name, x, y, w, h, tone, level = 'ground') => {
    rooms.push({ name, x, y, w, h, tone, level })
    carve(x, y, w, h)
  }
  const door = (kind, x, y, w = 1, h = 1, level = 'ground') => {
    doors.push({ kind, x, y, w, h, level })
    carve(x, y, w, h)
  }
  const block = (kind, x, y, w = 1, h = 1) => {
    furniture.push({ kind, x, y, w, h, solid: true })
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) cells[j][i] = '#'
  }
  const lay = (kind, x, y, w = 1, h = 1) => furniture.push({ kind, x, y, w, h, solid: false })

  // first floor: the CEO suite (rows 2 to 9)
  room('Small conference', 13, 2, 7, 8, 'glass', 'first')
  room('CEO office', 21, 2, 12, 8, 'blue', 'first')
  room('CEO foyer', 34, 2, 7, 8, 'lilac', 'first')
  door('swing', 20, 8, 1, 1, 'first') // conference to office, swings into the conference room
  door('swing', 33, 8, 1, 1, 'first') // foyer to office, swings into the office

  // ground floor: the back rooms (rows 11 to 16), each with a door in the wall at row 17
  room('File room', 6, 11, 4, 6, 'gray')
  room('Test lab', 11, 11, 4, 6, 'teal')
  room('Server room', 16, 11, 3, 6, 'dark')
  room("Men's bathroom", 20, 11, 2, 6, 'tile')
  room("Women's bathroom", 23, 11, 2, 6, 'tile')
  room('Meeting room', 26, 11, 10, 6, 'glass')
  room('CEO stairwell', 37, 16, 4, 1, 'stone')
  door('swing', 6, 17) // file room, left end
  door('swing', 14, 17) // test lab, right end
  door('swing', 16, 17) // server room, left end
  door('swing', 20, 17) // men, left end
  door('swing', 24, 17) // women, right end
  door('swing', 26, 17) // meeting room, left end
  door('double', 37, 17, 4, 1) // the CEO stairs: in the middle, across the whole width

  // ground floor: the main street, the social wing
  room('Main street', 6, 18, 35, 2, 'street')
  room('Corridor', 23, 20, 4, 8, 'street')
  room('Social hub', 27, 20, 14, 12, 'honey')
  room('Vending area', 27, 32, 14, 2, 'honey')
  room('Lounge and pantry', 27, 35, 14, 6, 'honey')
  door('arch', 38, 34, 3, 1) // vending area to the lounge
  door('sliding', 38, 41, 3, 1) // lounge to the terrace

  // mezzanine: the open office (no walls, guardrails) and the lobby
  room('Open office', 6, 21, 16, 12, 'sage', 'mezzanine')
  room('Lobby', 6, 34, 20, 6, 'sage', 'mezzanine')
  room('Entrance', 16, 40, 10, 3, 'sage', 'mezzanine')
  door('sliding', 24, 43, 2, 1, 'mezzanine') // the front doors: double, at the right end

  // stairs (after the rooms they cross, so they win when asked what is at a cell)
  room('CEO stairs', 37, 10, 4, 6, 'stone', 'stairs') // ground to the foyer
  room('Stairs A', 23, 28, 3, 6, 'stone', 'stairs') // the lobby down to the main street
  room('Stairs B', 19, 20, 3, 4, 'stone', 'stairs') // the main street up to the open office

  // outside
  room('Front path', 24, 44, 2, 5, 'path', 'outside')
  room('Boardwalk', 26, 45, 5, 1, 'wood', 'outside')
  room('Terrace', 31, 42, 10, 5, 'wood', 'outside')

  // guardrails round the open office, open at the stairs; the rails along the stairs
  block('rail', 6, 20, 13, 1)
  block('rail', 18, 21, 1, 3)
  block('rail', 22, 20, 1, 13)
  block('rail', 26, 28, 1, 6)

  // the desks: four islands, chairs on both sides (a chair faces its desk)
  const desks = []
  const island = (x, y, count) => {
    for (let i = 0; i < count; i++) {
      const dx = x + i * 2
      block('desk', dx, y, 2, 1)
      block('desk', dx, y + 1, 2, 1)
      lay('chair', dx, y - 1)
      lay('chair', dx, y + 2)
      desks.push({ x: dx, y: y - 1, face: 'down', desk: { x: dx, y } }, { x: dx, y: y + 2, face: 'up', desk: { x: dx, y: y + 1 } })
    }
  }
  island(7, 24, 3) // six desks
  island(14, 25, 2) // four desks
  island(12, 29, 2) // four desks
  block('desk', 8, 28, 1, 2) // a pair of desks side by side, chairs left and right
  block('desk', 9, 28, 1, 2)
  lay('chair', 7, 28)
  lay('chair', 10, 28)
  desks.push({ x: 7, y: 28, face: 'right', desk: { x: 8, y: 28 } }, { x: 10, y: 28, face: 'left', desk: { x: 9, y: 28 } })

  // the manager's desk at the lower east edge of the open office, with the tray
  block('desk', 19, 29, 1, 2)
  lay('chair', 20, 29)
  block('tray', 18, 29)

  // the CEO's desk, and the chair behind it
  block('desk', 25, 4, 6, 1)
  lay('chair', 27, 3)

  // the file room: shelves down the sides, an aisle between
  block('shelf', 6, 11, 1, 5)
  block('shelf', 9, 11, 1, 6)
  const files = []
  for (const y of [11, 12, 13, 14, 15, 16]) for (const x of [7, 8]) files.push({ x, y })

  // the test lab: a machine with a place on every side
  block('machine', 12, 13, 2, 2)
  const lab = [
    { x: 12, y: 12 }, { x: 13, y: 12 }, { x: 12, y: 15 }, { x: 13, y: 15 },
    { x: 11, y: 13 }, { x: 11, y: 14 }, { x: 14, y: 13 }, { x: 14, y: 14 },
  ]

  // sofa seats, the nearest first: the hub, the lounge, then the lobby's waiting lounge
  const seats = []
  const sofa = (x, y, w, h, face) => {
    lay('sofa', x, y, w, h)
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) seats.push({ x: i, y: j, face })
  }
  sofa(38, 24, 1, 4, 'right')
  block('tv', 40, 24, 1, 4)
  sofa(35, 37, 4, 1, 'up')
  sofa(6, 35, 1, 4, 'right')
  sofa(8, 38, 4, 1, 'up')
  sofa(14, 35, 1, 1, 'left')
  sofa(14, 38, 1, 1, 'left')
  block('table', 9, 36, 2, 2)

  // other things that are in the way
  block('rack', 16, 11, 3, 2)
  block('stall', 20, 11, 2, 2)
  block('stall', 23, 11, 2, 2)
  block('table', 28, 14, 6, 1)
  block('tv', 35, 13, 1, 3)
  block('table', 15, 4, 3, 2)
  block('vending', 28, 33, 3, 1)
  block('cooler', 33, 33)
  block('vending', 28, 35, 2, 1)
  block('island', 31, 37, 3, 1)
  block('counter', 29, 40, 8, 1)
  block('counter', 17, 42, 3, 1) // reception: the long side, and the short arm
  block('counter', 19, 40, 1, 2)

  return {
    width,
    height,
    groundTop: 10, // rows above this are the first floor
    grid: cells.map(row => row.join('')),
    rooms,
    doors,
    furniture,
    spots: {
      entrance: { x: 24, y: 48 },
      files,
      seats,
      desks,
      lab,
      handIn: { x: 18, y: 28 },
      managerSeat: { x: 20, y: 29, face: 'left', desk: { x: 19, y: 29 } },
      ceoSeat: { x: 27, y: 3, face: 'down', desk: { x: 27, y: 4 } },
      ceoDelivery: { x: 27, y: 5 },
      ceoDoor: { x: 34, y: 8 },
      stairsBottom: { x: 38, y: 16 },
      stairsTop: { x: 38, y: 9 },
    },
  }
}

// The level of a cell ('first', 'ground', 'mezzanine', 'outside', 'stairs'), or null in a wall.
export const levelAt = (layout, x, y) => {
  const inside = r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h
  return (layout.rooms.findLast(inside) ?? layout.doors.find(inside))?.level ?? null
}
