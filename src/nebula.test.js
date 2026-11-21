import assert from 'node:assert/strict'
import { test } from 'node:test'

import { blastRadius, cloudColor, curvePoints, layoutNebula } from '../public/nebula.js'

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

test('layoutNebula: folders stay apart even when their files import each other, with empty space between', () => {
  // six folders of 30 files, each file importing one in the next folder
  const linked = Array.from({ length: 180 }, (_, i) => ({ path: `d${i % 6}/f${i}.js`, lines: 10, imports: [`d${(i + 1) % 6}/f${(i + 1) % 180}.js`] }))
  const map = layoutNebula(linked)
  const own = map.nodes.filter(n => {
    const d = map.clouds.map(c => Math.hypot(n.x - c.x, n.y - c.y, n.z - c.z))
    return d[n.cloud] <= Math.min(...d)
  })
  assert.ok(own.length >= map.nodes.length * 0.95, `${own.length} of ${map.nodes.length} sit nearest their own folder`)
  let gap = Infinity
  for (const a of map.nodes) for (const b of map.nodes) if (a.cloud < b.cloud) gap = Math.min(gap, dist(a, b))
  assert.ok(gap > 9, `the clouds come within ${gap}`)
})

test('cloudColor: every folder gets a valid colour, and the first ones are well apart', () => {
  const rgb = hex => [1, 3, 5].map(k => parseInt(hex.slice(k, k + 2), 16))
  const colors = Array.from({ length: 40 }, (_, i) => cloudColor(i))
  for (const c of colors) assert.match(c, /^#[0-9a-f]{6}$/)
  assert.equal(new Set(colors).size, 40)
  for (let i = 0; i < 9; i++) for (let j = i + 1; j < 9; j++) {
    const d = Math.hypot(...rgb(colors[i]).map((v, k) => v - rgb(colors[j])[k]))
    assert.ok(d >= 60, `${colors[i]} and ${colors[j]} are only ${Math.round(d)} apart`)
  }
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

// a Graphify graph, as /graph gives it: two files in two communities, each with a function
const GRAPH = {
  nodes: [
    { id: 'a', label: 'a.js', file: 'src/a.js', star: true, community: 0 },
    { id: 'a_f', label: 'f()', file: 'src/a.js', community: 0 },
    { id: 'b', label: 'b.js', file: 'lib/b.js', star: true, community: 1 },
    { id: 'b_g', label: 'g()', file: 'lib/b.js', community: 1 },
    { id: 'b_h', label: 'h()', file: 'lib/b.js', community: 1 },
  ],
  links: [['a', 'a_f', 'contains'], ['b', 'b_g', 'contains'], ['b', 'b_h', 'contains'], ['a_f', 'b_g', 'calls'], ['b_g', 'a_f', 'calls'], ['a', 'b', 'imports'], ['a', 'nowhere', 'calls']],
  names: { 0: 'Alpha', 1: 'Beta' },
}

test('layoutNebula with a graph: a star for each node, a file star keeps its path and lines, a function star is named by its id', () => {
  const map = layoutNebula([{ path: 'src/a.js', lines: 300 }], undefined, GRAPH)
  assert.deepEqual(map.nodes.map(n => n.path).sort(), ['a_f', 'b_g', 'b_h', 'lib/b.js', 'src/a.js'])
  const a = map.nodes.find(n => n.path === 'src/a.js')
  assert.equal(a.lines, 300)
  const f = map.nodes.find(n => n.path === 'a_f')
  assert.deepEqual([f.file, f.label, f.symbol], ['src/a.js', 'f()', true])
  for (const n of map.nodes) assert.ok([n.x, n.y, n.z].every(Number.isFinite))
})

test('layoutNebula with a graph: a cloud for each community, named, and a star sits in its own', () => {
  const map = layoutNebula([], undefined, GRAPH)
  assert.deepEqual(map.clouds.map(c => [c.dir, c.count]).sort(), [['Alpha', 2], ['Beta', 3]])
  const alpha = map.clouds.findIndex(c => c.dir === 'Alpha')
  assert.deepEqual(map.nodes.filter(n => n.cloud === alpha).map(n => n.path).sort(), ['a_f', 'src/a.js'])
})

test('layoutNebula with a graph: contains links pull but are not drawn; a pair is linked once; unknown ends are dropped', () => {
  const map = layoutNebula([], undefined, GRAPH)
  const named = map.links.map(([a, b]) => [map.nodes[a].path, map.nodes[b].path].sort().join(' '))
  assert.deepEqual(named.sort(), ['a_f b_g', 'lib/b.js src/a.js'])
  assert.deepEqual(map.nodes.map(n => [n.path, n.degree]).sort(), [['a_f', 1], ['b_g', 1], ['b_h', 0], ['lib/b.js', 1], ['src/a.js', 1]])
})

test('layoutNebula with a graph: the same graph always lays out the same', () => {
  assert.deepEqual(layoutNebula([], undefined, GRAPH), layoutNebula([], undefined, GRAPH))
})

test('layoutNebula with an empty graph is the file layout', () => {
  assert.deepEqual(layoutNebula(FILES, undefined, { nodes: [], links: [], names: {} }), layoutNebula(FILES))
})
