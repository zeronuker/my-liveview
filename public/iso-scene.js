// The place itself in the angled view, painted once on small canvases (16 pixels to a tile, see
// iso-art.js) and drawn scaled up with no smoothing. The ground is two pictures, which differ only in
// the pond's water. Walls, furniture, fence, trees, bushes and rocks are cut into bands, one for each
// diagonal row of tiles (x + y the same), because that is the order things are drawn in: back to front.
// office.js draws a band, then the people standing in it, so a wall or a desk in front hides their
// feet. Desk monitors are separate, as they light up, and so are the blinking lights (lights.js) and the hanging lamps,
// which are drawn over everyone.
import { overheadArts } from './art/overhead.js'
import { buildGarden } from './garden.js'
import { cellHash, groundTile, lightsOf, makeWorld, monitor, slabTile, structureTile } from './iso-art.js'
import { fenceTile, gardenPieces, gardenTile, grassDetail, isFence } from './iso-garden.js'
import { ISO_RISE, isoExtent } from './iso.js'
import { lightColor } from './lights.js'
import { paint } from './scenery.js'

const UP = 24 // pixels a wall or a piece of furniture may stand above its tile's top corner
const MONITOR = { w: 16, h: 14, base: 12 } // a monitor's picture, and where its tile's top corner is in it

const canvasOf = (width, height) => Object.assign(document.createElement('canvas'), { width, height })

export const createIsoScene = layout => {
  const world = makeWorld(layout)
  const garden = buildGarden(layout)
  const { width: W, height: H } = layout
  // where a tile's diamond starts, in the pixels of the pictures below
  const left = (x, y) => (x - y + H) * 8 - 8
  const top = (x, y) => (x + y) * 4 + ISO_RISE * 16

  const grounds = [0, 1].map(frame => {
    const ground = canvasOf((W + H) * 8, Math.ceil(isoExtent(layout).height * 16))
    const g = ground.getContext('2d')
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const [px, py] = [left(x, y), top(x, y)]
        if (world.isBuilding(x, y) || !gardenTile(g, garden, px, py, x, y, frame)) {
          groundTile(g, world, px, py, x, y)
          if (!world.isBuilding(x, y)) grassDetail(g, px, py, x, y)
        }
      }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) slabTile(g, world, left(x, y), top(x, y), x, y)
    return ground
  })

  // the desk in front of each seat is where a monitor stands
  const monitorKeys = new Set(layout.spots.desks.map(({ desk }) => `${desk.x},${desk.y}`))

  // trees, bushes and rocks, each a picture standing with its foot on the middle of its tile
  const pieces = gardenPieces(garden).map(({ x, y, ops, w, h, foot }) => {
    const image = canvasOf(w, h)
    paint(image.getContext('2d'), ops)
    return { d: x + y, image, left: left(x, y) + 8 - foot[0], top: top(x, y) + 4 - foot[1] }
  })

  // the hanging lamps: the flat view's own upright picture, hung over the middle of a tile with its bulb 12 pixels up
  const lampArt = overheadArts.pendant
  const lampImage = canvasOf(16, 19)
  paint(lampImage.getContext('2d'), lampArt.ops())
  const lamps = world.pendants.map(({ x, y }) => {
    const [at, atTop] = [left(x, y), top(x, y) + 4 - 12 - 19]
    return { left: at, top: atTop, lights: lampArt.lights().map(l => ({ ...l, x: at + l.x, y: atTop + l.y })) }
  })

  // a light, drawn on whole screen pixels
  const drawLights = (ctx, { tile, left: x0, top: y0 }, lights, t, reduced) => {
    const s = tile / 16
    for (const l of lights) {
      const [x, y] = [Math.round(x0 + l.x * s), Math.round(y0 + l.y * s)]
      ctx.fillStyle = lightColor(l, t, reduced)
      ctx.fillRect(x, y, Math.max(1, Math.round(x0 + (l.x + l.w) * s) - x), Math.max(1, Math.round(y0 + (l.y + l.h) * s) - y))
    }
  }

  const bands = []
  for (let d = 0; d < W + H - 1; d++) {
    const tiles = []
    for (let x = Math.max(0, d - (H - 1)); x <= Math.min(W - 1, d); x++) {
      const y = d - x
      if (world.isWall(x, y) || world.furnAt(x, y) || world.doorAt(x, y) || isFence(garden, x, y)) tiles.push([x, y])
    }
    const standing = pieces.filter(piece => piece.d === d)
    if (!tiles.length && !standing.length) {
      bands.push(null)
      continue
    }
    let image = null
    let origin = 0
    if (tiles.length) {
      origin = Math.min(...tiles.map(([x, y]) => left(x, y)))
      image = canvasOf(Math.max(...tiles.map(([x, y]) => left(x, y))) - origin + 16, UP + 10)
      const c = image.getContext('2d')
      for (const [x, y] of tiles) {
        const [px, py] = [left(x, y) - origin, UP]
        if (isFence(garden, x, y)) fenceTile(c, garden, px, py, x, y)
        else structureTile(c, world, px, py, x, y)
      }
    }
    // the blinking lights of the walls and furniture in this row, in the pictures' pixels
    const lights = tiles.flatMap(([x, y]) => lightsOf(world, x, y).map(({ dx, dy, ...light }) => ({ ...light, x: left(x, y) + dx, y: top(x, y) + dy })))
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
    bands.push({ image, left: origin, top: d * 4 + ISO_RISE * 16 - UP, monitors, standing, lights })
  }

  return {
    bandCount: bands.length,
    // `frame` is 0 or 1, the pond's two pictures
    drawGround: (ctx, { tile, left: x0, top: y0 }, frame) => {
      const ground = grounds[frame]
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(ground, x0, y0, (ground.width * tile) / 16, (ground.height * tile) / 16)
    },
    // the walls and furniture of one diagonal row; `open` holds the desks with someone typing, whose screens are lit; `t` is
    // the time in seconds, and `reduced` holds every light still
    drawBand: (ctx, view, d, open, t, reduced) => {
      const { tile, left: x0, top: y0 } = view
      const band = bands[d]
      if (!band) return
      const s = tile / 16
      ctx.imageSmoothingEnabled = false
      if (band.image) ctx.drawImage(band.image, x0 + band.left * s, y0 + band.top * s, band.image.width * s, band.image.height * s)
      for (const m of band.monitors) ctx.drawImage(open.has(m.key) ? m.on : m.off, x0 + m.left * s, y0 + m.top * s, MONITOR.w * s, MONITOR.h * s)
      for (const p of band.standing) ctx.drawImage(p.image, x0 + p.left * s, y0 + p.top * s, p.image.width * s, p.image.height * s)
      drawLights(ctx, view, band.lights, t, reduced)
    },
    // what hangs over everyone: the lamps
    drawOver: (ctx, view, t, reduced) => {
      const s = view.tile / 16
      ctx.imageSmoothingEnabled = false
      for (const lamp of lamps) {
        ctx.drawImage(lampImage, view.left + lamp.left * s, view.top + lamp.top * s, 16 * s, 19 * s)
        drawLights(ctx, view, lamp.lights, t, reduced)
      }
    },
  }
}
