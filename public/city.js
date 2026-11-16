// The Map's layout: the repo's files as a city that grew without a plan. Each top folder is a district: its
// buildings are dropped in no particular order round the district's middle (each folder's files near each other),
// pushed apart until none overlap, and turned a little this way and that; the district's edge is whatever shape
// that makes, with a ring road round it and parks where the buildings left room. Districts are scattered round
// the middle with uneven gaps and joined by curving main roads. Plain data in, plain data out, so it can be
// tested; map.js draws the result.
//
// layoutCity([{ path: 'src/a.js', lines: 12 }, ...]) gives
//   { width, depth,                                   the ground it all stands on, from 0,0
//     districts: [{ path, x, z, ring }],              the top folders ('' for the files at the top), a big one split;
//                                                     ring: the points round the middle of its ring road
//     files: [{ path, x, z, w, d, angle, r, lines, folded, district }],  x, z the middle; r the room it keeps round it
//     roads: [[{ x, z }, ...], ...] }                 the main roads, as points along each
// treeSpots(city) gives where trees can stand. buildingHeight(lines) and buildingPieces(w, d, lines, seed) shape
// the buildings, cityArc(a, b) is the arc an import is drawn along, and ageLight(changed, now) how lit a
// building's windows are.

export const MAX_FILES = 5000 // lots drawn one each; the rest are merged, one block per folder
export const ROAD = 1.6 // a road's width
const SET_BACK = 0.5 // between the buildings and the ring road
const GAP = 3 // the least open ground between two districts' ring roads; more is added at random
const GOLDEN = Math.PI * (3 - Math.sqrt(5))
const MAX_DISTRICTS = 16
const DAY = 86400000

// a steady pseudo-random number for a string, 0..1, so the same repo always makes the same city
export const hash = text => {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return ((h >>> 0) % 100000) / 100000
}
const weight = lines => Math.sqrt(Math.min(lines, 3000)) + 3 // past 3000 lines a file gets no more ground, so one huge file cannot flatten the rest

// The longest files stay as they are; the rest become one block per folder.
export const foldFiles = (files, max = MAX_FILES) => {
  if (files.length <= max) return files
  const sorted = [...files].sort((a, b) => b.lines - a.lines || (a.path < b.path ? -1 : 1))
  const folded = new Map()
  for (const file of sorted.slice(max)) {
    const dir = file.path.slice(0, file.path.lastIndexOf('/') + 1)
    const block = folded.get(dir) ?? { path: `${dir}…`, lines: 0, folded: 0 }
    block.lines += file.lines
    block.folded++
    folded.set(dir, block)
  }
  return [...sorted.slice(0, max), ...folded.values()]
}

export const buildTree = files => {
  const root = { path: '', kids: new Map() }
  for (const file of files) {
    const parts = file.path.split('/')
    let node = root
    parts.slice(0, -1).forEach((name, i) => {
      if (!node.kids.has(name)) node.kids.set(name, { path: parts.slice(0, i + 1).join('/'), kids: new Map() })
      node = node.kids.get(name)
    })
    node.kids.set(parts.at(-1), { ...file, kids: null })
  }
  const total = node => (node.v = node.kids ? [...node.kids.values()].reduce((sum, k) => sum + total(k), 0) : weight(node.lines))
  total(root)
  return root
}

// the convex hull of some points (monotone chain), anticlockwise
const hull = points => {
  const p = [...points].sort((a, b) => a.x - b.x || a.z - b.z)
  if (p.length < 3) return p
  const cross = (o, a, b) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x)
  const half = list => {
    const out = []
    for (const q of list) {
      while (out.length >= 2 && cross(out.at(-2), out.at(-1), q) <= 0) out.pop()
      out.push(q)
    }
    out.pop()
    return out
  }
  return [...half(p), ...half(p.reverse())]
}

// the line round some circles, `extra` further out: [{ x, z }]
const around = (items, extra) =>
  hull(items.flatMap(f => Array.from({ length: 12 }, (_, k) => ({ x: f.x + Math.cos((k * Math.PI) / 6) * (f.r + extra), z: f.z + Math.sin((k * Math.PI) / 6) * (f.r + extra) }))))

// how far a point is from a closed line, and whether it is inside it (the line goes anticlockwise round a hull)
export const fromRing = (ring, x, z) => {
  let near = Infinity
  let inside = ring.length > 2
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    const [dx, dz] = [b.x - a.x, b.z - a.z]
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)))
    near = Math.min(near, Math.hypot(a.x + dx * t - x, a.z + dz * t - z))
    if (dx * (z - a.z) - dz * (x - a.x) < 0) inside = false
  }
  return { near, inside }
}

export const layoutCity = (files, max = MAX_FILES) => {
  const out = { width: 0, depth: 0, districts: [], files: [], roads: [] }
  if (files.length === 0) return out
  const root = buildTree(foldFiles([...files].sort((a, b) => (a.path < b.path ? -1 : 1)), max))

  // the districts: each top folder, and the files at the top together; a folder holding most of the repo is split
  // into its own folders (and its loose files), again and again, so one big folder (app/src/main/...) is not one block
  const byWeight = (a, b) => b.v - a.v || (a.path < b.path ? -1 : 1)
  const split = node => {
    const loose = [...node.kids.values()].filter(k => !k.kids)
    const subs = [...node.kids.values()].filter(k => k.kids)
    return loose.length ? [...subs, { path: node.path, kids: new Map(loose.map(k => [k.path, k])), v: loose.reduce((sum, k) => sum + k.v, 0) }] : subs
  }
  let groups = split(root).sort(byWeight)
  while (groups.length < MAX_DISTRICTS && groups[0].v > root.v * 0.4 && [...groups[0].kids.values()].some(k => k.kids)) {
    groups = [...groups.slice(1), ...split(groups[0])].sort(byWeight)
  }

  // the buildings: a footprint of the file's size and a shape of its own; `sub` is the folder inside the district
  // it belongs to, so a folder's files stay together
  const items = []
  groups.forEach((g, di) => {
    const walk = (node, sub) => {
      for (const k of node.kids.values()) {
        if (k.kids) {
          walk(k, sub ?? k.path)
          continue
        }
        const area = weight(k.lines) * 0.5
        const aspect = 0.55 + hash(`${k.path}#aspect`) * 0.9
        const w = Math.sqrt(area * aspect)
        const d = area / w
        items.push({ path: k.path, lines: k.lines, folded: k.folded ?? 0, w, d, r: Math.hypot(w, d) / 2 + 0.25, di, sub: sub ?? g.path, x: 0, z: 0 })
      }
    }
    walk(g, null)
  })

  // the districts' middles: the first in the middle, each next at the first free spot along a spiral out from it
  const ring = SET_BACK + ROAD
  const seeds = []
  groups.forEach((g, di) => {
    const own = items.filter(f => f.di === di)
    const radius = Math.sqrt(own.reduce((sum, f) => sum + f.r * f.r, 0)) * 1.2 + ring + GAP / 2 + hash(`${g.path}#gap`) * 2
    const turn = hash(`${g.path}#turn`) * Math.PI * 2
    let spot = { x: 0, z: 0 }
    for (let k = 1; seeds.some(s => Math.hypot(s.x - spot.x, s.z - spot.z) < s.radius + radius); k++) {
      const r = Math.sqrt(k) * 0.9
      spot = { x: Math.cos(k * GOLDEN + turn) * r, z: Math.sin(k * GOLDEN + turn) * r }
    }
    seeds.push({ ...spot, radius })
  })

  // every building starts near its folder's spot in its district, in no order, and they are pushed apart until
  // none overlap (with a road and open ground between districts), each drawn back towards its folder and district
  const subSpot = new Map()
  for (const f of items) {
    if (subSpot.has(f.sub)) continue
    const s = seeds[f.di]
    const subs = new Set(items.filter(g => g.di === f.di).map(g => g.sub)).size
    const a = hash(`${f.sub}#where`) * Math.PI * 2
    const r = subs > 1 ? (s.radius - ring) * (0.2 + hash(`${f.sub}#far`) * 0.35) : 0
    subSpot.set(f.sub, { x: s.x + Math.cos(a) * r, z: s.z + Math.sin(a) * r })
  }
  for (const f of items) {
    const s = subSpot.get(f.sub)
    const spread = Math.sqrt(seeds[f.di].radius) * 1.5
    f.x = s.x + (hash(`${f.path}#x`) - 0.5) * spread
    f.z = s.z + (hash(`${f.path}#z`) - 0.5) * spread
  }
  const apart = 2 * ring + GAP
  const cell = 2 * Math.max(...items.map(f => f.r)) + apart
  const rounds = Math.round(Math.max(40, Math.min(160, 300000 / items.length)))
  const settle = rounds + 80 // the last rounds only push apart, so nothing is left overlapping
  for (let round = 0; round < settle; round++) {
    const grid = new Map()
    items.forEach((f, i) => {
      const key = `${Math.floor(f.x / cell)},${Math.floor(f.z / cell)}`
      ;(grid.get(key) ?? grid.set(key, []).get(key)).push(i)
    })
    items.forEach((f, i) => {
      const gx = Math.floor(f.x / cell)
      const gz = Math.floor(f.z / cell)
      for (let a = -1; a <= 1; a++) {
        for (let b = -1; b <= 1; b++) {
          for (const j of grid.get(`${gx + a},${gz + b}`) ?? []) {
            if (j <= i) continue
            const g = items[j]
            const need = f.r + g.r + (f.di === g.di ? 0 : apart)
            let dx = g.x - f.x
            let dz = g.z - f.z
            let dist = Math.hypot(dx, dz)
            if (dist >= need) continue
            if (dist < 1e-6) [dx, dz, dist] = [Math.cos(i + j), Math.sin(i + j), 1]
            const push = ((need - dist) / dist) * 0.5
            f.x -= dx * push
            f.z -= dz * push
            g.x += dx * push
            g.z += dz * push
          }
        }
      }
    })
    if (round >= rounds) continue
    const pull = (1 - round / rounds) ** 2
    const mids = new Map()
    for (const f of items) {
      const m = mids.get(f.sub) ?? mids.set(f.sub, { x: 0, z: 0, n: 0 }).get(f.sub)
      m.x += f.x
      m.z += f.z
      m.n++
    }
    for (const f of items) {
      const m = mids.get(f.sub)
      const s = seeds[f.di]
      f.x += ((m.x / m.n - f.x) * 0.03 + (s.x - f.x) * 0.01) * pull
      f.z += ((m.z / m.n - f.z) * 0.03 + (s.z - f.z) * 0.01) * pull
    }
  }

  // each building turned a little: the district's own way, its folder's, and its own
  for (const f of items) f.angle = hash(`${groups[f.di].path}#angle`) * Math.PI + (hash(`${f.sub}#angle`) - 0.5) * 0.8 + (hash(`${f.path}#angle`) - 0.5) * 0.4

  // the ground: everything moved so the city, its roads and a margin start at 0,0
  const rings = groups.map((g, di) => around(items.filter(f => f.di === di), SET_BACK + ROAD / 2))
  const all = rings.flat()
  const margin = ROAD + GAP + 2
  const minX = Math.min(...all.map(p => p.x)) - margin
  const minZ = Math.min(...all.map(p => p.z)) - margin
  out.width = Math.max(...all.map(p => p.x)) + margin - minX
  out.depth = Math.max(...all.map(p => p.z)) + margin - minZ
  for (const p of all) {
    p.x -= minX
    p.z -= minZ
  }
  for (const f of items) {
    f.x -= minX
    f.z -= minZ
    out.files.push({ path: f.path, x: f.x, z: f.z, w: f.w, d: f.d, angle: f.angle, r: f.r, lines: f.lines, folded: f.folded, district: f.di })
  }
  groups.forEach((g, di) => {
    const own = items.filter(f => f.di === di)
    out.districts.push({ path: g.path, x: own.reduce((sum, f) => sum + f.x, 0) / own.length, z: own.reduce((sum, f) => sum + f.z, 0) / own.length, ring: rings[di] })
  })

  // the main roads: the shortest set of links that joins every district (a spanning tree), each a gentle curve
  // from one ring road to the other
  const ds = out.districts
  const nearest = (ringPoints, to) => ringPoints.reduce((best, p) => (Math.hypot(p.x - to.x, p.z - to.z) < Math.hypot(best.x - to.x, best.z - to.z) ? p : best))
  const joined = new Set([0])
  while (joined.size < ds.length) {
    let best = null
    for (const i of joined) {
      for (let j = 0; j < ds.length; j++) {
        if (joined.has(j)) continue
        const gap = Math.hypot(ds[i].x - ds[j].x, ds[i].z - ds[j].z)
        if (!best || gap < best.gap) best = { i, j, gap }
      }
    }
    joined.add(best.j)
    const a = nearest(ds[best.i].ring, ds[best.j])
    const b = nearest(ds[best.j].ring, ds[best.i])
    const length = Math.hypot(b.x - a.x, b.z - a.z) || 1
    const bend = (hash(`${ds[best.i].path}>${ds[best.j].path}`) - 0.5) * 0.5
    const c = { x: (a.x + b.x) / 2 - ((b.z - a.z) / length) * length * bend, z: (a.z + b.z) / 2 + ((b.x - a.x) / length) * length * bend }
    out.roads.push(
      Array.from({ length: 13 }, (_, i) => {
        const t = i / 12
        return { x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * c.x + t * t * b.x, z: (1 - t) ** 2 * a.z + 2 * (1 - t) * t * c.z + t * t * b.z }
      }),
    )
  }
  return out
}

// past 3000 lines (about 28 high) a building grows no taller; a short file is a low house, a long one a skyscraper
export const buildingHeight = lines => 0.6 + 0.5 * Math.sqrt(Math.min(lines, 3000))

// the boxes a building of footprint w x d is made of, each { x, z, w, d, y0, y1 } with x, z its middle's offset from
// the building's: one box for a small file; a big one steps in as it rises (two tiers, three past 1200 lines), the
// top tier off-centre on some, and past 2000 lines it carries a spire
export const buildingPieces = (w, d, lines, seed) => {
  const h = buildingHeight(lines)
  const box = (inset, y0, y1, shift = 0) => ({ x: shift * w, z: -shift * d, w: w * (1 - 2 * inset), d: d * (1 - 2 * inset), y0, y1 })
  if (lines < 250 || Math.min(w, d) < 1.2) return [box(0, 0, h)]
  const low = h * (0.4 + seed * 0.25)
  const lean = seed > 0.5 ? (seed - 0.5) * 0.25 : 0
  if (lines < 1200) return [box(0, 0, low), box(0.16, low, h, lean)]
  const mid = low + (h - low) * 0.6
  const pieces = [box(0, 0, low), box(0.13, low, mid, lean / 2), box(0.26, mid, h, lean)]
  if (lines >= 2000) {
    const s = Math.min(w, d) * 0.06
    pieces.push({ x: lean * w, z: -lean * d, w: s, d: s, y0: h, y1: h * 1.2 })
  }
  return pieces
}

// where trees can stand: in the parks the buildings left inside a district, and on the open ground round the
// districts, clear of buildings and roads; at most `max`: [{ x, z, size }]
export const treeSpots = (city, max = 800) => {
  const out = []
  const nearRoad = (x, z) => city.roads.some(road => road.some(p => Math.hypot(p.x - x, p.z - z) < ROAD * 1.2))
  for (let x = 0.5; x < city.width && out.length < max; x += 1.3) {
    for (let z = 0.5; z < city.depth && out.length < max; z += 1.3) {
      const key = `${x.toFixed(1)},${z.toFixed(1)}`
      if (hash(`${key}#tree`) > 0.45) continue
      const px = x + (hash(`${key}#x`) - 0.5) * 1.1
      const pz = z + (hash(`${key}#z`) - 0.5) * 1.1
      const rings = city.districts.map(d => fromRing(d.ring, px, pz))
      if (rings.some(r => r.near < ROAD / 2 + 0.4) || nearRoad(px, pz)) continue
      const inPark = rings.some(r => r.inside) && city.files.every(f => Math.hypot(f.x - px, f.z - pz) > f.r + 0.3)
      const outside = rings.every(r => !r.inside) && Math.min(...rings.map(r => r.near)) < 7
      if (inPark || outside) out.push({ x: px, z: pz, size: 0.6 + hash(`${key}#s`) * 0.6 })
    }
  }
  return out
}

// the arc from one rooftop to another, higher the further apart they are: points { x, y, z }
export const cityArc = (a, b, steps = 16) => {
  const length = Math.hypot(b.x - a.x, b.z - a.z)
  const rise = 1 + length * 0.22
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t + rise * Math.sin(Math.PI * t), z: a.z + (b.z - a.z) * t }
  })
}

// a file changed in the last two weeks has most windows lit; one left alone for months has few, and weathers grey.
// No date (not in git): in between. { lit: 0..1 share of windows lit, grey: 0..1 }
export const ageLight = (changed, now) => {
  if (!changed) return { lit: 0.25, grey: 0 }
  const days = Math.max(0, (now - changed) / DAY)
  const lit = days < 14 ? 0.6 : days < 90 ? 0.6 - ((days - 14) / 76) * 0.45 : 0.08
  return { lit, grey: Math.min(1, Math.max(0, (days - 60) / 300)) * 0.75 }
}
