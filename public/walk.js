// How a worker walks across a floor. The floor is a list of rows of text:
// '#' is in the way (a wall, a desk), anything else can be walked on. Plain
// data in, plain data out, so it can be tested; the Office view does the drawing.
//
// Returns the cells to step through, as [x, y]: the start left out, the goal
// last, one cell at a time (no diagonals). [] when already there; null when the
// start or goal is in the way or off the floor, or the goal cannot be reached.
// `avoid` is a set of "x,y" cells to go round (people standing there); the
// start and the goal are never counted as avoided.
export const findPath = (grid, from, to, avoid = new Set()) => {
  const isOpen = ([x, y]) => y >= 0 && y < grid.length && x >= 0 && x < grid[y].length && grid[y][x] !== '#'
  if (!isOpen(from) || !isOpen(to)) return null
  if (from[0] === to[0] && from[1] === to[1]) return []

  const key = ([x, y]) => `${x},${y}`
  const goal = key(to)
  const cameFrom = new Map([[key(from), null]])
  const queue = [from]
  for (let head = 0; head < queue.length; head++) {
    const cell = queue[head]
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next = [cell[0] + dx, cell[1] + dy]
      if (!isOpen(next) || cameFrom.has(key(next)) || (avoid.has(key(next)) && key(next) !== goal)) continue
      cameFrom.set(key(next), cell)
      if (next[0] === to[0] && next[1] === to[1]) {
        const path = []
        for (let at = next; at && key(at) !== key(from); at = cameFrom.get(key(at))) path.unshift(at)
        return path
      }
      queue.push(next)
    }
  }
  return null
}
