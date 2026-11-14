// The Map's other layout: the repo as a radial tree, like a mind map. The repo
// is the dot in the middle, its folders branch out in rings, and the files are
// the dots at the tips. Plain data in, plain data out, so it can be tested;
// map.js draws the result.
//
// layoutRadial([{ path: 'src/a.js', lines: 12 }, ...]) gives
//   { radius,
//     nodes: [{ path, dir, depth, x, y, z, lines, folded }],   nodes[0] is the repo itself, path ''
//     edges: [[parent, child], ...] }                           indexes into nodes

import { MAX_FILES, buildTree, foldFiles } from './city.js'

const RING = 1.2 // ring spacing grows with the square root of the file count, so the tips never crowd
const LIFT = 0.3 // each ring sits a little higher than the one inside it, so the tree is not flat

export const layoutRadial = (files, max = MAX_FILES) => {
  const out = { radius: 0, nodes: [], edges: [] }
  if (files.length === 0) return out
  const root = buildTree(foldFiles(files, max))
  const count = node => (node.n = node.kids ? [...node.kids.values()].reduce((sum, kid) => sum + count(kid), 0) : 1)
  count(root)
  const step = Math.max(8, Math.sqrt(root.n) * RING)

  const place = (node, depth, from, to, parent) => {
    const angle = (from + to) / 2
    const r = depth * step
    const i = out.nodes.push({
      path: node.path, dir: Boolean(node.kids), depth,
      x: r * Math.cos(angle), y: depth * LIFT, z: r * Math.sin(angle),
      lines: node.lines ?? 0, folded: node.folded ?? 0,
    }) - 1
    if (parent >= 0) out.edges.push([parent, i])
    out.radius = Math.max(out.radius, r)
    if (!node.kids) return
    let at = from
    for (const kid of [...node.kids.values()].sort((a, b) => (a.path < b.path ? -1 : 1))) {
      const span = ((to - from) * kid.n) / node.n
      place(kid, depth + 1, at, at + span, i)
      at += span
    }
  }
  place(root, 0, 0, 2 * Math.PI, -1)
  return out
}
