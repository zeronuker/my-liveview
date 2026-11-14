// The Map's layout: the repo's files as a city. Every folder is a district and
// every file a lot; a lot's footprint grows with the file's length. Plain data
// in, plain data out, so it can be tested; map.js draws the result.
//
// layoutCity([{ path: 'src/a.js', lines: 12 }, ...]) gives
//   { width, depth,
//     dirs:  [{ path, x, z, w, d }],                 the folders (root is '')
//     files: [{ path, x, z, w, d, lines, folded }] } folded: how many files a "…" block stands for

export const MAX_FILES = 5000 // lots drawn one each; the rest are merged, one block per folder
const PAD = 0.6 // the gap that makes a folder's edge, in world units
const weight = lines => Math.sqrt(lines) + 3

// The longest files stay as they are; the rest become one block per folder.
export const foldFiles = (files, max = MAX_FILES) => {
  if (files.length <= max) return files
  const sorted = [...files].sort((a, b) => b.lines - a.lines || (a.path < b.path ? -1 : 1))
  const folded = new Map()
  for (const file of sorted.slice(max)) {
    const dir = file.path.slice(0, file.path.lastIndexOf('/') + 1)
    const block = folded.get(dir) ?? { path: `${dir}…`, lines: 0, folded: 0 }
    block.lines += file.lines
    block.folded++
    folded.set(dir, block)
  }
  return [...sorted.slice(0, max), ...folded.values()]
}

const worst = (row, sum, side) => {
  const values = row.map(r => r.v)
  return Math.max((side * side * Math.max(...values)) / (sum * sum), (sum * sum) / (side * side * Math.min(...values)))
}

// Squarified treemap: rects { node, x, z, w, d } that fill the box, each as big as its value.
const squarify = (nodes, x, z, w, d) => {
  const scale = (w * d) / nodes.reduce((sum, n) => sum + n.v, 0)
  let queue = nodes.map(node => ({ node, v: node.v * scale }))
  const rects = []
  while (queue.length) {
    const side = Math.min(w, d)
    let row = [queue[0]]
    let sum = queue[0].v
    let i = 1
    for (; i < queue.length; i++) {
      const next = [...row, queue[i]]
      const nextSum = sum + queue[i].v
      if (worst(next, nextSum, side) > worst(row, sum, side)) break
      row = next
      sum = nextSum
    }
    queue = queue.slice(i)
    const thick = sum / side
    let at = 0
    for (const r of row) {
      const len = r.v / thick
      rects.push(w >= d ? { node: r.node, x, z: z + at, w: thick, d: len } : { node: r.node, x: x + at, z, w: len, d: thick })
      at += len
    }
    if (w >= d) {
      x += thick
      w -= thick
    } else {
      z += thick
      d -= thick
    }
  }
  return rects
}

export const buildTree = files => {
  const root = { path: '', kids: new Map() }
  for (const file of files) {
    const parts = file.path.split('/')
    let node = root
    parts.slice(0, -1).forEach((name, i) => {
      if (!node.kids.has(name)) node.kids.set(name, { path: parts.slice(0, i + 1).join('/'), kids: new Map() })
      node = node.kids.get(name)
    })
    node.kids.set(parts.at(-1), { ...file, kids: null })
  }
  const total = node => (node.v = node.kids ? [...node.kids.values()].reduce((sum, k) => sum + total(k), 0) : weight(node.lines))
  total(root)
  return root
}

export const layoutCity = (files, max = MAX_FILES) => {
  const out = { width: 0, depth: 0, dirs: [], files: [] }
  if (files.length === 0) return out
  const root = buildTree(foldFiles(files, max))
  const side = Math.sqrt(root.v)
  out.width = out.depth = side
  const place = (dir, x, z, w, d) => {
    const kids = [...dir.kids.values()].sort((a, b) => b.v - a.v || (a.path < b.path ? -1 : 1))
    for (const r of squarify(kids, x, z, w, d)) {
      const { node } = r
      if (!node.kids) {
        out.files.push({ path: node.path, x: r.x, z: r.z, w: r.w, d: r.d, lines: node.lines, folded: node.folded ?? 0 })
        continue
      }
      out.dirs.push({ path: node.path, x: r.x, z: r.z, w: r.w, d: r.d })
      const pad = Math.min(PAD, r.w / 4, r.d / 4)
      place(node, r.x + pad, r.z + pad, r.w - 2 * pad, r.d - 2 * pad)
    }
  }
  place(root, 0, 0, side, side)
  return out
}
