// The Map's Nebula layout: every file in the repo is a star, and a file that imports another
// is linked to it. Files in one folder form a cloud with one colour; links and a gentle pull
// to their cloud's middle draw stars together, and stars push each other apart (a force layout,
// like Graphify's). Plain data in, plain data out, so it can be tested; map.js draws the result.
//
// layoutNebula([{ path, lines, imports }]) gives { radius, nodes, links, clouds }
//   nodes:  [{ path, lines, cloud, degree, x, y, z }]   only real files, no folders
//   links:  [[a, b], ...]                               indexes into nodes, each pair once
//   clouds: [{ dir, color, x, y, z, spread, count }]    one per folder, color '#rrggbb'
// importLinks(files, at) is the links alone, for the City too; blastRadius(links, i) what depends on file i.
// curvePoints(a, b, steps) is the gentle arc a link is drawn along.

import { hash } from './city.js'

const SPACE = 6 // about the gap between neighbouring stars, in world units
const GOLDEN = Math.PI * (3 - Math.sqrt(5))
// Folder colours, picked to be told apart on the dark sky: warm and cool alternate, no two near each other on the colour wheel.
const PALETTE = ['#ffc23d', '#3dd9ff', '#ff4fa3', '#5be37d', '#6f6bff', '#ff6a3d', '#c35bff', '#c6e84a', '#2fb5a0']

// the colour of the i-th folder, as '#rrggbb': the palette first, then steps round the colour wheel (a golden-ratio turn
// each, so neighbours differ) with the lightness alternating
export const cloudColor = i => {
  if (i < PALETTE.length) return PALETTE[i]
  const h = (i * 0.618034) % 1
  const l = i % 2 ? 0.72 : 0.55
  const f = n => {
    const k = (n + h * 12) % 12
    const c = l - 0.8 * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(c * 255).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

// the import links among some files: [[a, b], ...] as numbered by `at` (Map path -> number), each pair once
export const importLinks = (files, at) => {
  const seen = new Set()
  const out = []
  for (const f of files) {
    for (const to of f.imports ?? []) {
      const a = at.get(f.path)
      const b = at.get(to)
      const key = a < b ? `${a} ${b}` : `${b} ${a}`
      if (a === undefined || b === undefined || a === b || seen.has(key)) continue
      seen.add(key)
      out.push([a, b])
    }
  }
  return out
}

// the blast radius of one file: every file that depends on it, directly or through others, with how many steps
// away it is: Map(number -> steps), the file itself 0. links are [[importer, imported], ...] as importLinks gives them
export const blastRadius = (links, start) => {
  const users = new Map()
  for (const [a, b] of links) (users.get(b) ?? users.set(b, []).get(b)).push(a)
  const out = new Map([[start, 0]])
  let ring = [start]
  for (let steps = 1; ring.length; steps++) {
    const next = []
    for (const i of ring) {
      for (const a of users.get(i) ?? []) {
        if (out.has(a)) continue
        out.set(a, steps)
        next.push(a)
      }
    }
    ring = next
  }
  return out
}

const dirOf = path => path.slice(0, Math.max(path.lastIndexOf('/'), 0))

const GAP = SPACE * 3 // the empty space left between two folders' clouds
// about how far a cloud of this many files reaches from its middle
const cloudRadius = count => SPACE * (1 + Math.cbrt(count) * 0.9)

// pushes the clouds' middles apart until each is its radius plus the gap from the next (in place), drawing them in a little
// as it goes so the whole stays compact
const keepApart = (clouds, sizes) => {
  for (let step = 0; step < 80; step++) {
    for (let i = 0; i < clouds.length; i++) {
      for (let j = i + 1; j < clouds.length; j++) {
        const a = clouds[i]
        const b = clouds[j]
        const dx = b.x - a.x || 0.001 * (j - i)
        const dy = b.y - a.y
        const dz = b.z - a.z
        const d = Math.hypot(dx, dy, dz)
        const move = (sizes[i] + sizes[j] + GAP - d) / 2
        if (move <= 0) continue
        for (const [k, v] of [['x', dx], ['y', dy], ['z', dz]]) {
          a[k] -= (v / d) * move * 0.5
          b[k] += (v / d) * move * 0.5
        }
      }
    }
    for (const c of clouds) for (const k of ['x', 'y', 'z']) c[k] *= 0.985
  }
}

export const layoutNebula = (files, iterations) => {
  const out = { radius: 0, nodes: [], links: [], clouds: [] }
  if (!files.length) return out
  const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : 1))
  const at = new Map(sorted.map((f, i) => [f.path, i]))

  // clouds: one per folder, their middles spread over a sphere, then pushed apart so there is empty space between them
  const dirs = [...new Set(sorted.map(f => dirOf(f.path)))]
  const cloudOf = new Map(dirs.map((dir, i) => [dir, i]))
  const radius = Math.max(20, Math.cbrt(files.length) * SPACE * 1.4)
  const counts = new Map()
  for (const f of sorted) counts.set(dirOf(f.path), (counts.get(dirOf(f.path)) ?? 0) + 1)
  const sizes = dirs.map(dir => cloudRadius(counts.get(dir)))
  const shell = dirs.length === 1 ? 0 : Math.max(radius * 0.7, 1.4 * Math.cbrt(sizes.reduce((sum, r) => sum + r ** 3, 0)))
  out.clouds = dirs.map((dir, i) => {
    const y = dirs.length === 1 ? 0 : 1 - (2 * (i + 0.5)) / dirs.length
    const r = Math.sqrt(1 - y * y)
    return { dir, color: cloudColor(i), x: Math.cos(i * GOLDEN) * r * shell, y: y * shell, z: Math.sin(i * GOLDEN) * r * shell, spread: 0, count: 0 }
  })
  // shortcut: the push is every pair of folders, so a repo with over 300 folders keeps the even spread, when it needs a grid
  if (dirs.length > 1 && dirs.length <= 300) keepApart(out.clouds, sizes)

  // stars start in a small ball round their cloud's middle
  out.nodes = sorted.map(f => {
    const cloud = cloudOf.get(dirOf(f.path))
    const c = out.clouds[cloud]
    const u = hash(f.path) * 2 - 1
    const t = hash(`${f.path}#`) * Math.PI * 2
    const s = SPACE * (1 + hash(`${f.path}*`) * 2)
    const r = Math.sqrt(1 - u * u)
    return { path: f.path, lines: f.lines, cloud, degree: 0, x: c.x + Math.cos(t) * r * s, y: c.y + u * s, z: c.z + Math.sin(t) * r * s }
  })
  out.links = importLinks(sorted, at)
  for (const [a, b] of out.links) {
    out.nodes[a].degree++
    out.nodes[b].degree++
  }

  settle(out, iterations ?? Math.round(Math.max(40, Math.min(220, 400000 / files.length))))

  for (const c of out.clouds) Object.assign(c, { x: 0, y: 0, z: 0 })
  for (const n of out.nodes) {
    const c = out.clouds[n.cloud]
    c.x += n.x
    c.y += n.y
    c.z += n.z
    c.count++
  }
  for (const c of out.clouds) for (const k of ['x', 'y', 'z']) c[k] /= c.count
  for (const n of out.nodes) {
    const c = out.clouds[n.cloud]
    c.spread = Math.max(c.spread, Math.hypot(n.x - c.x, n.y - c.y, n.z - c.z))
    out.radius = Math.max(out.radius, Math.hypot(n.x, n.y, n.z))
  }
  out.radius = Math.max(out.radius, SPACE * 3)
  return out
}

const cellKey = (x, y, z) => ((x + 1024) * 2048 + y + 1024) * 2048 + z + 1024

// the force layout: links are springs, stars push apart when close (a grid finds the close ones),
// each star is pulled softly to its cloud's middle and everything to the centre
const settle = ({ nodes, links, clouds }, iterations) => {
  const n = nodes.length
  const vx = new Float64Array(n)
  const vy = new Float64Array(n)
  const vz = new Float64Array(n)
  const cell = SPACE * 2.5
  for (let step = 0; step < iterations; step++) {
    const heat = 1 - step / iterations
    const grid = new Map()
    nodes.forEach((p, i) => {
      const key = cellKey(Math.floor(p.x / cell), Math.floor(p.y / cell), Math.floor(p.z / cell))
      ;(grid.get(key) ?? grid.set(key, []).get(key)).push(i)
    })
    nodes.forEach((p, i) => {
      const gx = Math.floor(p.x / cell)
      const gy = Math.floor(p.y / cell)
      const gz = Math.floor(p.z / cell)
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
        for (const j of grid.get(cellKey(gx + a, gy + b, gz + c)) ?? []) {
          if (j <= i) continue
          const q = nodes[j]
          let dx = p.x - q.x
          let dy = p.y - q.y
          let dz = p.z - q.z
          let d2 = dx * dx + dy * dy + dz * dz
          if (d2 > cell * cell) continue
          if (d2 < 1e-6) [dx, dy, dz, d2] = [0.01 * (i % 7) + 0.01, 0.01, 0.01 * (j % 5), 1e-4]
          const f = (SPACE * SPACE * 0.9) / d2
          vx[i] += dx * f; vy[i] += dy * f; vz[i] += dz * f
          vx[j] -= dx * f; vy[j] -= dy * f; vz[j] -= dz * f
        }
      }
    })
    for (const [a, b] of links) {
      const p = nodes[a]
      const q = nodes[b]
      const dx = q.x - p.x
      const dy = q.y - p.y
      const dz = q.z - p.z
      const d = Math.hypot(dx, dy, dz) || 1
      const same = p.cloud === q.cloud
      const pull = same ? SPACE * 1.6 : SPACE * 4 // a link across clouds is longer
      const f = ((d - pull) / d) * (same ? 0.06 : 0.015) // and weaker, or the clouds would be pulled into each other
      vx[a] += dx * f; vy[a] += dy * f; vz[a] += dz * f
      vx[b] -= dx * f; vy[b] -= dy * f; vz[b] -= dz * f
    }
    nodes.forEach((p, i) => {
      const c = clouds[p.cloud]
      vx[i] += (c.x - p.x) * 0.05 - p.x * 0.002
      vy[i] += (c.y - p.y) * 0.05 - p.y * 0.002
      vz[i] += (c.z - p.z) * 0.05 - p.z * 0.002
      const v = Math.hypot(vx[i], vy[i], vz[i])
      const max = SPACE * 1.5 * heat + 0.05
      const k = v > max ? max / v : 1
      p.x += vx[i] * k
      p.y += vy[i] * k
      p.z += vz[i] * k
      vx[i] *= 0.5; vy[i] *= 0.5; vz[i] *= 0.5
    })
  }
}

export const curvePoints = (a, b, steps = 16) => {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const length = Math.hypot(dx, b.y - a.y, dz)
  const side = Math.hypot(dx, dz) || 1
  const bend = length * 0.14
  const mid = { x: (a.x + b.x) / 2 - (dz / side) * bend, y: (a.y + b.y) / 2 + length * 0.06, z: (a.z + b.z) / 2 + (dx / side) * bend }
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps
    const k = [(1 - t) * (1 - t), 2 * (1 - t) * t, t * t]
    return { x: k[0] * a.x + k[1] * mid.x + k[2] * b.x, y: k[0] * a.y + k[1] * mid.y + k[2] * b.y, z: k[0] * a.z + k[1] * mid.z + k[2] * b.z }
  })
}
