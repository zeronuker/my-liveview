// The Map's globe layouts: the repo as a 3D mind map. The files are spread
// evenly over a sphere, with each folder's files kept together, so there is
// always plenty of room between them. Plain data in, plain data out, so it can
// be tested; map.js draws the result.
//
// layoutSphere(files, style) gives { radius, depth, nodes, edges }
//   nodes: [{ path, dir, depth, x, y, z, lines, folded }]   nodes[0] is the repo itself, path ''
//   edges: [[parent, child], ...]                            indexes into nodes
// style 'sphere' (and the 'globe' outline, which is drawn the same): the folders sit inside and
//   every file is on the sphere around them. style 'planet': everything is on the sphere's
//   skin, the repo at the top pole.
// curvePoints(a, b, planet, steps) is the branch between two nodes: a gentle curve, or an
//   arc that rises off the planet's skin.

import { MAX_FILES, buildTree, foldFiles } from './city.js'

export const SPACE = 7 // the distance between neighbouring files, in world units
const GOLDEN = Math.PI * (3 - Math.sqrt(5))

const unit = v => {
  const length = Math.hypot(v.x, v.y, v.z)
  return length < 1e-9 ? null : { x: v.x / length, y: v.y / length, z: v.z / length }
}

// n points spread evenly over the unit sphere
const spread = n =>
  Array.from({ length: n }, (_, i) => {
    const y = 1 - (2 * (i + 0.5)) / n
    const r = Math.sqrt(1 - y * y)
    return { x: Math.cos(i * GOLDEN) * r, y, z: Math.sin(i * GOLDEN) * r }
  })

const widestAxis = points =>
  ['x', 'y', 'z']
    .map(axis => {
      const values = points.map(p => p[axis])
      return [Math.max(...values) - Math.min(...values), axis]
    })
    .sort((a, b) => b[0] - a[0])[0][1]

// Gives each folder's files a patch of the sphere to themselves: split the folders in two halves,
// cut the points in two along their widest direction, and go on inside each half.
const assign = (nodes, points) => {
  if (nodes.length === 1) return settle(nodes[0], points)
  const total = nodes.reduce((sum, node) => sum + node.n, 0)
  let cut = 1
  let seen = nodes[0].n
  let gap = Math.abs(seen - total / 2)
  for (let i = 2; i < nodes.length; i++) {
    seen += nodes[i - 1].n
    if (Math.abs(seen - total / 2) < gap) {
      gap = Math.abs(seen - total / 2)
      cut = i
    }
  }
  const left = nodes.slice(0, cut)
  const size = left.reduce((sum, node) => sum + node.n, 0)
  const axis = widestAxis(points)
  const sorted = [...points].sort((a, b) => a[axis] - b[axis] || a.y - b.y || a.z - b.z)
  assign(left, sorted.slice(0, size))
  assign(nodes.slice(cut), sorted.slice(size))
}

// a file takes its point; a folder points at the middle of its files
const settle = (node, points) => {
  if (!node.list) {
    node.dir = points[0]
    return
  }
  assign(node.list, points)
  const mid = node.list.reduce((sum, kid) => ({ x: sum.x + kid.dir.x, y: sum.y + kid.dir.y, z: sum.z + kid.dir.z }), { x: 0, y: 0, z: 0 })
  node.dir = unit(mid) ?? points[0]
}

export const layoutSphere = (files, style = 'sphere', max = MAX_FILES) => {
  const out = { radius: 0, depth: 0, nodes: [], edges: [] }
  if (files.length === 0) return out
  const root = buildTree(foldFiles(files, max))
  const prepare = node => {
    node.list = node.kids ? [...node.kids.values()].sort((a, b) => (a.path < b.path ? -1 : 1)) : null
    node.n = node.list ? node.list.reduce((sum, kid) => sum + prepare(kid), 0) : 1
    return node.n
  }
  prepare(root)
  settle(root, spread(root.n))

  const radius = Math.max(16, Math.sqrt((root.n * SPACE * SPACE) / (4 * Math.PI)))
  const depthOf = node => (node.path ? node.path.split('/').length : 0)
  const deepest = Math.max(2, ...(function* walk(node) {
    yield depthOf(node)
    for (const kid of node.list ?? []) yield* walk(kid)
  })(root))
  const put = (node, parent) => {
    const depth = depthOf(node)
    const isDir = Boolean(node.kids)
    const skin = style === 'planet'
    // the radius a node sits at: the planet's skin, the sphere for a file, a folder somewhere inside
    const at = skin ? radius * 1.02 : isDir ? radius * (0.2 + (0.6 * (depth - 1)) / deepest) : radius
    const spot = node.path === '' ? (skin ? { x: 0, y: 1, z: 0 } : { x: 0, y: 0, z: 0 }) : node.dir
    const scale = node.path === '' && !skin ? 0 : at
    const i = out.nodes.push({
      path: node.path, dir: isDir, depth, x: spot.x * scale, y: spot.y * scale, z: spot.z * scale,
      lines: node.lines ?? 0, folded: node.folded ?? 0,
    }) - 1
    if (parent >= 0) out.edges.push([parent, i])
    out.depth = Math.max(out.depth, depth)
    for (const kid of node.list ?? []) put(kid, i)
  }
  put(root, -1)
  out.radius = radius
  return out
}

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t })

export const curvePoints = (a, b, planet = 0, steps = 22) => {
  const way = sub(b, a)
  const length = Math.hypot(way.x, way.y, way.z)
  const points = []
  if (planet) {
    const from = unit(a) ?? { x: 0, y: 1, z: 0 }
    const to = unit(b) ?? { x: 0, y: 1, z: 0 }
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const dir = unit(lerp(from, to, t)) ?? from
      const r = planet * 1.02 + length * 0.22 * Math.sin(Math.PI * t) // rises off the skin, lands on it
      points.push({ x: dir.x * r, y: dir.y * r, z: dir.z * r })
    }
    return points
  }
  const side = { x: way.y * 0 - way.z * 1, y: 0, z: way.x * 1 - way.y * 0 } // the way crossed with straight up
  const bend = unit(side) ?? { x: 1, y: 0, z: 0 }
  const mid = lerp(a, b, 0.5)
  const control = { x: mid.x + bend.x * length * 0.16, y: mid.y + bend.y * length * 0.16, z: mid.z + bend.z * length * 0.16 }
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const k = [(1 - t) * (1 - t), 2 * (1 - t) * t, t * t]
    points.push({
      x: k[0] * a.x + k[1] * control.x + k[2] * b.x,
      y: k[0] * a.y + k[1] * control.y + k[2] * b.y,
      z: k[0] * a.z + k[1] * control.z + k[2] * b.z,
    })
  }
  return points
}
