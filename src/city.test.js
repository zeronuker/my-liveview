import assert from 'node:assert/strict'
import { test } from 'node:test'

import { ROAD, ageLight, buildingHeight, buildingPieces, cityArc, foldFiles, layoutCity, roadLines, treeSpots } from '../public/city.js'

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
  assert.deepEqual(layoutCity([]), { width: 0, depth: 0, districts: [], dirs: [], files: [], roads: [] })
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

test('layoutCity: each top folder is a district of its own shape, apart from the others with room for roads', () => {
  const city = layoutCity(MANY)
  assert.deepEqual(city.districts.map(d => d.path).sort(), ['d0', 'd1', 'd2', 'd3'])
  const aspects = city.districts.map(d => (d.w / d.d).toFixed(2))
  assert.ok(new Set(aspects).size > 1, 'not all the same shape')
  for (const [i, a] of city.districts.entries()) {
    for (const b of city.districts.slice(i + 1)) {
      const gapX = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w))
      const gapZ = Math.max(b.z - (a.z + a.d), a.z - (b.z + b.d))
      assert.ok(Math.max(gapX, gapZ) >= 2 * ROAD, `${a.path} ${b.path}`)
    }
  }
  for (const f of city.files) {
    const own = city.districts.find(d => d.path === f.path.split('/')[0])
    assert.ok(f.x >= own.x && f.z >= own.z && f.x + f.w <= own.x + own.w + 1e-6 && f.z + f.d <= own.z + own.d + 1e-6, f.path)
  }
})

test('layoutCity: the files at the top make a district of their own', () => {
  const city = layoutCity(FILES)
  const top = city.districts.find(d => d.path === '')
  const readme = city.files.find(f => f.path === 'README.md')
  assert.ok(top && readme.x >= top.x && readme.x + readme.w <= top.x + top.w + 1e-6)
})

test('layoutCity: main roads join every district, one fewer than there are districts', () => {
  const city = layoutCity(MANY)
  assert.equal(city.roads.length, city.districts.length - 1)
  for (const road of city.roads) assert.ok(road.length > 2 && road.every(p => Number.isFinite(p.x) && Number.isFinite(p.z)))
})

test('roadLines: a ring road round each district, outside it', () => {
  const city = layoutCity(FILES)
  const lines = roadLines(city)
  assert.equal(lines.length, city.districts.length * 4)
  const src = city.districts.find(d => d.path === 'src')
  assert.ok(lines.some(([x1, z1]) => Math.abs(x1 - (src.x - ROAD / 2)) < 1e-9 && Math.abs(z1 - (src.z - ROAD / 2)) < 1e-9))
})

test('treeSpots: trees stand on open ground near the city, never on a district', () => {
  const city = layoutCity(MANY)
  const trees = treeSpots(city)
  assert.ok(trees.length > 10)
  for (const t of trees) for (const d of city.districts) assert.ok(!(t.x > d.x - ROAD && t.x < d.x + d.w + ROAD && t.z > d.z - ROAD && t.z < d.z + d.d + ROAD), `${t.x},${t.z} on ${d.path}`)
  assert.deepEqual(treeSpots(city), trees)
})

test('buildingHeight: a much wider range, from a low house to a tower, and no taller past 3000 lines', () => {
  assert.ok(buildingHeight(10) < 2)
  assert.ok(buildingHeight(1000) > 10)
  assert.ok(buildingHeight(1000) / buildingHeight(10) > 6)
  assert.equal(buildingHeight(3000), buildingHeight(50000))
})

test('buildingPieces: a small file is one box; a big one steps in as it rises, and the biggest carry a spire', () => {
  const lot = { x: 0, z: 0, w: 4, d: 4 }
  assert.equal(buildingPieces(lot, 100, 0.5).length, 1)
  assert.equal(buildingPieces(lot, 600, 0.5).length, 2)
  const tower = buildingPieces(lot, 2500, 0.5)
  assert.equal(tower.length, 4)
  for (let i = 1; i < 3; i++) {
    assert.ok(tower[i].w < tower[i - 1].w && tower[i].y0 === tower[i - 1].y1)
    assert.ok(tower[i].x >= lot.x && tower[i].x + tower[i].w <= lot.x + lot.w)
  }
  assert.equal(tower[2].y1, buildingHeight(2500))
  assert.ok(tower[3].y1 > tower[2].y1)
  assert.equal(buildingPieces({ x: 0, z: 0, w: 0.8, d: 3 }, 2500, 0.5).length, 1) // too thin to step
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

test('layoutCity: a folder holding most of the repo is split into districts of its own folders', () => {
  const files = [
    ...Array.from({ length: 60 }, (_, i) => ({ path: `app/src/main/${['ui', 'data', 'edit'][i % 3]}/f${i}.kt`, lines: 100 })),
    { path: 'app/src/main/App.kt', lines: 50 },
    { path: 'README.md', lines: 20 },
  ]
  const city = layoutCity(files)
  assert.deepEqual(city.districts.map(d => d.path).sort(), ['', 'app/src/main', 'app/src/main/data', 'app/src/main/edit', 'app/src/main/ui'])
  const app = city.districts.find(d => d.path === 'app/src/main')
  const lot = city.files.find(f => f.path === 'app/src/main/App.kt')
  assert.ok(lot.x >= app.x && lot.x + lot.w <= app.x + app.w + 1e-6)
})
