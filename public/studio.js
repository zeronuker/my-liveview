// The Garden Studio: the renovated Office floor plan, in tiles (docs/office-design-brief.md).
// Plain data, so it can be tested. The stage walks people over it, scenery.js draws it
// and layout.js fits it on the canvas.
//
// One grid for the whole world. Every cell starts as a wall ('#'); rooms, doors and
// stairs are carved out of it, so people can only get from one room to another through
// a door, an archway or a stair. Walls are one tile thick and shared by neighbours.
//
// Levels (kept in each room): 'first' (the CEO suite), 'ground', 'mezzanine' (the lobby and
// the open office), 'outside' (the gate path, the boardwalk, the terrace) and 'stairs'. A person
// may change level only on a stair cell or when going out of or into the building.
//
// rooms: [{ name, x, y, w, h, tone, level }]  the floor to draw (inside the walls); a stairs room also says which end
//        is `high` ('north' or 'south') and may have a `runner` (a carpet)
// doors: [{ kind, x, y, w, h, level }]        open cells in a wall: swing, double, sliding, arch
// windows: [{ kind, x, y, w, h }]             on solid wall cells: 'window' or a 'glass' wall
// wallArt: [{ kind, x, y, w, h }]             hung on a wall's face: a 'whiteboard' or a 'picture'
// rugs: [{ kind, x, y, w, h }]                'rug' or 'mat' on the floor; lights: [{ x, y, rx, ry }] pools of light
// furniture: [{ kind, x, y, w, h, solid }]    solid ones are '#' in the grid (a desk, a rail)
// spots (breaks: where an idle worker goes; huddle: the meeting room's chairs, where helpers plan): where people stand for each kind of job. A seat also says which way it faces and,
//        for a desk seat, which desk cell is in front of it.

export const buildStudio = () => {
  const width = 51 // the building is 47 by 49; the rest is garden, added on the right and the bottom
  const height = 55
  const cells = Array.from({ length: height }, () => Array(width).fill('#'))
  const rooms = []
  const doors = []
  const furniture = []

  const carve = (x, y, w, h) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) cells[j][i] = '.'
  }
  const room = (name, x, y, w, h, tone, level = 'ground', extra = {}) => {
    rooms.push({ name, x, y, w, h, tone, level, ...extra })
    carve(x, y, w, h)
  }
  const door = (kind, x, y, w = 1, h = 1, level = 'ground') => {
    doors.push({ kind, x, y, w, h, level })
    carve(x, y, w, h)
  }
  // `tone` names the colours a sofa or chair is drawn in, when not its usual ones
  const block = (kind, x, y, w = 1, h = 1, face, tone) => {
    furniture.push({ kind, x, y, w, h, solid: true, ...(face ? { face } : {}), ...(tone ? { tone } : {}) })
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) cells[j][i] = '#'
  }
  const lay = (kind, x, y, w = 1, h = 1, face, tone) => furniture.push({ kind, x, y, w, h, solid: false, ...(face ? { face } : {}), ...(tone ? { tone } : {}) })

  // first floor: the CEO suite (rows 2 to 9)
  room('Small conference', 13, 2, 7, 8, 'glass', 'first')
  room('CEO office', 21, 2, 12, 8, 'blue', 'first')
  room('CEO foyer', 34, 2, 7, 8, 'lilac', 'first')
  door('swing', 20, 8, 1, 1, 'first') // conference to office, swings into the conference room
  door('swing', 33, 8, 1, 1, 'first') // foyer to office, swings into the office

  // ground floor: the back rooms (rows 11 to 16), each with a door in the wall at row 17
  // the row reaches two tiles further west than it did, so each bathroom is three wide: fixtures along a wall, an aisle, a counter
  room('File room', 4, 11, 4, 6, 'gray')
  room('Test lab', 9, 11, 4, 6, 'teal')
  room('Server room', 14, 11, 3, 6, 'dark')
  room("Men's bathroom", 18, 11, 3, 6, 'tile')
  room("Women's bathroom", 22, 11, 3, 6, 'tile')
  room('Meeting room', 26, 11, 10, 6, 'glass')
  room('CEO stairwell', 37, 16, 4, 1, 'stone')
  door('swing', 7, 17) // file room, right end
  door('swing', 12, 17) // test lab, right end
  door('swing', 14, 17) // server room, left end
  door('swing', 18, 17) // men, left end
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
  room('CEO stairs', 37, 10, 4, 6, 'stone', 'stairs', { high: 'north', runner: 'carpet' }) // ground to the foyer
  room('Stairs A', 23, 28, 3, 6, 'stone', 'stairs', { high: 'south' }) // the lobby down to the main street
  room('Stairs B', 19, 20, 3, 4, 'stone', 'stairs', { high: 'south' }) // the main street up to the open office

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
      block('desk', dx, y, 2, 1, 'down') // a desk and a chair face the way whoever sits there does
      block('desk', dx, y + 1, 2, 1, 'up')
      lay('chair', dx, y - 1, 1, 1, 'down')
      lay('chair', dx, y + 2, 1, 1, 'up')
      desks.push({ x: dx, y: y - 1, face: 'down', desk: { x: dx, y } }, { x: dx, y: y + 2, face: 'up', desk: { x: dx, y: y + 1 } })
    }
  }
  island(7, 24, 3) // six desks
  island(14, 25, 2) // four desks
  island(12, 29, 2) // four desks
  block('desk', 8, 28, 1, 2, 'right') // a pair of desks side by side, chairs left and right
  block('desk', 9, 28, 1, 2, 'left')
  lay('chair', 7, 28, 1, 1, 'right')
  lay('chair', 10, 28, 1, 1, 'left')
  desks.push({ x: 7, y: 28, face: 'right', desk: { x: 8, y: 28 } }, { x: 10, y: 28, face: 'left', desk: { x: 9, y: 28 } })

  // plants in the open office: the corners, by the rail and between the islands
  for (const [x, y] of [[6, 21], [17, 21], [6, 32], [11, 27], [16, 32], [21, 32]]) block('plant', x, y)

  // the manager's desk at the lower east edge of the open office, with the tray
  block('desk', 19, 29, 1, 2, 'left')
  lay('chair', 20, 29, 1, 1, 'left')
  block('tray', 18, 29)

  // the CEO's desk, and the leather chair behind it
  block('ceodesk', 26, 4, 3, 1, 'down')
  lay('chair', 27, 3, 1, 1, 'down', 'leather')
  // the rest of the CEO office: two visitor chairs facing the desk, a leather sofa with a coffee table in front of it,
  // shelves on the west wall, a drinks cabinet under the windows, and plants. The doors' floor cells stay clear.
  for (const x of [25, 28]) block('chair', x, 6, 1, 1, 'up', 'fabricWarm')
  block('sofa', 25, 9, 4, 1, 'up', 'leather')
  block('coffeetable', 27, 8)
  block('shelf', 21, 3, 1, 4)
  block('cabinet', 22, 2, 2, 1)
  for (const [x, y] of [[21, 2], [32, 2], [32, 9], [21, 9]]) block('plant', x, y)
  // the foyer: a leather bench under a picture, a lamp and plants
  lay('sofa', 35, 2, 3, 1, 'down', 'leather')
  block('sidetable', 38, 2)
  for (const [x, y] of [[34, 2], [39, 2]]) block('plant', x, y)
  // the small conference room: a table with three chairs a side, a TV on the east wall, plants
  block('boardtable', 15, 5, 3, 2)
  for (let x = 15; x < 18; x++) lay('chair', x, 4, 1, 1, 'down'), lay('chair', x, 7, 1, 1, 'up')
  block('tv', 19, 4, 1, 2)
  for (const [x, y] of [[13, 2], [13, 9]]) block('plant', x, y)

  // the file room: shelves down the sides, an aisle between
  block('shelf', 4, 11, 1, 6)
  block('shelf', 7, 11, 1, 5)
  const files = []
  for (const y of [11, 12, 13, 14, 15, 16]) for (const x of [5, 6]) files.push({ x, y })

  // the test lab: a machine with a place on every side
  block('machine', 10, 13, 2, 2)
  const lab = [
    { x: 10, y: 12 }, { x: 11, y: 12 }, { x: 10, y: 15 }, { x: 11, y: 15 },
    { x: 9, y: 13 }, { x: 9, y: 14 }, { x: 12, y: 13 }, { x: 12, y: 14 },
  ]

  // sofa seats, the nearest first: the hub, the lounge, then the lobby's waiting lounge
  const seats = []
  const sofa = (x, y, w, h, face, kind = 'sofa', tone) => {
    lay(kind, x, y, w, h, face, tone) // the way the people on it face is the way it faces
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) seats.push({ x: i, y: j, face })
  }
  // the social hub: a sofa and two armchairs round a coffee table, facing the TV on the east wall
  sofa(34, 24, 1, 3, 'right', 'sofa', 'terracotta')
  sofa(36, 24, 1, 1, 'down', 'armchair', 'sage')
  sofa(36, 26, 1, 1, 'up', 'armchair', 'slate')
  block('coffeetable', 36, 25)
  block('tv', 40, 25, 1, 2)
  block('pingpong', 28, 21, 3, 2)
  for (const [x, y] of [[40, 20], [40, 31], [27, 31]]) block('plant', x, y)
  sofa(36, 37, 3, 1, 'up', 'sofa', 'fabricWarm') // the lounge
  sofa(6, 36, 1, 2, 'right')
  sofa(9, 38, 2, 1, 'up', 'sofa', 'slate')
  sofa(14, 35, 1, 1, 'left', 'armchair', 'sage')
  sofa(14, 38, 1, 1, 'left', 'armchair', 'periwinkle')
  block('coffeetable', 10, 37)
  block('sidetable', 14, 36) // with a lamp, between the armchairs
  for (const [x, y] of [[6, 34], [6, 39], [13, 34], [21, 35], [16, 40]]) block('plant', x, y)
  block('coatstand', 21, 41) // by the front doors
  block('umbrella', 21, 42)

  // other things that are in the way
  // the server room: two rows of racks with an aisle between, the back row facing it, and a free column from the door
  for (const x of [14, 15, 16]) block('rack', x, 11)
  for (const x of [15, 16]) block('rack', x, 13, 1, 1, 'up')
  // the men's: four urinals along the west wall and a sink counter along the east one; the women's: three cubicles with
  // a toilet each along the west wall and the same counter on the east. The aisle between stays clear, and so does the way in.
  for (const y of [11, 12, 13, 14]) block('urinal', 18, y)
  block('vanity', 20, 11, 1, 4, 'left')
  for (const y of [11, 13, 15]) block('cubicle', 22, y, 1, 2, 'right', 'lilac')
  block('vanity', 24, 11, 1, 4, 'left')
  block('labbench', 9, 11, 2, 1) // the test lab: benches along the north wall
  block('labbench', 11, 11, 2, 1)
  // the meeting room: a board table with five chairs a side, a TV on the east wall, plants, and a whiteboard
  block('boardtable', 28, 13, 5, 2)
  const huddle = [] // helpers gather in these chairs to plan
  for (let x = 28; x < 33; x++) {
    lay('chair', x, 12, 1, 1, 'down'), lay('chair', x, 15, 1, 1, 'up')
    huddle.push({ x, y: 12, face: 'down' }, { x, y: 15, face: 'up' })
  }
  block('tv', 35, 14, 1, 2)
  for (const [x, y] of [[26, 11], [35, 11]]) block('plant', x, y)
  // the vending area: three machines, a water cooler and a bin
  for (const x of [28, 29, 30]) block('vending', x, 33)
  block('cooler', 33, 33)
  block('bin', 35, 33)
  // the lounge and pantry: two more machines, an island with stools, the counter along the south wall, a fridge
  for (const x of [28, 29]) block('vending', x, 35)
  block('island', 31, 37, 3, 1)
  for (const x of [31, 32, 33]) lay('stool', x, 38)
  block('counter', 29, 40, 2, 1)
  block('sink', 31, 40, 2, 1)
  block('counter', 33, 40, 2, 1)
  block('coffeebar', 35, 40, 2, 1)
  block('fridge', 37, 39, 1, 2)
  for (const [x, y] of [[40, 35], [27, 40]]) block('plant', x, y)
  // the terrace: two tables with chairs, plants, and a railing round the deck's edge
  for (const x of [34, 38]) block('cafetable', x, 44)
  for (const [x, y, face] of [[33, 44, 'right'], [35, 44, 'left'], [37, 44, 'right'], [39, 44, 'left']]) lay('chair', x, y, 1, 1, face)
  for (const [x, y] of [[31, 42], [40, 42]]) block('plant', x, y)
  block('deckrail', 31, 47, 10, 1)
  block('deckrail', 41, 42, 1, 5)
  block('deckrail', 30, 42, 1, 3)
  block('deckrail', 30, 46, 1, 1)
  block('reception', 17, 42, 3, 1) // reception: the long side, and the short arm
  block('reception', 19, 40, 1, 2)

  // things on the floor that are walked over: rugs and mats (a rug lies under the furniture on it), and
  // pools of light, in tiles from the middle (a lamp lights the floor round it)
  const rugs = [
    { kind: 'rug', shape: 'rect', pattern: 'diamond', x: 7, y: 35, w: 7, h: 4 },
    { kind: 'rug', tone: 'periwinkle', x: 33, y: 23, w: 7, h: 6 },
    { kind: 'rug', tone: 'sage', shape: 'rect', pattern: 'stripes', x: 34, y: 36, w: 6, h: 3 },
    { kind: 'mat', x: 24, y: 42, w: 2, h: 1 },
    { kind: 'rug', tone: 'carpet', shape: 'rect', pattern: 'diamond', x: 24, y: 5, w: 6, h: 4 }, // the CEO's, under the visitor chairs
    { kind: 'rug', tone: 'sage', shape: 'rect', pattern: 'check', x: 35, y: 4, w: 5, h: 3 }, // the foyer's
  ]
  const lights = [
    { x: 10.5, y: 37, rx: 4.6, ry: 2.6 },
    { x: 14.5, y: 36.5, rx: 1.6, ry: 1.6 },
    { x: 29.5, y: 22, rx: 2.6, ry: 2 }, // over the ping-pong table
    { x: 32.5, y: 37.5, rx: 2.8, ry: 1.8 }, // over the island
    { x: 27, y: 7, rx: 3.4, ry: 2.2 }, // over the CEO's rug
    { x: 38.5, y: 3.3, rx: 1.6, ry: 1.3 }, // the foyer lamp
  ]

  // windows: on solid wall cells. A window one cell high is seen on the face of a wall that runs
  // east to west; one more than one cell high on the cap of a wall that runs north to south.
  // 'glass' is a clear glass wall.
  const windows = []
  const win = (x, y, w, h = 1, kind = 'window') => windows.push({ x, y, w, h, kind })
  win(14, 1, 2) // the top wall of the first floor: conference room
  win(17, 1, 2)
  win(22, 1, 3) // and the CEO office
  win(29, 1, 3)
  win(41, 3, 1, 3) // the foyer, east wall
  win(14, 10, 6, 1, 'glass') // the conference room's glass wall
  win(11, 10, 2) // north walls of the back rooms: lab, bathrooms, meeting room
  win(20, 10, 1)
  win(23, 10, 2)
  win(27, 10, 3)
  win(32, 10, 3)
  win(27, 17, 9, 1, 'glass') // the meeting room's glass wall toward the street
  win(5, 22, 1, 3) // the open office, west wall
  win(5, 26, 1, 3)
  win(5, 30, 1, 3)
  win(5, 35, 1, 2) // the lobby, west wall
  win(5, 38, 1, 2)
  win(7, 40, 3) // the lobby, south wall
  win(12, 40, 3)
  win(16, 43, 8, 1, 'glass') // the glass front of the entrance
  win(41, 21, 1, 4) // the social hub, east wall
  win(41, 27, 1, 4)
  win(41, 36, 1, 3) // the lounge, east wall
  win(31, 41, 3) // and its south wall, over the pantry counter
  win(35, 41, 2)

  // things hung on the face of a wall (one cell high, like a window)
  // where someone with nothing to do goes for a break: a cell to stand on and what to say they are doing
  const breaks = [
    { x: 29, y: 32, label: 'Snack' }, // the vending machines
    { x: 28, y: 36, label: 'Snack' },
    { x: 35, y: 39, label: 'Coffee' }, // the coffee bar
    { x: 36, y: 39, label: 'Coffee' },
    { x: 32, y: 39, label: 'Lunch' }, // the island
    { x: 29, y: 24, label: 'Ping-pong' }, // the hub's table
    { x: 38, y: 23, label: 'Chatting' },
    { x: 36, y: 45, label: 'Fresh air' }, // the terrace
  ]

  const wallArt = [
    { kind: 'whiteboard', x: 30, y: 10, w: 2, h: 1 }, // the meeting room, between its windows
    { kind: 'picture', x: 26, y: 1, w: 2, h: 1 }, // the CEO office, behind the chair
    { kind: 'picture', x: 36, y: 1, w: 2, h: 1 }, // and the foyer, over the bench
  ]

  return {
    width,
    height,
    groundTop: 10, // rows above this are the first floor
    grid: cells.map(row => row.join('')),
    rooms,
    doors,
    windows,
    wallArt,
    rugs,
    lights,
    furniture,
    spots: {
      entrance: { x: 24, y: 48 },
      files,
      breaks,
      huddle,
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
