import assert from 'node:assert/strict'
import { test } from 'node:test'

import { layoutRadial } from '../public/radial.js'

const FILES = [
  { path: 'README.md', lines: 40 },
  { path: 'src/a.js', lines: 300 },
  { path: 'src/b.js', lines: 20 },
  { path: 'src/deep/c.js', lines: 90 },
  { path: 'docs/x.md', lines: 5 },
]

test('layoutRadial: the repo in the middle, a node for every folder and file, each joined to its parent', () => {
  const tree = layoutRadial(FILES)
  const paths = tree.nodes.map(n => n.path)
  assert.equal(paths[0], '')
  const { dir, depth, x, y, z } = tree.nodes[0]
  assert.ok(dir && depth === 0 && x === 0 && y === 0 && z === 0)
  assert.deepEqual(paths.filter(p => p).sort(), ['README.md', 'docs', 'docs/x.md', 'src', 'src/a.js', 'src/b.js', 'src/deep', 'src/deep/c.js'])
  assert.equal(tree.edges.length, tree.nodes.length - 1)
  for (const [parent, child] of tree.edges) {
    const a = tree.nodes[parent].path
    const b = tree.nodes[child].path
    assert.ok(b.startsWith(a ? `${a}/` : '') && b.slice(a ? a.length + 1 : 0).indexOf('/') === -1, `${a} -> ${b}`)
  }
})

test('layoutRadial: a node sits on the ring for its depth, and no two share a place', () => {
  const tree = layoutRadial(FILES)
  const spots = new Set()
  for (const n of tree.nodes) {
    assert.ok(Math.abs(Math.hypot(n.x, n.z) - n.depth * (tree.radius / Math.max(...tree.nodes.map(m => m.depth)))) < 1e-6)
    spots.add(`${n.x.toFixed(4)},${n.z.toFixed(4)}`)
  }
  assert.equal(spots.size, tree.nodes.length)
})

test('layoutRadial: the same files always make the same tree, in any order', () => {
  assert.deepEqual(layoutRadial(FILES), layoutRadial([...FILES].reverse()))
})

test('layoutRadial: no files is an empty tree', () => {
  assert.deepEqual(layoutRadial([]), { radius: 0, nodes: [], edges: [] })
})

test('layoutRadial: past the limit the shortest files merge into one block per folder', () => {
  const tree = layoutRadial(FILES, 2)
  assert.equal(tree.nodes.filter(n => !n.dir && n.folded).length, 3)
})
