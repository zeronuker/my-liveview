// The Office view: a canvas that draws the stage. Events from the server go in
// (feed); the director turns them into commands; the stage plays them over
// time; this file only paints what the stage says. Everything is plain shapes
// for the pixel art, which is in sprites.js; a pose with no sprite is drawn as plain shapes.
import { createDirector } from './director.js'
import { createEffects } from './effects.js'
import { buildLayout, fit } from './layout.js'
import { createStage } from './stage.js'
import { carrySprite, spriteFor } from './sprites.js'

const TONES = { gray: '#8a8f98', teal: '#2a9d8f', purple: '#9b5de5', amber: '#e9c46a', coral: '#e76f51', blue: '#457b9d' }
const BUBBLES = { ok: '--afg', bad: '--dfg', ask: '--nfg', info: '--acc' }
const SKIN = '#f1c9a5'
const QUIET_MS = 45 * 1000 // nothing heard, and nothing running: the turn is taken to be over
const STALE_MS = 10 * 60 * 1000 // nothing heard for this long: over, whatever seems to be running

const hash = text => [...text].reduce((total, ch) => (total * 31 + ch.charCodeAt(0)) % 1000, 7)

const roundRect = (ctx, x, y, w, h, r) => {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

// `getMult` is the speed (see stage.js); `onChange` says the picture changed while it was not being drawn
export const createOffice = ({ canvas, getMult }) => {
  const layout = buildLayout()
  const director = createDirector()
  const stage = createStage({ layout, getMult })
  const effects = createEffects()
  let lastDraw = 0
  let paused = false
  const ctx = canvas.getContext('2d')
  let visible = false
  let frame = 0
  let width = 0
  let height = 0
  let ratio = 1

  const color = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888'

  // the stage keeps its own time whether or not it is being drawn
  const tick = () => stage.tick(performance.now())
  setInterval(() => {
    tick()
    if (!visible) stage.takeEffects() // nobody is looking: there is nothing to show
  }, 250)

  // when each chat was last heard from, so a turn that was interrupted (no Stop comes) still ends
  const lastHeard = new Map()
  const feed = event => {
    const now = performance.now()
    if (event.type === 'turn-end' || event.type === 'turn-fail' || (event.type === 'life' && event.what === 'end')) lastHeard.delete(event.sessionId)
    else if (event.sessionId) lastHeard.set(event.sessionId, now)
    for (const cmd of director.feed(event)) stage.apply(cmd, now)
  }
  setInterval(() => {
    const now = performance.now()
    for (const [sessionId, at] of lastHeard)
      if (now - at > STALE_MS || (now - at > QUIET_MS && director.isQuiet(sessionId))) feed({ type: 'turn-end', sessionId })
  }, 5000)

  const resize = () => {
    const box = canvas.getBoundingClientRect()
    ratio = window.devicePixelRatio || 1
    width = Math.max(1, Math.floor(box.width))
    height = Math.max(1, Math.floor(box.height))
    canvas.width = Math.floor(width * ratio)
    canvas.height = Math.floor(height * ratio)
  }

  const text = (value, x, y, size, fill, align = 'center') => {
    ctx.font = `500 ${size}px ${getComputedStyle(canvas).fontFamily}`
    ctx.textAlign = align
    ctx.textBaseline = 'middle'
    ctx.fillStyle = fill
    ctx.fillText(value, x, y)
  }

  const drawPlan = ({ tile, left, top }, ink) => {
    ctx.lineWidth = 1
    for (const room of layout.rooms) {
      const tone = TONES[room.tone]
      roundRect(ctx, left + room.x * tile + 1, top + room.y * tile + 1, room.w * tile - 2, room.h * tile - 2, tile * 0.3)
      ctx.globalAlpha = 0.14
      ctx.fillStyle = tone
      ctx.fill()
      ctx.globalAlpha = 0.6
      ctx.strokeStyle = tone
      ctx.stroke()
      ctx.globalAlpha = 1
      text(room.name, left + (room.x + 0.4) * tile, top + (room.y + 0.55) * tile, Math.max(9, tile * 0.5), ink.dim, 'left')
    }
    for (const item of layout.furniture) {
      roundRect(ctx, left + item.x * tile + tile * 0.06, top + item.y * tile + tile * 0.06, item.w * tile - tile * 0.12, item.h * tile - tile * 0.12, tile * 0.15)
      ctx.fillStyle = item.kind === 'machine' ? ink.acc : ink.line
      ctx.globalAlpha = item.kind === 'machine' ? 0.5 : 1
      ctx.fill()
      ctx.globalAlpha = 1
      ctx.strokeStyle = ink.dim
      ctx.stroke()
    }
    const door = layout.spots.entrance
    text('Entrance', left + (door.x + 0.5) * tile, top + (door.y + 0.5) * tile, Math.max(8, tile * 0.4), ink.dim)
  }

  const bubble = (value, kind, x, y, tile, ink) => {
    const size = Math.max(9, tile * 0.5)
    ctx.font = `600 ${size}px ${getComputedStyle(canvas).fontFamily}`
    const w = ctx.measureText(value).width + size
    const h = size * 1.5
    roundRect(ctx, x - w / 2, y - h, w, h, h / 2)
    ctx.fillStyle = ink.panel
    ctx.fill()
    ctx.strokeStyle = ink[kind] ?? ink.acc
    ctx.stroke()
    text(value, x, y - h / 2, size, ink[kind] ?? ink.acc)
  }

  // Sprites are drawn a whole number of screen pixels per sprite pixel, with no
  // smoothing, so the pixels stay crisp. One small image is kept for each look.
  const images = new Map()
  const imageOf = sprite => {
    let image = images.get(sprite.key)
    if (!image) {
      if (images.size > 3000) images.clear()
      image = document.createElement('canvas')
      image.width = sprite.width
      image.height = sprite.height
      const pen = image.getContext('2d')
      sprite.cells.forEach((row, y) =>
        row.forEach((cell, x) => {
          if (!cell) return
          pen.fillStyle = cell
          pen.fillRect(x, y, 1, 1)
        }),
      )
      images.set(sprite.key, image)
    }
    return image
  }

  // draws the person standing at (cx, cy) and says where the top of their head is
  const drawSprite = (sprite, p, cx, cy, tile) => {
    const unit = Math.max(1, Math.round((tile * ratio * 0.95) / sprite.height)) / ratio
    const h = sprite.height * unit
    const feet = Math.round((cy + tile * 0.42) * ratio) / ratio
    ctx.save()
    ctx.imageSmoothingEnabled = false
    ctx.translate(Math.round(cx * ratio) / ratio, feet - h)
    ctx.scale(p.facing < 0 ? -1 : 1, 1)
    ctx.drawImage(imageOf(sprite), (-sprite.width * unit) / 2, 0, sprite.width * unit, h)
    // what is carried is held at the side, unless the hands are busy
    const carried = ['read', 'type', 'review', 'sit'].includes(p.pose) ? null : carrySprite(p.carry)
    if (carried) ctx.drawImage(imageOf(carried), (sprite.width * unit) / 2 - carried.width * unit * 0.6, h * 0.5, carried.width * unit, carried.height * unit)
    ctx.restore()
    return feet - h - 2
  }

  const drawPerson = (p, { tile, left, top }, t, ink) => {
    const phase = t * 10 + hash(p.id)
    const walking = p.pose === 'walk'
    const dx = p.pose === 'shake' ? Math.sin(phase * 3) * tile * 0.1 : 0
    const dy = walking
      ? -Math.abs(Math.sin(phase)) * tile * 0.12
      : p.pose === 'cheer' ? -Math.abs(Math.sin(phase * 0.8)) * tile * 0.2 // a little hop
        : p.pose === 'type' ? Math.sin(phase * 2) * tile * 0.03 : 0
    const cx = left + (p.x + 0.5) * tile + dx
    const cy = top + (p.y + 0.5) * tile + dy

    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    ctx.beginPath()
    ctx.ellipse(cx, cy + tile * 0.4, tile * 0.28, tile * 0.1, 0, 0, Math.PI * 2)
    ctx.fill()

    // the pixel-art person, and the plain shapes for a pose that has no sprite
    const sprite = spriteFor({ pose: p.pose, t, id: p.id, kind: p.kind, color: p.color, dir: p.dir })
    let headTop = cy - tile * 0.5 // where a bubble goes
    if (sprite) headTop = drawSprite(sprite, p, cx, cy, tile)
    else {
      roundRect(ctx, cx - tile * 0.25, cy - tile * 0.1, tile * 0.5, tile * 0.5, tile * 0.15)
      ctx.fillStyle = p.color
      ctx.fill()
      if (p.kind === 'subagent' || p.kind === 'manager') {
        ctx.strokeStyle = p.kind === 'manager' ? '#e9c46a' : ink.fg
        ctx.lineWidth = 2
        ctx.stroke()
        ctx.lineWidth = 1
      }
      ctx.beginPath()
      ctx.arc(cx, cy - tile * 0.22, tile * 0.2, 0, Math.PI * 2)
      ctx.fillStyle = SKIN
      ctx.fill()
      ctx.fillStyle = '#222'
      for (const eye of [-0.07, 0.07]) {
        ctx.beginPath()
        ctx.arc(cx + eye * tile + p.facing * tile * 0.03, cy - tile * 0.23, tile * 0.025, 0, Math.PI * 2)
        ctx.fill()
      }

      // what is in hand, or being done
      if (p.carry === 'book') {
        ctx.fillStyle = '#c0763e'
        ctx.fillRect(cx + p.facing * tile * 0.3 - tile * 0.09, cy + tile * 0.08, tile * 0.18, tile * 0.24)
      } else if (p.carry === 'papers') {
        ctx.fillStyle = '#f5f5f0'
        ctx.fillRect(cx + p.facing * tile * 0.3 - tile * 0.12, cy + tile * 0.04, tile * 0.24, tile * 0.3)
      }
      if (p.pose === 'read') {
        ctx.fillStyle = '#f5f5f0'
        ctx.fillRect(cx - tile * 0.2, cy + tile * 0.12, tile * 0.4, tile * 0.22)
        ctx.fillStyle = '#9a9a90'
        ctx.fillRect(cx - tile * 0.01, cy + tile * 0.12, tile * 0.02, tile * 0.22)
      }
      if (p.pose === 'type') {
        ctx.fillStyle = SKIN
        const hop = Math.sin(phase * 4) * tile * 0.04
        ctx.fillRect(cx - tile * 0.18, cy + tile * 0.3 + hop, tile * 0.1, tile * 0.08)
        ctx.fillRect(cx + tile * 0.08, cy + tile * 0.3 - hop, tile * 0.1, tile * 0.08)
      }
    }

    const fontSize = Math.max(8, tile * 0.42)
    text(p.name, cx, cy + tile * 0.62, fontSize, ink.fg)
    if (p.label && tile >= 14) text(p.label, cx, cy + tile * 0.62 + fontSize * 1.1, fontSize * 0.9, ink.dim)
    if (p.bubble) bubble(p.bubble.text, p.bubble.kind, cx, headTop, tile, ink)
  }

  // confetti, warnings, rings and code glyphs, on top of everything
  const drawEffects = ({ tile, left, top }, ink) => {
    for (const e of effects.all()) {
      const p = e.age / e.life
      const cx = left + (e.x + 0.5) * tile
      const cy = top + (e.y + 0.5) * tile
      ctx.save()
      if (e.kind === 'confetti') {
        ctx.globalAlpha = Math.min(1, (1 - p) * 3)
        ctx.translate(cx, cy)
        ctx.rotate(e.spin * e.age)
        ctx.fillStyle = e.color
        ctx.fillRect((-tile * 0.12 * e.size) / 2, (-tile * 0.18 * e.size) / 2, tile * 0.12 * e.size, tile * 0.18 * e.size)
      } else if (e.kind === 'warning') {
        const size = tile * 0.7
        const x = cx + Math.sin(e.age * 20) * tile * 0.1 // it wobbles
        const y = cy - tile * 0.9
        ctx.globalAlpha = 1 - p
        ctx.beginPath()
        ctx.moveTo(x, y - size * 0.5)
        ctx.lineTo(x + size * 0.5, y + size * 0.4)
        ctx.lineTo(x - size * 0.5, y + size * 0.4)
        ctx.closePath()
        ctx.fillStyle = '#ffcc00'
        ctx.fill()
        ctx.strokeStyle = '#111'
        ctx.lineWidth = 2
        ctx.stroke()
        text('!', x, y + size * 0.12, size * 0.5, '#111')
      } else if (e.kind === 'ring') {
        ctx.globalAlpha = 1 - p
        ctx.strokeStyle = ink[e.tone] ?? ink.acc
        ctx.lineWidth = 0.5 + 2 * (1 - p)
        ctx.beginPath()
        ctx.arc(cx, cy + tile * 0.2, tile * (0.3 + 0.7 * p), 0, Math.PI * 2)
        ctx.stroke()
      } else if (e.kind === 'glyph') {
        ctx.globalAlpha = 1 - p
        ctx.font = `bold ${Math.max(8, tile * 0.35)}px "Courier New", monospace`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = e.color
        ctx.shadowColor = e.color
        ctx.shadowBlur = 4
        ctx.fillText(e.glyph, cx, cy - tile * 0.3)
      }
      ctx.restore()
    }
  }

  const draw = () => {
    frame = 0
    if (!visible) return
    const snap = stage.snapshot()
    const view = fit(width, height, layout)
    const t = performance.now() / 1000
    const ink = {
      fg: color('--fg'), dim: color('--dim'), line: color('--line'), panel: color('--panel'), bg: color('--bg'), acc: color('--acc'),
      ok: color(BUBBLES.ok), bad: color(BUBBLES.bad), ask: color(BUBBLES.ask), info: color(BUBBLES.info),
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    // an opaque ground, so a recording of the canvas looks like the screen
    ctx.fillStyle = ink.bg
    ctx.fillRect(0, 0, width, height)
    drawPlan(view, ink)

    // the manager's tray and the CEO
    const tray = layout.spots.handIn
    if (snap.stack > 0) text(`${snap.stack}`, view.left + (tray.x + 0.5) * view.tile, view.top + (tray.y + 0.5) * view.tile, Math.max(9, view.tile * 0.5), ink.fg)
    const seat = layout.spots.ceoSeat
    drawPerson({ id: 'ceo', name: 'CEO', color: '#264653', kind: 'manager', x: seat.x, y: seat.y, pose: 'idle', facing: 1, bubble: snap.ceo.bubble, label: snap.ceo.papers > 0 ? `${snap.ceo.papers} approved` : '', carry: null }, view, t, ink)

    for (const person of [...snap.workers].sort((a, b) => a.y - b.y)) drawPerson(person, view, t, ink)

    // effects: what the stage says happened, and code glyphs rising from whoever is writing
    const now = performance.now()
    const dt = paused || !lastDraw ? 0 : Math.min(0.1, (now - lastDraw) / 1000)
    lastDraw = now
    for (const e of stage.takeEffects()) effects.spawn(e.kind, e.x, e.y, e)
    for (const person of snap.workers) if (person.pose === 'type' && !paused && Math.random() < 2 * dt) effects.spawn('glyph', person.x, person.y - 0.6)
    effects.update(dt)
    drawEffects(view, ink)
    frame = requestAnimationFrame(draw)
  }

  // drawing only happens while the view is on screen; the stage runs on either way
  const setVisible = on => {
    visible = on
    if (!on) {
      cancelAnimationFrame(frame)
      frame = 0
      return
    }
    resize()
    tick() // catch up on whatever happened while it was hidden
    if (!frame) frame = requestAnimationFrame(draw)
  }

  new ResizeObserver(() => visible && resize()).observe(canvas)

  const setPaused = on => {
    paused = on
    stage.setPaused(on)
  }

  return { feed, setVisible, setPaused, skip: stage.skip, isIdle: stage.isIdle }
}
