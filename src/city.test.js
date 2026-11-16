import assert from 'node:assert/strict'
import { test } from 'node:test'

import { ROAD, ageLight, buildingHeight, buildingPieces, cityArc, foldFiles, fromRing, layoutCity, treeSpots } from '../public/city.js'

const FILES = [
  { path: 'README.md', lines: 40 },
  { path: 'src/a.js', lines: 300 },
  { path: 'src/b.js', lines: 20 },
  { path: 'src/deep/c.js', lines: 90 },
  { path: 'docs/x.md', lines: 5 },
]

const MANY = Array.from({ length: 120 }, (_, i) => ({ path: `d${i % 4}/e${i % 3}/f${i}.js`, lines: 10 + i }))

const apart = (a, b) => Math.hypot(a.x - b.x, a.z - b.z) >= a.r + b.r - 1e-3

test('layoutCity: every file gets a building on the ground, and no two buildings crowd each other', () => {
  for (const files of [FILES, MANY]) {
    const city = layoutCity(files)
    assert.deepEqual(city.files.map(f => f.path).sort(), files.map(f => f.path).sort())
    for (const f of city.files) {
      assert.ok(f.w > 0 && f.d > 0 && f.r >= Math.hypot(f.w, f.d) / 2 && Number.isFinite(f.angle))
      assert.ok(f.x - f.r >= 0 && f.z - f.r >= 0 && f.x + f.r <= city.width && f.z + f.r <= city.depth, f.path)
    }
    for (const [i, a] of city.files.entries()) for (const b of city.files.slice(i + 1)) assert.ok(apart(a, b), `${a.path} ${b.path}`)
  }
})

test('layoutCity: a longer file gets more ground', () => {
  const city = layoutCity(FILES)
  const a = city.files.find(f => f.path === 'src/a.js')
  const b = city.files.find(f => f.path === 'src/b.js')
  assert.ok(a.w * a.d > b.w * b.d)
})

test('layoutCity: the same files always make the same city, in any order', () => {
  assert.deepEqual(layoutCity(MANY), layoutCity([...MANY].reverse()))
})

test('layoutCity: no files is an empty city', () => {
  assert.deepEqual(layoutCity([]), { width: 0, depth: 0, districts: [], files: [], roads: [] })
})

test('layoutCity: folded blocks are laid out like files and say how many they hold', () => {
  const city = layoutCity(FILES, 2)
  assert.equal(city.files.length, 5)
  assert.equal(city.files.filter(f => f.folded).length, 3)
})

test('layoutCity: each top folder is a district with its buildings inside its own ring road and no one else\'s', () => {
  const city = layoutCity(MANY)
  assert.deepEqual(city.districts.map(d => d.path).sort(), ['d0', 'd1', 'd2', 'd3'])
  for (const f of city.files) {
    city.districts.forEach((d, di) => {
      const at = fromRing(d.ring, f.x, f.z)
      if (f.district === di) assert.ok(at.inside && at.near >= f.r, f.path)
      else assert.ok(!at.inside && at.near >= f.r + ROAD / 2, `${f.path} in ${d.path}`)
    })
    assert.equal(city.districts[f.district].path, f.path.split('/')[0])
  }
})

test('layoutCity: districts are not squares: their ring roads have many corners, and buildings stand at many angles', () => {
  const city = layoutCity(MANY)
  for (const d of city.districts) assert.ok(d.ring.length > 8, `${d.path} ${d.ring.length}`)
  assert.ok(new Set(city.files.map(f => f.angle.toFixed(2))).size > city.files.length / 2)
})

test('layoutCity: buildings are not in order of size: big and small are mixed through a district', () => {
  const files = Array.from({ length: 80 }, (_, i) => ({ path: `a/f${i}.js`, lines: (i * 53) % 1500 }))
  const city = layoutCity(files)
  const mid = city.districts[0]
  const dist = f => Math.hypot(f.x - mid.x, f.z - mid.z)
  const big = city.files.filter(f => f.lines > 1000)
  const small = city.files.filter(f => f.lines < 300)
  const avg = list => list.reduce((sum, f) => sum + dist(f), 0) / list.length
  assert.ok(Math.abs(avg(big) - avg(small)) < avg(city.files) * 0.6) // neither all in the middle nor all at the edge
})

test('layoutCity: the files at the top make a district of their own', () => {
  const city = layoutCity(FILES)
  const top = city.districts.findIndex(d => d.path === '')
  assert.equal(city.files.find(f => f.path === 'README.md').district, top)
})

test('layoutCity: main roads join every district, one fewer than there are districts', () => {
  const city = layoutCity(MANY)
  assert.equal(city.roads.length, city.districts.length - 1)
  for (const road of city.roads) assert.ok(road.length > 2 && road.every(p => Number.isFinite(p.x) && Number.isFinite(p.z)))
})

test('layoutCity: a folder holding most of the repo is split into districts of its own folders', () => {
  const files = [
    ...Array.from({ length: 60 }, (_, i) => ({ path: `app/src/main/${['ui', 'data', 'edit'][i % 3]}/f${i}.kt`, lines: 100 })),
    { path: 'app/src/main/App.kt', lines: 50 },
    { path: 'README.md', lines: 20 },
  ]
  const city = layoutCity(files)
  assert.deepEqual(city.districts.map(d => d.path).sort(), ['', 'app/src/main', 'app/src/main/data', 'app/src/main/edit', 'app/src/main/ui'])
  assert.equal(city.districts[city.files.find(f => f.path === 'app/src/main/App.kt').district].path, 'app/src/main')
})

test('treeSpots: trees stand in parks and round the districts, never on a building or a road', () => {
  const city = layoutCity(MANY)
  const trees = treeSpots(city)
  assert.ok(trees.length > 10)
  for (const t of trees) {
    for (const f of city.files) assert.ok(Math.hypot(f.x - t.x, f.z - t.z) > f.r, 'on a building')
    for (const d of city.districts) assert.ok(fromRing(d.ring, t.x, t.z).near > ROAD / 2, 'on a ring road')
  }
  assert.deepEqual(treeSpots(city), trees)
})

test('buildingHeight: from a low house to a skyscraper, and no taller past 3000 lines', () => {
  assert.ok(buildingHeight(10) < 2.5)
  assert.ok(buildingHeight(1000) > 15)
  assert.ok(buildingHeight(1000) / buildingHeight(10) > 6)
  assert.equal(buildingHeight(3000), buildingHeight(50000))
})

test('buildingPieces: a small file is one box; a big one steps in as it rises, and the biggest carry a spire', () => {
  assert.equal(buildingPieces(4, 4, 100, 0.5).length, 1)
  assert.equal(buildingPieces(4, 4, 600, 0.5).length, 2)
  const tower = buildingPieces(4, 4, 2500, 0.9)
  assert.equal(tower.length, 4)
  for (let i = 1; i < 3; i++) {
    assert.ok(tower[i].w < tower[i - 1].w && tower[i].y0 === tower[i - 1].y1)
    assert.ok(Math.abs(tower[i].x) + tower[i].w / 2 <= 2 + 1e-9) // inside the footprint
  }
  assert.equal(tower[2].y1, buildingHeight(2500))
  assert.ok(tower[3].y1 > tower[2].y1)
  assert.equal(buildingPieces(0.8, 3, 2500, 0.5).length, 1) // too thin to step
})

test('foldFiles: past the limit the shortest files merge into one block per folder', () => {
  const folded = foldFiles(FILES, 2)
  assert.deepEqual(folded.slice(0, 2).map(f => f.path), ['src/a.js', 'src/deep/c.js'])
  assert.deepEqual(folded.slice(2).map(f => [f.path, f.folded, f.lines]).sort(), [['…', 1, 40], ['docs/…', 1, 5], ['src/…', 1, 20]].sort())
  assert.equal(foldFiles(FILES, 5), FILES)
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

