import assert from 'node:assert/strict'
import { test } from 'node:test'

import { SPACE, curvePoints, layoutSphere } from '../public/sphere.js'

const FILES = [
  { path: 'README.md', lines: 40 },
  { path: 'src/a.js', lines: 300 },
  { path: 'src/b.js', lines: 20 },
  { path: 'src/deep/c.js', lines: 90 },
  { path: 'docs/x.md', lines: 5 },
]
// a bigger repo, so spacing and patches mean something
const MANY = Array.from({ length: 150 }, (_, i) => ({ path: `d${i % 6}/e${i % 4}/f${i}.js`, lines: 10 + i }))

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
const len = n => Math.hypot(n.x, n.y, n.z)

test('layoutSphere: the repo in the middle, a node for every folder and file, each joined to its parent', () => {
  const tree = layoutSphere(FILES)
  assert.deepEqual(tree.nodes.map(n => n.path).sort(), ['', 'README.md', 'docs', 'docs/x.md', 'src', 'src/a.js', 'src/b.js', 'src/deep', 'src/deep/c.js'].sort())
  assert.equal(tree.nodes[0].path, '')
  assert.equal(len(tree.nodes[0]), 0)
  assert.equal(tree.edges.length, tree.nodes.length - 1)
  for (const [parent, child] of tree.edges) {
    const a = tree.nodes[parent].path
    const b = tree.nodes[child].path
    assert.ok(b.startsWith(a ? `${a}/` : '') && !b.slice(a ? a.length + 1 : 0).includes('/'), `${a} -> ${b}`)
  }
})

test('layoutSphere: every file is on the sphere and every folder is inside it', () => {
  const tree = layoutSphere(MANY)
  for (const n of tree.nodes) {
    if (n.path === '') continue
    assert.ok(n.dir ? len(n) < tree.radius - 1e-6 : Math.abs(len(n) - tree.radius) < 1e-6, n.path)
  }
})

test('layoutSphere: files keep their distance, so the dots never crowd', () => {
  const files = layoutSphere(MANY).nodes.filter(n => !n.dir)
  let closest = Infinity
  for (const [i, a] of files.entries()) for (const b of files.slice(i + 1)) closest = Math.min(closest, dist(a, b))
  assert.ok(closest > SPACE * 0.6, `closest pair ${closest}`)
})

test('layoutSphere: a folder keeps its files together', () => {
  const tree = layoutSphere(MANY)
  const files = tree.nodes.filter(n => !n.dir)
  const average = (group, others) => {
    let total = 0
    let pairs = 0
    for (const a of group) for (const b of others) if (a !== b) (total += dist(a, b), pairs++)
    return total / pairs
  }
  const one = files.filter(n => n.path.startsWith('d0/e0/'))
  assert.ok(one.length > 5)
  assert.ok(average(one, one) < average(one, files) * 0.8, 'a folder is tighter than the repo as a whole')
})

test('layoutSphere: the planet has everything on its skin, the repo at the top pole', () => {
  const tree = layoutSphere(MANY, 'planet')
  const skin = tree.radius * 1.02
  for (const n of tree.nodes) assert.ok(Math.abs(len(n) - skin) < 1e-6, n.path)
  assert.deepEqual([tree.nodes[0].x, tree.nodes[0].y, tree.nodes[0].z], [0, skin, 0])
})

test('layoutSphere: the same files always make the same layout, in any order', () => {
  assert.deepEqual(layoutSphere(FILES), layoutSphere([...FILES].reverse()))
})

test('layoutSphere: no files is an empty layout', () => {
  assert.deepEqual(layoutSphere([]), { radius: 0, depth: 0, nodes: [], edges: [] })
})

test('layoutSphere: past the limit the shortest files merge into one block per folder', () => {
  assert.equal(layoutSphere(FILES, 'sphere', 2).nodes.filter(n => !n.dir && n.folded).length, 3)
})

test('curvePoints: runs from one node to the other', () => {
  const a = { x: 0, y: 0, z: 0 }
  const b = { x: 10, y: 4, z: -6 }
  const line = curvePoints(a, b)
  assert.equal(line.length, 23)
  assert.deepEqual(line[0], a)
  assert.ok(dist(line.at(-1), b) < 1e-9)
})

test('curvePoints: on a planet it rises off the skin in the middle and lands on it', () => {
  const skin = 20 * 1.02
  const a = { x: 0, y: skin, z: 0 }
  const b = { x: skin, y: 0, z: 0 }
  const line = curvePoints(a, b, 20)
  assert.ok(Math.abs(len(line[0]) - skin) < 1e-9 && Math.abs(len(line.at(-1)) - skin) < 1e-9)
  assert.ok(len(line[11]) > skin + 1)
})
