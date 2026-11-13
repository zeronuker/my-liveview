// How a worker walks across a floor. The floor is a list of rows of text:
// '#' is in the way (a wall, a desk), anything else can be walked on. Plain
// data in, plain data out, so it can be tested; the Office view does the drawing.
//
// Returns the cells to step through, as [x, y]: the start left out, the goal
// last, one cell at a time (no diagonals). [] when already there; null when the
// start or goal is in the way or off the floor, or the goal cannot be reached.
// `avoid` is a set of "x,y" cells to go round (people standing there); the
// start and the goal are never counted as avoided.
//
// `options` makes the way a little different from the shortest one, and never an
// unreachable one:
//   cost(x, y)   extra cost of stepping onto a cell (the sides of a stair, say): such a cell is used only when it saves more than that
//   seed         a number; with it every cell costs a small amount more or less, from a hash of the seed and the cell, so different
//                seeds take different ways of nearly the same length (the same seed always the same way)
export const JITTER = 0.3 // the most a cell can cost more, with a seed

// a repeatable number from 0 up to (not including) 1, for a seed and a cell
const noise = (seed, x, y) => {
  let h = Math.imul(seed ^ Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263), 2246822519)
  h ^= h >>> 13
  h = Math.imul(h, 3266489917)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

export const findPath = (grid, from, to, avoid = new Set(), { cost, seed } = {}) => {
  const isOpen = ([x, y]) => y >= 0 && y < grid.length && x >= 0 && x < grid[y].length && grid[y][x] !== '#'
  if (!isOpen(from) || !isOpen(to)) return null
  if (from[0] === to[0] && from[1] === to[1]) return []

  const key = ([x, y]) => `${x},${y}`
  const goal = key(to)
  const stepCost = ([x, y]) => 1 + (cost?.(x, y) ?? 0) + (seed === undefined ? 0 : JITTER * noise(seed, x, y))

  // the cheapest way, trying the cells in turn from the cheapest (a heap of [cost, cell])
  const best = new Map([[key(from), 0]])
  const cameFrom = new Map([[key(from), null]])
  const heap = [[0, from]]
  const push = item => {
    heap.push(item)
    for (let i = heap.length - 1; i > 0; ) {
      const parent = (i - 1) >> 1
      if (heap[parent][0] <= heap[i][0]) break
      ;[heap[parent], heap[i]] = [heap[i], heap[parent]]
      i = parent
    }
  }
  const pop = () => {
    const top = heap[0]
    const last = heap.pop()
    if (heap.length > 0) {
      heap[0] = last
      for (let i = 0; ; ) {
        const [l, r] = [2 * i + 1, 2 * i + 2]
        let small = i
        if (l < heap.length && heap[l][0] < heap[small][0]) small = l
        if (r < heap.length && heap[r][0] < heap[small][0]) small = r
        if (small === i) break
        ;[heap[small], heap[i]] = [heap[i], heap[small]]
        i = small
      }
    }
    return top
  }

  while (heap.length > 0) {
    const [spent, cell] = pop()
    if (spent > best.get(key(cell))) continue // a cheaper way here was found since
    if (key(cell) === goal) {
      const path = []
      for (let at = cell; at && key(at) !== key(from); at = cameFrom.get(key(at))) path.unshift(at)
      return path
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next = [cell[0] + dx, cell[1] + dy]
      if (!isOpen(next) || (avoid.has(key(next)) && key(next) !== goal)) continue
      const total = spent + stepCost(next)
      if (total >= (best.get(key(next)) ?? Infinity)) continue
      best.set(key(next), total)
      cameFrom.set(key(next), cell)
      push([total, next])
    }
  }
  return null
}
