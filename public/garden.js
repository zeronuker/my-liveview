// The garden round the Studio, in tiles: where the pond, the trees, the bushes, the flower beds, the rocks, the
// fence and the front path's end are. Plain data, so it can be tested; the art is in art/garden.js and
// scenery.js bakes it into the ground. Nothing here is walked on by the Office's people (the grass is solid
// in the studio's grid), so it only has to keep clear of the building.
//
// A tree is named by its trunk cell. A small tree ('round' or 'pine', for the narrow edges) has a crown filling the box one
// tile either side of it and two tiles above; a big one ('biground' or 'bigpine', the size trees really are next to a
// building) fills the box two tiles either side and four above.

const TREES = [
  // the lawn at the top left, and the west edge
  ['biground', 4, 7], ['bigpine', 9, 8], ['round', 2, 21], ['pine', 3, 27], ['round', 2, 34],
  // the lawn in front of the lobby
  ['pine', 3, 41], ['pine', 3, 46], ['biground', 9, 50], ['bigpine', 16, 52], ['pine', 5, 52], ['pine', 21, 52],
  // the east edge, and the bottom right
  ['biground', 45, 6], ['bigpine', 46, 13], ['biground', 45, 21], ['bigpine', 46, 29], ['biground', 45, 37], ['bigpine', 47, 43], ['round', 48, 48], ['pine', 47, 52],
]

export const buildGarden = layout => {
  const path = layout.rooms.find(room => room.name === 'Front path')
  return {
    // the pond: under the terrace, which floats above it, and reaching the boardwalk
    pond: { cx: 36, cy: 47, rx: 9.5, ry: 6 },
    // a fence round the plot, with a gate where the front path goes on to
    fence: { x0: 0, y0: 0, x1: layout.width - 1, y1: layout.height - 1, gate: { x: path.x, w: path.w } },
    // the front path carries on, as stone, from the entrance to the gate (not walked on)
    path: { x: path.x, y: path.y + path.h, w: path.w, h: layout.height - (path.y + path.h) },
    beds: [
      { x: 7, y: 41, w: 3, h: 1 }, { x: 12, y: 41, w: 3, h: 1 }, // under the lobby's windows
      { x: 22, y: 45, w: 1, h: 4 }, { x: 27, y: 42, w: 2, h: 1 }, // by the entrance and the pond
      { x: 23, y: 50, w: 1, h: 3 }, { x: 26, y: 50, w: 1, h: 3 }, // either side of the path to the gate
    ],
    trees: TREES.map(([kind, x, y]) => ({ kind, x, y })),
    bushes: [[6, 41], [10, 41], [11, 41], [14, 43], [22, 53], [27, 53], [44, 22], [43, 31]].map(([x, y]) => ({ x, y })),
    rocks: [[27, 50], [29, 52], [43, 51], [45, 45], [44, 42]].map(([x, y]) => ({ x, y })),
    // the pets, where each starts: the cat and two chickens on the lawn at the front left, the dog and a chicken on the east
    // strip, which is a part of the garden of its own (the building and the pond cut it off)
    pets: [['cat', 13, 45], ['dog', 42, 26], ['chicken', 6, 45], ['chicken', 7, 44], ['chicken', 42, 12]].map(([kind, x, y]) => ({ kind, x, y })),
  }
}

// a cell that is in a room, or in the wall one cell round a room
export const nearBuilding = (layout, x, y) => layout.rooms.some(room => x >= room.x - 1 && x <= room.x + room.w && y >= room.y - 1 && y <= room.y + room.h)

// how many tiles across (and high) a tree's crown box is
export const treeSize = tree => (tree.kind.startsWith('big') ? 5 : 3)

// the cells of a tree's crown and trunk
export const treeCells = tree => {
  const n = treeSize(tree)
  return Array.from({ length: n * n }, (_, i) => [tree.x - (n - 1) / 2 + (i % n), tree.y - (n - 1) + Math.floor(i / n)])
}

// where the pets may walk, as a grid like the studio's ('#' is in the way): the grass inside the fence that is
// not the building, the pond, a tree, a bush, a rock or a flower bed, and the front path, the boardwalk and the
// terrace (the rooms that are outside) wherever nothing stands. That joins the lawn to the terrace over the pond.
export const roamGrid = (layout, garden) => {
  const blocked = new Set()
  const block = (x, y) => blocked.add(`${x},${y}`)
  for (const tree of garden.trees) for (const [x, y] of treeCells(tree)) block(x, y)
  for (const thing of [...garden.bushes, ...garden.rocks]) block(thing.x, thing.y)
  for (const bed of garden.beds) for (let y = bed.y; y < bed.y + bed.h; y++) for (let x = bed.x; x < bed.x + bed.w; x++) block(x, y)
  const within = (room, x, y, margin = 0) => x >= room.x - margin && x < room.x + room.w + margin && y >= room.y - margin && y < room.y + room.h + margin
  const outdoors = layout.rooms.filter(room => room.level === 'outside')
  const indoors = layout.rooms.filter(room => room.level !== 'outside')
  return Array.from({ length: layout.height }, (_, y) =>
    Array.from({ length: layout.width }, (_, x) => {
      if (outdoors.some(room => within(room, x, y))) return layout.grid[y][x] === '#' ? '#' : '.'
      const edge = x < 1 || y < 1 || x >= layout.width - 1 || y >= layout.height - 1
      return edge || indoors.some(room => within(room, x, y, 1)) || blocked.has(`${x},${y}`) || inPond(garden, x, y, 1.12) ? '#' : '.'
    }).join(''),
  )
}

// where the fish may swim, as a grid like roamGrid's ('.' is open water): the pond's water, a little in from its bank, and
// not under the terrace or the boardwalk, which hide it
export const waterGrid = (layout, garden) => {
  const hidden = layout.rooms.filter(room => room.level === 'outside' && (room.name === 'Terrace' || room.name === 'Boardwalk'))
  // the deck's rail and posts stand a tile past the floor, and a fish is up to a tile long, so keep two tiles clear (three below, where its tail trails)
  const under = (x, y) => hidden.some(room => x >= room.x - 2 && x < room.x + room.w + 2 && y >= room.y - 2 && y < room.y + room.h + 3)
  return Array.from({ length: layout.height }, (_, y) => Array.from({ length: layout.width }, (_, x) => (inPond(garden, x, y, 0.92) && !under(x, y) ? '.' : '#')).join(''))
}

// whether the middle of a cell is in the pond, which is made `scale` times bigger about its middle
export const inPond = ({ pond }, x, y, scale = 1) => ((x + 0.5 - pond.cx) / (pond.rx * scale)) ** 2 + ((y + 0.5 - pond.cy) / (pond.ry * scale)) ** 2 < 1
