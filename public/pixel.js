// Small helpers shared by the Office's pixel art. Plain data in, plain data out. Every helper
// gives a list of rectangles, ['r', x, y, w, h, colour], in whole pixels.

// a number from a cell's place: the same every time, but different from its neighbours
export const hash = (x, y) => {
  let h = (x * 374761393 + y * 668265263) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return (h ^ (h >>> 16)) >>> 0
}

// A picture from rows of letters: `legend` says which colour each letter is, '.' is empty, and a
// run of the same letter along a row is one rectangle. A letter with no colour is a mistake.
export const gridOps = (rows, legend, ox = 0, oy = 0) => {
  const ops = []
  rows.forEach((row, y) => {
    for (let x = 0, end; x < row.length; x = end + 1) {
      end = x
      while (end + 1 < row.length && row[end + 1] === row[x]) end++
      if (row[x] === '.') continue
      if (!legend[row[x]]) throw new Error(`gridOps: no colour for '${row[x]}' in row ${y}`)
      ops.push(['r', ox + x, oy + y, end - x + 1, 1, legend[row[x]]])
    }
  })
  return ops
}

// a filled ellipse, one rectangle to a row of pixels
export const ellipseOps = (cx, cy, rx, ry, color) => {
  const ops = []
  for (let y = Math.floor(cy - ry); y < Math.ceil(cy + ry); y++) {
    const dy = (y + 0.5 - cy) / ry
    if (Math.abs(dy) >= 1) continue
    const half = rx * Math.sqrt(1 - dy * dy)
    const [x0, x1] = [Math.round(cx - half), Math.round(cx + half)]
    if (x1 > x0) ops.push(['r', x0, y, x1 - x0, 1, color])
  }
  return ops
}

// a ring of small squares round an ellipse, evenly spaced
export const ringOps = (cx, cy, rx, ry, count, color, size = 2) =>
  Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * 2 * Math.PI
    return ['r', Math.round(cx + rx * Math.cos(angle) - size / 2), Math.round(cy + ry * Math.sin(angle) - size / 2), size, size, color]
  })

// A pool of light on the floor, drawn as a dither so it stays pixel art: one pixel in four inside, one
// in sixteen towards the edge, then nothing.
export const glowOps = (cx, cy, rx, ry, color) => {
  const ops = []
  for (let y = Math.floor(cy - ry); y < Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x < Math.ceil(cx + rx); x++) {
      const d = Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry)
      if (d < 0.5 ? x % 2 === 0 && y % 2 === 0 : d < 1 && x % 4 === 0 && y % 4 === 0) ops.push(['r', x, y, 1, 1, color])
    }
  return ops
}
