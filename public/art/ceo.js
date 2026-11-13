// The CEO suite's own furniture: the executive desk and the drinks cabinet. Rectangles
// ['r', x, y, w, h, colour] in pixels, palette colours only, light from the top-left. The suite's sofa,
// chairs, shelves, rugs and pictures come from the shared art, in the suite's own colours.
import { RAMPS } from '../palette.js'

const TILE = 16
const r = (x, y, w, h, color) => ['r', x, y, w, h, color]
const [wood, metal, plaster, glass, brick, leaf, light, leather] = [
  RAMPS.wood, RAMPS.metal, RAMPS.plaster, RAMPS.glass, RAMPS.brick, RAMPS.leaf, RAMPS.light, RAMPS.leather,
]

// The CEO's desk, three tiles by one (about two metres), for someone sitting north of it: dark wood with a drawer pedestal
// at each end and a brass nameplate on the front, two monitors seen from behind, a leather blotter with a keyboard, a
// green lamp and a pile of papers.
const ceoDeskOps = ({ w }) => {
  const W = w * TILE
  if (W < 64)
    return [
      r(0, 0, W, 10, wood[1]), r(0, 0, W, 1, wood[2]), r(0, 0, 1, 10, wood[2]), r(W - 1, 1, 1, 9, wood[0]), // the top
      r(0, 10, W, 6, wood[0]), r(0, 10, W, 1, wood[1]), // the front
      r(2, 11, 13, 4, wood[1]), r(2, 11, 13, 1, wood[2]), r(7, 13, 3, 1, light[2]), r(W - 15, 11, 13, 4, wood[1]), r(W - 15, 11, 13, 1, wood[2]), r(W - 10, 13, 3, 1, light[2]), // a pedestal of drawers at each end
      r(W / 2 - 6, 12, 12, 3, light[1]), r(W / 2 - 6, 12, 12, 1, light[3]), r(W / 2 - 4, 13, 3, 1, wood[0]), r(W / 2, 13, 4, 1, wood[0]), // the nameplate
      r(W / 2 - 10, 0, 20, 3, leather[2]), r(W / 2 - 10, 0, 20, 1, leather[3]), r(W / 2 - 5, 1, 10, 2, plaster[2]), r(W / 2 - 5, 1, 10, 1, plaster[3]), // the blotter and keyboard
      r(W / 2 - 15, 3, 14, 6, metal[1]), r(W / 2 - 15, 3, 14, 1, metal[2]), r(W / 2 - 15, 8, 14, 1, metal[0]), r(W / 2 - 9, 5, 2, 1, metal[2]), // the backs of two monitors
      r(W / 2 + 1, 3, 14, 6, metal[1]), r(W / 2 + 1, 3, 14, 1, metal[2]), r(W / 2 + 1, 8, 14, 1, metal[0]), r(W / 2 + 7, 5, 2, 1, metal[2]),
      r(2, 6, 4, 3, metal[1]), r(3, 3, 2, 3, metal[2]), r(1, 0, 6, 3, leaf[1]), r(1, 0, 6, 1, leaf[3]), // the lamp: base, stem, green shade
      r(W - 6, 2, 5, 6, plaster[3]), r(W - 6, 2, 5, 1, plaster[2]), r(W - 5, 4, 3, 1, plaster[1]), // papers
    ]
  const ops = [
    r(0, 0, W, 10, wood[1]), r(0, 0, W, 1, wood[2]), r(0, 0, 1, 10, wood[2]), r(W - 1, 1, 1, 9, wood[0]), // the top
    r(0, 10, W, 6, wood[0]), r(0, 10, W, 1, wood[1]), // the front
    r(3, 11, 24, 4, wood[1]), r(3, 11, 24, 1, wood[2]), r(13, 13, 4, 1, light[2]), // the drawers at the west end, with a brass handle
    r(W - 27, 11, 24, 4, wood[1]), r(W - 27, 11, 24, 1, wood[2]), r(W - 17, 13, 4, 1, light[2]), // and at the east end
    r(W / 2 - 8, 12, 16, 3, light[1]), r(W / 2 - 8, 12, 16, 1, light[3]), r(W / 2 - 5, 13, 3, 1, wood[0]), r(W / 2 - 1, 13, 5, 1, wood[0]), // the nameplate
    r(W / 2 - 14, 0, 28, 3, leather[2]), r(W / 2 - 14, 0, 28, 1, leather[3]), r(W / 2 - 6, 1, 12, 2, plaster[2]), r(W / 2 - 6, 1, 12, 1, plaster[3]), // the blotter and keyboard
  ]
  for (const x of [W / 2 - 24, W / 2 - 8, W / 2 + 8])
    ops.push(r(x, 3, 15, 6, metal[1]), r(x, 3, 15, 1, metal[2]), r(x, 8, 15, 1, metal[0]), r(x + 7, 5, 2, 1, metal[2])) // the backs of three monitors
  ops.push(
    r(7, 6, 6, 3, metal[1]), r(9, 3, 2, 3, metal[2]), r(6, 0, 8, 3, leaf[1]), r(6, 0, 8, 1, leaf[3]), // the lamp: base, stem, green shade
    r(W - 20, 2, 9, 6, plaster[3]), r(W - 20, 2, 9, 1, plaster[2]), r(W - 18, 4, 5, 1, plaster[1]), // papers
    r(W - 8, 3, 4, 5, brick[2]), r(W - 8, 3, 4, 1, brick[3]), r(W - 4, 4, 1, 3, brick[2]), // a mug
  )
  return ops
}

// The drinks cabinet, two tiles by one: decanters and glasses on top of a dark cabinet with two doors and brass handles.
const cabinetOps = () => [
  r(4, 2, 4, 4, brick[2]), r(4, 2, 1, 4, brick[3]), r(5, 0, 2, 2, brick[1]), // an amber decanter with its stopper
  r(10, 1, 3, 5, leaf[1]), r(10, 1, 1, 5, leaf[2]), r(11, 0, 1, 1, leaf[2]), // a green bottle
  r(16, 2, 5, 4, glass[2]), r(16, 2, 1, 4, glass[3]), r(17, 0, 3, 2, glass[3]), // a glass decanter
  r(24, 3, 3, 3, glass[3]), r(24, 3, 3, 1, plaster[3]), r(28, 4, 3, 2, glass[3]), r(28, 4, 3, 1, plaster[3]), // two tumblers
  r(0, 6, 32, 3, wood[2]), r(0, 6, 32, 1, wood[3]), // the top
  r(1, 9, 30, 7, wood[1]), r(1, 9, 1, 7, wood[2]), r(30, 10, 1, 6, wood[0]), r(15, 9, 2, 7, wood[0]), r(1, 15, 30, 1, wood[0]), // the body, the gap between the doors and the plinth
  r(3, 11, 11, 3, wood[0]), r(18, 11, 11, 3, wood[0]), r(13, 11, 1, 3, light[2]), r(18, 11, 1, 3, light[2]), // door panels and handles
]

export const ceoArts = {
  ceodesk: { under: false, ops: ceoDeskOps },
  cabinet: { under: false, ops: cabinetOps },
}
