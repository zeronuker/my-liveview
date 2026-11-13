// Things that hang or stand above people's heads, drawn over them: a parasol over a table, a hanging lamp. Each has
// `over: true`, so the Office draws it after the people, and a `rise`: its picture stands that many pixels above its
// tile. Rectangles ['r', x, y, w, h, colour] in pixels, palette colours only, light from the top left.
import { RAMPS } from '../palette.js'
import { ellipseOps } from '../pixel.js'

const TILE = 16
const r = (x, y, w, h, color) => ['r', x, y, w, h, color]
const [brick, plaster, metal, light] = [RAMPS.brick, RAMPS.plaster, RAMPS.metal, RAMPS.light]

// A parasol, three tiles wide, over a table in the middle tile: a striped round canopy a little above the table (seen from
// the front and above), a finial on top and a shadowed underside. 16 pixels above the tile.
const PARASOL_RISE = 14
const parasolOps = () => {
  const [cx, cy, rx, ry] = [24, 8, 22, 7]
  const ops = [...ellipseOps(cx, cy + 1, rx + 1, ry + 1, brick[0]), r(cx - 1, 0, 2, 2, metal[2]), r(cx, 0, 1, 1, metal[3])] // the outline and the finial
  for (let y = Math.floor(cy - ry); y < Math.ceil(cy + ry); y++) {
    const dy = (y + 0.5 - cy) / ry
    if (Math.abs(dy) >= 1) continue
    const half = rx * Math.sqrt(1 - dy * dy)
    const [x0, x1] = [Math.round(cx - half), Math.round(cx + half)]
    for (let x = x0; x < x1; ) {
      const next = Math.min(x1, (Math.floor(x / 6) + 1) * 6) // a stripe is six pixels wide
      const stripe = Math.floor(x / 6) % 2 === 0
      ops.push(r(x, y, next - x, 1, y >= cy + ry - 2 ? (stripe ? plaster[1] : brick[1]) : y <= cy - ry + 1 ? (stripe ? plaster[3] : brick[3]) : stripe ? plaster[2] : brick[2]))
      x = next
    }
  }
  return ops
}

// A hanging lamp, one tile, its picture 18 pixels above the tile: a cord from the top of the picture, a cap, a metal
// dome shade lit on the top left, and a warm bulb under it. The floor under it has its pool of light (the plan's
// `lights`); the bulb flickers a little.
const PENDANT_RISE = 18
const pendantOps = () => [
  r(7, 0, 1, 12, metal[1]), r(7, 0, 1, 3, metal[2]), r(6, 0, 3, 1, metal[0]), // the cord and the cap
  r(6, 11, 4, 1, metal[2]), r(5, 12, 6, 1, metal[2]), r(4, 13, 8, 3, metal[1]), r(4, 13, 8, 1, metal[3]), r(4, 13, 1, 3, metal[2]), r(11, 14, 1, 2, metal[0]), // the dome
  r(6, 16, 4, 2, light[3]), r(6, 16, 4, 1, plaster[3]), r(7, 18, 2, 1, light[2]), // the bulb
]

export const overheadArts = {
  parasol: { under: false, over: true, rise: PARASOL_RISE, ops: parasolOps },
  pendant: { under: false, over: true, rise: PENDANT_RISE, ops: pendantOps, lights: () => [{ x: 6, y: 16, w: 4, h: 2, pattern: 'flicker', on: light[3], off: light[2] }] },
}
