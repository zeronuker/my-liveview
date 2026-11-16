import assert from 'node:assert/strict'
import { test } from 'node:test'

import { blastRadius, curvePoints, layoutNebula } from '../public/nebula.js'

const FILES = [
  { path: 'README.md', lines: 40 },
  { path: 'src/a.js', lines: 300, imports: ['src/b.js', 'lib/c.js', 'gone.js'] },
  { path: 'src/b.js', lines: 20, imports: ['src/a.js'] },
  { path: 'lib/c.js', lines: 90 },
]
const MANY = Array.from({ length: 400 }, (_, i) => ({ path: `d${i % 8}/f${i}.js`, lines: 10, imports: [`d${i % 8}/f${(i + 8) % 400}.js`] }))

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)

test('layoutNebula: one star per real file, no folder nodes, each import linked once', () => {
  const map = layoutNebula(FILES)
  assert.deepEqual(map.nodes.map(n => n.path), ['README.md', 'lib/c.js', 'src/a.js', 'src/b.js'])
  const named = map.links.map(([a, b]) => [map.nodes[a].path, map.nodes[b].path].sort().join(' '))
  assert.deepEqual(named.sort(), ['lib/c.js src/a.js', 'src/a.js src/b.js'])
  assert.deepEqual(map.nodes.map(n => n.degree), [0, 1, 2, 1])
  assert.deepEqual(map.clouds.map(c => c.dir).sort(), ['', 'lib', 'src'])
})

test('layoutNebula: the same repo always lays out the same, with every position a number', () => {
  const a = layoutNebula(MANY)
  assert.deepEqual(a, layoutNebula(MANY))
  for (const n of a.nodes) assert.ok([n.x, n.y, n.z].every(Number.isFinite))
})

test('layoutNebula: stars keep apart, and a folder stays closer together than the whole map', () => {
  const map = layoutNebula(MANY)
  let closest = Infinity
  for (let i = 0; i < map.nodes.length; i++) for (let j = i + 1; j < map.nodes.length; j++) closest = Math.min(closest, dist(map.nodes[i], map.nodes[j]))
  assert.ok(closest > 1, `closest ${closest}`)
  for (const c of map.clouds) assert.ok(c.spread < map.radius, `${c.dir} ${c.spread} vs ${map.radius}`)
  const inCloud = map.nodes.filter(n => n.cloud === 0)
  const own = inCloud.reduce((s, n) => s + dist(n, map.clouds[0]), 0) / inCloud.length
  const other = inCloud.reduce((s, n) => s + dist(n, map.clouds[4]), 0) / inCloud.length
  assert.ok(own < other, `${own} vs ${other}`)
})

test('layoutNebula: an empty repo is an empty map', () => {
  assert.deepEqual(layoutNebula([]), { radius: 0, nodes: [], links: [], clouds: [] })
})

test('curvePoints: starts and ends on the two stars', () => {
  const a = { x: 0, y: 0, z: 0 }
  const b = { x: 10, y: 2, z: -4 }
  const points = curvePoints(a, b, 8)
  assert.equal(points.length, 9)
  assert.deepEqual(points[0], a)
  assert.ok(dist(points[8], b) < 1e-9)
})

test('blastRadius: every file that depends on one, directly or through others, with how many steps away', () => {
  // 1 imports 0, 2 imports 1, 3 imports 0 and 2, 4 imports 3; 0 imports 5 (not a dependent of 0)
  const links = [[1, 0], [2, 1], [3, 0], [3, 2], [4, 3], [0, 5]]
  assert.deepEqual([...blastRadius(links, 0)].sort(), [[0, 0], [1, 1], [2, 2], [3, 1], [4, 2]])
  assert.deepEqual([...blastRadius(links, 4)], [[4, 0]])
})
