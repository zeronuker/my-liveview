import assert from 'node:assert/strict'
import { test } from 'node:test'

import { foldFiles, layoutCity } from '../public/city.js'

const FILES = [
  { path: 'README.md', lines: 40 },
  { path: 'src/a.js', lines: 300 },
  { path: 'src/b.js', lines: 20 },
  { path: 'src/deep/c.js', lines: 90 },
  { path: 'docs/x.md', lines: 5 },
]

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
