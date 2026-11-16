// The Map's layout: the repo's files as a city. Each top folder is a district: a block of its own shape,
// scattered round the middle with uneven gaps, ringed by a road, with curving main roads joining the
// districts. Inside a district every folder is a block and every file a lot; a lot's footprint grows with
// the file's length. Plain data in, plain data out, so it can be tested; map.js draws the result.
//
// layoutCity([{ path: 'src/a.js', lines: 12 }, ...]) gives
//   { width, depth,                                  the ground it all stands on, from 0,0
//     districts: [{ path, x, z, w, d }],             the top folders ('' for the files at the top), a big one split
//     dirs:  [{ path, x, z, w, d }],                 every folder's block, districts included
//     files: [{ path, x, z, w, d, lines, folded }],  folded: how many files a "…" block stands for
//     roads: [[{ x, z }, ...], ...] }                the main roads, as points along each
// roadLines(city) gives the ring roads' middles; treeSpots(city) where trees can stand.
// buildingHeight(lines) and buildingPieces(lot, lines, seed) shape the buildings, cityArc(a, b) is the arc
// an import is drawn along, and ageLight(changed, now) how lit a building's windows are.

export const MAX_FILES = 5000 // lots drawn one each; the rest are merged, one block per folder
const PAD = 0.6 // the gap that makes a folder's edge, in world units
const WALK = 0.5 // the pavement round a district, inside its ring road
export const ROAD = 1.6 // a road's width
const GAP = 2.5 // the least ground between two districts' ring roads; more is added at random
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

const worst = (row, sum, side) => {
  const values = row.map(r => r.v)
  return Math.max((side * side * Math.max(...values)) / (sum * sum), (sum * sum) / (side * side * Math.min(...values)))
}

// Squarified treemap: rects { node, x, z, w, d } that fill the box, each as big as its value.
const squarify = (nodes, x, z, w, d) => {
  const scale = (w * d) / nodes.reduce((sum, n) => sum + n.v, 0)
  let queue = nodes.map(node => ({ node, v: node.v * scale }))
  const rects = []
  while (queue.length) {
    const side = Math.min(w, d)
    let row = [queue[0]]
    let sum = queue[0].v
    let i = 1
    for (; i < queue.length; i++) {
      const next = [...row, queue[i]]
      const nextSum = sum + queue[i].v
      if (worst(next, nextSum, side) > worst(row, sum, side)) break
      row = next
      sum = nextSum
    }
    queue = queue.slice(i)
    const thick = sum / side
    let at = 0
    for (const r of row) {
      const len = r.v / thick
      rects.push(w >= d ? { node: r.node, x, z: z + at, w: thick, d: len } : { node: r.node, x: x + at, z, w: len, d: thick })
      at += len
    }
    if (w >= d) {
      x += thick
      w -= thick
    } else {
      z += thick
      d -= thick
    }
  }
  return rects
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

// a folder's blocks and lots inside the box x, z, w, d
const fill = (out, dir, x, z, w, d) => {
  const kids = [...dir.kids.values()].sort((a, b) => b.v - a.v || (a.path < b.path ? -1 : 1))
  for (const r of squarify(kids, x, z, w, d)) {
    const { node } = r
    if (!node.kids) {
      out.files.push({ path: node.path, x: r.x, z: r.z, w: r.w, d: r.d, lines: node.lines, folded: node.folded ?? 0 })
      continue
    }
    out.dirs.push({ path: node.path, x: r.x, z: r.z, w: r.w, d: r.d })
    const pad = Math.min(PAD, r.w / 4, r.d / 4)
    fill(out, node, r.x + pad, r.z + pad, r.w - 2 * pad, r.d - 2 * pad)
  }
}

const overlaps = (a, b, gap) => a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.z < b.z + b.d + gap && b.z < a.z + a.d + gap

export const layoutCity = (files, max = MAX_FILES) => {
  const out = { width: 0, depth: 0, districts: [], dirs: [], files: [], roads: [] }
  if (files.length === 0) return out
  const root = buildTree(foldFiles(files, max))

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

  // each gets a shape of its own, then a place: the first in the middle, each next one at the first free spot
  // along a spiral out from the middle, keeping clear of the others by a road on each side and a little ground
  const placed = []
  for (const g of groups) {
    const aspect = 0.6 + hash(`${g.path}#shape`) * 1.0
    const w = Math.sqrt(g.v * aspect) + 2 * WALK
    const d = g.v / (w - 2 * WALK) + 2 * WALK
    const gap = 2 * ROAD + GAP + hash(`${g.path}#gap`) * 3
    const turn = hash(`${g.path}#turn`) * Math.PI * 2
    let spot = { x: -w / 2, z: -d / 2, w, d }
    for (let k = 1; placed.some(p => overlaps(spot, p.box, Math.max(gap, p.gap))); k++) {
      const r = Math.sqrt(k) * 0.9
      spot = { x: Math.cos(k * GOLDEN + turn) * r - w / 2, z: Math.sin(k * GOLDEN + turn) * r - d / 2, w, d }
    }
    placed.push({ g, box: spot, gap })
  }

  // the ground: everything moved so the city, its ring roads and a margin start at 0,0
  const margin = ROAD + GAP
  const minX = Math.min(...placed.map(p => p.box.x)) - margin
  const minZ = Math.min(...placed.map(p => p.box.z)) - margin
  out.width = Math.max(...placed.map(p => p.box.x + p.box.w)) + margin - minX
  out.depth = Math.max(...placed.map(p => p.box.z + p.box.d)) + margin - minZ
  for (const { g, box } of placed) {
    const x = box.x - minX
    const z = box.z - minZ
    out.districts.push({ path: g.path, x, z, w: box.w, d: box.d })
    if (g.path) out.dirs.push({ path: g.path, x, z, w: box.w, d: box.d })
    fill(out, g, x + WALK, z + WALK, box.w - 2 * WALK, box.d - 2 * WALK)
  }

  // the main roads: the shortest set of links that joins every district (a spanning tree), each a gentle curve
  // from one ring road to the other
  const ds = out.districts
  const mid = r => ({ x: r.x + r.w / 2, z: r.z + r.d / 2 })
  const edge = (r, toward) => {
    const half = ROAD / 2
    return { x: Math.min(Math.max(toward.x, r.x - half), r.x + r.w + half), z: Math.min(Math.max(toward.z, r.z - half), r.z + r.d + half) }
  }
  const joined = new Set([0])
  while (joined.size < ds.length) {
    let best = null
    for (const i of joined) {
      for (let j = 0; j < ds.length; j++) {
        if (joined.has(j)) continue
        const gap = Math.hypot(mid(ds[i]).x - mid(ds[j]).x, mid(ds[i]).z - mid(ds[j]).z)
        if (!best || gap < best.gap) best = { i, j, gap }
      }
    }
    joined.add(best.j)
    const a = edge(ds[best.i], mid(ds[best.j]))
    const b = edge(ds[best.j], mid(ds[best.i]))
    const length = Math.hypot(b.x - a.x, b.z - a.z)
    const bend = (hash(`${ds[best.i].path}>${ds[best.j].path}`) - 0.5) * 0.5
    const c = { x: (a.x + b.x) / 2 - ((b.z - a.z) / (length || 1)) * length * bend, z: (a.z + b.z) / 2 + ((b.x - a.x) / (length || 1)) * length * bend }
    out.roads.push(
      Array.from({ length: 13 }, (_, i) => {
        const t = i / 12
        return { x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * c.x + t * t * b.x, z: (1 - t) ** 2 * a.z + 2 * (1 - t) * t * c.z + t * t * b.z }
      }),
    )
  }
  return out
}

// past 3000 lines (about 21 high) a building grows no taller; a short file is a low house
export const buildingHeight = lines => 0.5 + 0.38 * Math.sqrt(Math.min(lines, 3000))

// the boxes a building is made of, each { x, z, w, d, y0, y1 } from its base: one box for a small file;
// a big one steps in as it rises (two tiers, three past 1200 lines), and past 2000 lines it carries a spire
export const buildingPieces = (lot, lines, seed) => {
  const h = buildingHeight(lines)
  const box = (inset, y0, y1) => ({ x: lot.x + lot.w * inset, z: lot.z + lot.d * inset, w: lot.w * (1 - 2 * inset), d: lot.d * (1 - 2 * inset), y0, y1 })
  if (lines < 250 || Math.min(lot.w, lot.d) < 1.2) return [box(0, 0, h)]
  const low = h * (0.45 + seed * 0.2)
  if (lines < 1200) return [box(0, 0, low), box(0.16, low, h)]
  const mid = low + (h - low) * 0.6
  const pieces = [box(0, 0, low), box(0.14, low, mid), box(0.28, mid, h)]
  if (lines >= 2000) {
    const s = Math.min(lot.w, lot.d) * 0.06
    pieces.push({ x: lot.x + lot.w / 2 - s / 2, z: lot.z + lot.d / 2 - s / 2, w: s, d: s, y0: h, y1: h * 1.22 })
  }
  return pieces
}

// the middles of the ring roads round each district, as segments [x1, z1, x2, z2]
export const roadLines = city =>
  city.districts.flatMap(({ x, z, w, d }) => {
    const [x0, z0, x1, z1] = [x - ROAD / 2, z - ROAD / 2, x + w + ROAD / 2, z + d + ROAD / 2]
    return [[x0, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0]]
  })

// where trees can stand: on open ground near the districts, clear of the blocks, ring roads and main roads,
// at most `max`: [{ x, z, size }]
export const treeSpots = (city, max = 600) => {
  const out = []
  const clear = ROAD + 0.4
  const near = 7
  const nearRoad = (x, z) => city.roads.some(road => road.some(p => Math.hypot(p.x - x, p.z - z) < ROAD * 1.2))
  for (let x = 0.5; x < city.width && out.length < max; x += 1.3) {
    for (let z = 0.5; z < city.depth && out.length < max; z += 1.3) {
      const key = `${x.toFixed(1)},${z.toFixed(1)}`
      if (hash(`${key}#tree`) > 0.42) continue
      const px = x + (hash(`${key}#x`) - 0.5) * 1.1
      const pz = z + (hash(`${key}#z`) - 0.5) * 1.1
      const dist = Math.min(...city.districts.map(r => Math.max(r.x - px, 0, px - r.x - r.w, r.z - pz, pz - r.z - r.d))) // square, like the ring road's corners
      if (dist < clear || dist > near || nearRoad(px, pz)) continue
      out.push({ x: px, z: pz, size: 0.6 + hash(`${key}#s`) * 0.6 })
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
