// The place itself in the angled view, painted once on small canvases (16 pixels to a tile, see
// iso-art.js) and drawn scaled up with no smoothing. The ground is one picture. Walls and furniture
// are cut into bands, one for each diagonal row of tiles (x + y the same), because that is the
// order things are drawn in: back to front. office.js draws a band, then the people standing in it,
// so a wall or a desk in front hides their feet. Desk monitors are separate, as they light up.
import { cellHash, groundTile, makeWorld, monitor, slabTile, structureTile } from './iso-art.js'
import { ISO_RISE, isoExtent } from './iso.js'

const UP = 24 // pixels a piece may stand above its tile's top corner
const MONITOR = { w: 16, h: 14, base: 12 } // a monitor's picture, and where its tile's top corner is in it

const canvasOf = (width, height) => Object.assign(document.createElement('canvas'), { width, height })

export const createIsoScene = layout => {
  const world = makeWorld(layout)
  const { width: W, height: H } = layout
  // where a tile's diamond starts, in the pixels of the pictures below
  const left = (x, y) => (x - y + H) * 8 - 8
  const top = (x, y) => (x + y) * 4 + ISO_RISE * 16

  const ground = canvasOf((W + H) * 8, Math.ceil(isoExtent(layout).height * 16))
  const g = ground.getContext('2d')
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) groundTile(g, world, left(x, y), top(x, y), x, y)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) slabTile(g, world, left(x, y), top(x, y), x, y)

  // the desk in front of each seat is where a monitor stands
  const monitorKeys = new Set(layout.spots.desks.map(({ desk }) => `${desk.x},${desk.y}`))

  const bands = []
  for (let d = 0; d < W + H - 1; d++) {
    const tiles = []
    for (let x = Math.max(0, d - (H - 1)); x <= Math.min(W - 1, d); x++) if (world.isWall(x, d - x) || world.furnAt(x, d - x)) tiles.push([x, d - x])
    if (!tiles.length) {
      bands.push(null)
      continue
    }
    const origin = Math.min(...tiles.map(([x, y]) => left(x, y)))
    const image = canvasOf(Math.max(...tiles.map(([x, y]) => left(x, y))) - origin + 16, UP + 10)
    const c = image.getContext('2d')
    for (const [x, y] of tiles) structureTile(c, world, left(x, y) - origin, UP, x, y)
    const monitors = tiles
      .filter(([x, y]) => monitorKeys.has(`${x},${y}`))
      .map(([x, y]) => {
        const [off, on] = [false, true].map(lit => {
          const small = canvasOf(MONITOR.w, MONITOR.h)
          monitor(small.getContext('2d'), 0, MONITOR.base, lit, cellHash(x, y))
          return small
        })
        return { key: `${x},${y}`, off, on, left: left(x, y), top: top(x, y) - MONITOR.base }
      })
    bands.push({ image, left: origin, top: top(...tiles[0]) - UP, monitors })
  }

  return {
    bandCount: bands.length,
    drawGround: (ctx, { tile, left: x0, top: y0 }) => {
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(ground, x0, y0, (ground.width * tile) / 16, (ground.height * tile) / 16)
    },
    // the walls and furniture of one diagonal row; `open` holds the desks with someone typing, whose screens are lit
    drawBand: (ctx, { tile, left: x0, top: y0 }, d, open) => {
      const band = bands[d]
      if (!band) return
      const s = tile / 16
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(band.image, x0 + band.left * s, y0 + band.top * s, band.image.width * s, band.image.height * s)
      for (const m of band.monitors) ctx.drawImage(open.has(m.key) ? m.on : m.off, x0 + m.left * s, y0 + m.top * s, MONITOR.w * s, MONITOR.h * s)
    },
  }
}
