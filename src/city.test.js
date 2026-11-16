import assert from 'node:assert/strict'
import { test } from 'node:test'

import { ROAD, ageLight, cityArc, foldFiles, layoutCity, roadLines } from '../public/city.js'

const FILES = [
  { path: 'README.md', lines: 40 },
  { path: 'src/a.js', lines: 300 },
  { path: 'src/b.js', lines: 20 },
  { path: 'src/deep/c.js', lines: 90 },
  { path: 'docs/x.md', lines: 5 },
]

const MANY = Array.from({ length: 120 }, (_, i) => ({ path: `d${i % 4}/e${i % 3}/f${i}.js`, lines: 10 + i }))

const overlap = (a, b) => a.x < b.x + b.w - 1e-6 && b.x < a.x + a.w - 1e-6 && a.z < b.z + b.d - 1e-6 && b.z < a.z + a.d - 1e-6

test('layoutCity: every file gets a lot inside the city, and no two lots overlap', () => {
  const city = layoutCity(FILES)
  assert.deepEqual(city.files.map(f => f.path).sort(), FILES.map(f => f.path).sort())
  for (const f of city.files) {
    assert.ok(f.w > 0 && f.d > 0)
    assert.ok(f.x >= -1e-6 && f.z >= -1e-6 && f.x + f.w <= city.width + 1e-6 && f.z + f.d <= city.depth + 1e-6)
  }
  for (const [i, a] of city.files.entries()) for (const b of city.files.slice(i + 1)) assert.ok(!overlap(a, b), `${a.path} ${b.path}`)
})

test('layoutCity: a lot lies inside its folder, and a longer file gets more room', () => {
  const city = layoutCity(FILES)
  const dir = city.dirs.find(d => d.path === 'src')
  const a = city.files.find(f => f.path === 'src/a.js')
  const b = city.files.find(f => f.path === 'src/b.js')
  assert.ok(a.x >= dir.x && a.z >= dir.z && a.x + a.w <= dir.x + dir.w + 1e-6 && a.z + a.d <= dir.z + dir.d + 1e-6)
  assert.ok(a.w * a.d > b.w * b.d)
  assert.ok(city.dirs.some(d => d.path === 'src/deep'))
})

test('layoutCity: the same files always make the same city, in any order', () => {
  assert.deepEqual(layoutCity(FILES), layoutCity([...FILES].reverse()))
})

test('layoutCity: no files is an empty city', () => {
  assert.deepEqual(layoutCity([]), { width: 0, depth: 0, dirs: [], files: [] })
})

test('foldFiles: past the limit the shortest files merge into one block per folder', () => {
  const folded = foldFiles(FILES, 2)
  assert.deepEqual(folded.slice(0, 2).map(f => f.path), ['src/a.js', 'src/deep/c.js'])
  assert.deepEqual(folded.slice(2).map(f => [f.path, f.folded, f.lines]).sort(), [['…', 1, 40], ['docs/…', 1, 5], ['src/…', 1, 20]].sort())
  assert.equal(foldFiles(FILES, 5), FILES)
})

test('layoutCity: folded blocks are laid out like files and say how many they hold', () => {
  const city = layoutCity(FILES, 2)
  assert.equal(city.files.length, 5)
  assert.equal(city.files.filter(f => f.folded).length, 3)
})

test('layoutCity: top folders have roads round them, wider than the gaps inside', () => {
  const city = layoutCity(MANY)
  const top = city.dirs.find(d => d.path === 'd0')
  const inner = city.files.filter(f => f.path.startsWith('d0/'))
  const left = Math.min(...inner.map(f => f.x)) - top.x
  assert.ok(left >= ROAD - 1e-6, `${left}`)
})

test('roadLines: the edges of the city and of each top folder, each stretch once', () => {
  const city = layoutCity(FILES)
  const lines = roadLines(city)
  const keys = lines.map(l => l.map(v => v.toFixed(3)).join(' '))
  assert.equal(new Set(keys).size, keys.length)
  assert.ok(lines.some(([x1, z1, x2, z2]) => x1 === 0 && z1 === 0 && x2 === city.width && z2 === 0)) // the city's own edge
  const src = city.dirs.find(d => d.path === 'src')
  assert.ok(lines.some(([x1, z1, , z2]) => Math.abs(x1 - src.x) < 1e-9 && Math.abs(z1 - src.z) < 1e-9 && Math.abs(z2 - (src.z + src.d)) < 1e-9))
  assert.equal(lines.some(([x1, z1]) => city.dirs.some(d => d.path === 'src/deep' && x1 === d.x && z1 === d.z)), false) // no road round an inner folder
})

test('cityArc: from rooftop to rooftop, rising higher for buildings further apart', () => {
  const a = { x: 0, y: 2, z: 0 }
  const near = cityArc(a, { x: 4, y: 3, z: 0 }, 8)
  const far = cityArc(a, { x: 40, y: 3, z: 0 }, 8)
  assert.deepEqual(near[0], a)
  assert.ok(Math.hypot(near[8].x - 4, near[8].y - 3, near[8].z) < 1e-9)
  assert.ok(far[4].y > near[4].y && near[4].y > 3)
})

test('ageLight: fresh files are lit, old ones dim and grey, no date is in between', () => {
  const now = Date.parse('2026-06-01')
  const days = n => now - n * 86400000
  assert.deepEqual(ageLight(days(1), now), { lit: 0.6, grey: 0 })
  const old = ageLight(days(400), now)
  assert.ok(old.lit < 0.1 && old.grey > 0.7)
  const mid = ageLight(days(50), now)
  assert.ok(mid.lit < 0.6 && mid.lit > old.lit && mid.grey === 0)
  assert.deepEqual(ageLight(undefined, now), { lit: 0.25, grey: 0 })
})

test('layoutCity: past 3000 lines a file gets no more ground', () => {
  const area = lines => {
    const f = layoutCity([{ path: 'a/big.js', lines }, { path: 'a/small.js', lines: 100 }]).files.find(f => f.path === 'a/big.js')
    return f.w * f.d
  }
  const ratio = lines => area(lines) / layoutCity([{ path: 'a/big.js', lines }, { path: 'a/small.js', lines: 100 }]).files.find(f => f.path === 'a/small.js').w
  assert.ok(Math.abs(ratio(3000) - ratio(60000)) < 1e-6)
})
