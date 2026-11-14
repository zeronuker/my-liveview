// The small drawing tools the angled view's art is made of (iso-art.js, iso-furniture.js, iso-garden.js).
// A tile is a 16 by 8 diamond; (px, py) is the left and top of its box. Whole pixels, palette colours only,
// light from the top-left, so the left face of a box (towards +y) is lighter than its right face (towards +x).
import { shade } from './palette.js'

export const rect = (c, x, y, w, h, color) => {
  c.fillStyle = color
  c.fillRect(x, y, w, h)
}

export const cellHash = (x, y) => ((x * 73856093) ^ (y * 19349663)) >>> 0

// A diamond, drawn a row at a time so the edges stay crisp (a path would be smoothed).
const WIDTHS = [4, 8, 12, 16, 16, 12, 8, 4]
export const diamond = (c, px, py, color) => WIDTHS.forEach((w, j) => rect(c, px + 8 - w / 2, py + j, w, 1, color))
// the top and bottom edge of the diamond in a column 0 to 7 (the right half mirrors it)
export const topEdge = col => 3 - (col >> 1)
export const bottomEdge = col => 5 + (col >> 1)

// A box on a tile: top, left face (towards +y) and right face (towards +x), `h` pixels tall.
export const block = (c, px, py, h, mat, skirt = false) => {
  for (let col = 0; col < 8; col++) {
    rect(c, px + col, py - h + bottomEdge(col), 1, h, shade(mat, 2))
    rect(c, px + 15 - col, py - h + bottomEdge(col), 1, h, shade(mat, 1))
    if (skirt) {
      rect(c, px + col, py + bottomEdge(col) - 2, 1, 2, shade('wood', 1))
      rect(c, px + 15 - col, py + bottomEdge(col) - 2, 1, 2, shade('wood', 0))
    }
  }
  diamond(c, px, py - h, shade(mat, 3))
}

// a box with a top of another material (a counter with a stone top)
export const blockTop = (c, px, py, h, mat, topMat) => {
  block(c, px, py, h, mat)
  diamond(c, px, py - h, shade(topMat, 3))
}

// The y of a tile's edge in a column of its box: 'ur' (upper right), 'ul', 'll' (lower left) or 'lr'. The upper edges run
// from the tile's top corner, 'ul' along y and 'ur' along x; the lower ones 'll' along x and 'lr' along y.
export const edgeY = (side, col) => (side === 'ur' ? topEdge(15 - col) : side === 'ul' ? topEdge(col) : side === 'll' ? bottomEdge(col) - 1 : bottomEdge(15 - col) - 1)

// A thin upright slab along one edge of the tile, 'ur' (upper right), 'ul', 'll' or 'lr', standing on height z and `hh` tall:
// a backrest, an arm, a panel, a screen seen edge on.
export const slab = (c, px, py, z, side, hh, color, rim) => {
  for (let i = 0; i < 6; i++) {
    const col = side === 'ur' || side === 'lr' ? 8 + i : 2 + i
    rect(c, px + col, py - z + edgeY(side, col) - hh + 1, 1, hh, color)
    rect(c, px + col, py - z + edgeY(side, col) - hh + 1, 1, 1, rim)
  }
}
export const BACK = { down: 'ur', up: 'll', right: 'ul', left: 'lr' } // the edge behind someone facing this way
export const BEHIND = new Set(['ur', 'ul']) // edges that are behind what stands on the tile, so are drawn before it

export const seatTop = (c, px, py, z, color) => [4, 8, 8, 4].forEach((w, j) => rect(c, px + 8 - w / 2, py + 2 + j - z, w, 1, color))

// a table: a thick top on thin legs under the corners of the whole piece. `part` says where this tile is in a piece
// of w by h tiles: { i, j, w, h }.
export const table = (c, px, py, h, mat, part = { i: 0, j: 0, w: 1, h: 1 }) => {
  const { i, j, w, h: d } = part
  const leg = (x, bottom, width, light) => rect(c, x, py + bottom - h + 2, width, h - 2, shade('metal', light))
  if (i === 0 || j === d - 1) leg(px + 1, 5, 1, 1) // left corner
  if (i === w - 1 || j === 0) leg(px + 14, 5, 1, 0) // right corner
  if (i === w - 1 || j === d - 1) leg(px + 7, 8, 2, 1) // front corner
  for (let col = 0; col < 8; col++) {
    rect(c, px + col, py - h + bottomEdge(col), 1, 2, shade(mat, 2))
    rect(c, px + 15 - col, py - h + bottomEdge(col), 1, 2, shade(mat, 1))
  }
  diamond(c, px, py - h, shade(mat, 3))
}
