// Small helpers shared by the Office's pixel art. Plain data in, plain data out.

// a number from a cell's place: the same every time, but different from its neighbours
export const hash = (x, y) => {
  let h = (x * 374761393 + y * 668265263) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return (h ^ (h >>> 16)) >>> 0
}
