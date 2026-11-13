// The garden round the Studio, in tiles: where the pond, the trees, the bushes, the flower beds, the rocks, the
// fence and the front path's end are. Plain data, so it can be tested; the art is in art/garden.js and
// scenery.js bakes it into the ground. Nothing here is walked on by the Office's people (the grass is solid
// in the studio's grid), so it only has to keep clear of the building.
//
// A tree is named by its trunk cell: its crown fills the box one tile either side of it and two tiles above.

const TREES = [
  // the lawn at the top left, and the west edge
  ['round', 7, 5], ['pine', 10, 8], ['round', 2, 5], ['pine', 3, 12], ['round', 2, 19], ['pine', 3, 27], ['round', 2, 34],
  // the lawn in front of the lobby
  ['pine', 3, 41], ['pine', 3, 46], ['round', 9, 47], ['round', 16, 48], ['pine', 5, 52], ['round', 12, 52], ['pine', 19, 52],
  // the east edge, and the bottom right
  ['round', 46, 5], ['pine', 47, 11], ['round', 45, 17], ['pine', 46, 24], ['round', 45, 31], ['pine', 47, 37], ['round', 47, 43], ['round', 48, 48], ['pine', 47, 52],
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
    bushes: [[6, 41], [10, 41], [11, 41], [14, 43], [22, 53], [27, 53], [44, 22], [43, 35]].map(([x, y]) => ({ x, y })),
    rocks: [[27, 50], [29, 52], [43, 51], [45, 45], [44, 42]].map(([x, y]) => ({ x, y })),
  }
}

// whether the middle of a cell is in the pond, which is made `scale` times bigger about its middle
export const inPond = ({ pond }, x, y, scale = 1) => ((x + 0.5 - pond.cx) / (pond.rx * scale)) ** 2 + ((y + 0.5 - pond.cy) / (pond.ry * scale)) ** 2 < 1
