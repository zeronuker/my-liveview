// The Office view: a canvas that draws the stage. Events from the server go in
// (feed); the director turns them into commands; the stage plays them over
// time; this file only paints what the stage says. The pixel art is in
// sprites.js (the people) and scenery.js (the floors, walls and furniture); a
// pose with no sprite is drawn as plain shapes.
import { createDirector } from './director.js'
import { createEffects, isShown } from './effects.js'
import { createSound, soundFor } from './sound.js'
import { fit, keepInView, zoomAt } from './layout.js'
import { createStage } from './stage.js'
import { buildStudio } from './studio.js'
import { groundOps, itemsOf, LAPTOP, paint, TILE } from './scenery.js'
import { carrySprite, spriteFor } from './sprites.js'

const BUBBLES = { ok: '--afg', bad: '--dfg', ask: '--nfg', info: '--acc' }
const SKIN = '#f1c9a5'
// one colour for each chat, when more than one is at work
const CHAT_COLORS = ['#ffd166', '#06d6a0', '#ef476f', '#118ab2', '#c77dff', '#f78c6b', '#80ed99', '#9bf6ff', '#ffadad', '#bdb2ff', '#fdffb6', '#caffbf']
const SEATED = new Set(['sit', 'type', 'read', 'review']) // behind a desk or on a seat: lower, so a desk hides the legs
const QUIET_MS = 45 * 1000 // nothing heard, and nothing running: the turn is taken to be over
const STALE_MS = 10 * 60 * 1000 // nothing heard for this long: over, whatever seems to be running

const hash = text => [...text].reduce((total, ch) => (total * 31 + ch.charCodeAt(0)) % 1000, 7)

const roundRect = (ctx, x, y, w, h, r) => {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

// `getMult` is the speed (see stage.js); `getChatName` says what a chat is called
export const createOffice = ({ canvas, getMult, getChatName = () => '', onView = () => {} }) => {
  const layout = buildStudio()
  const director = createDirector()
  const stage = createStage({ layout, getMult })
  const effects = createEffects()
  const sound = createSound()
  // the person's setting for less motion: no confetti, rings, glyphs, bobbing or breathing
  const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)')
  let reduced = motion?.matches ?? false
  motion?.addEventListener?.('change', event => (reduced = event.matches))
  let lastDraw = 0
  let paused = false
  let manual = null // a zoomed and panned view { tile, left, top }; null while the whole plan is fitted
  let selected = '' // the chat picked in the list, whose workers stand out; '' for all
  let multiChat = false // more than one chat at work: tag every name with its chat's colour
  const chatSlots = new Map()
  const chatColor = id => {
    if (!chatSlots.has(id)) chatSlots.set(id, CHAT_COLORS[chatSlots.size % CHAT_COLORS.length])
    return chatSlots.get(id)
  }
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

  // the font does not change, so it is asked for once
  let family = ''
  const fontFamily = () => (family ||= getComputedStyle(canvas).fontFamily)

  const text = (value, x, y, size, fill, align = 'center') => {
    ctx.font = `500 ${size}px ${fontFamily()}`
    ctx.textAlign = align
    ctx.textBaseline = 'middle'
    ctx.fillStyle = fill
    ctx.fillText(value, x, y)
  }

  // The floor, walls and furniture are painted once on small canvases, 16 pixels
  // to a tile, and drawn scaled up with no smoothing.
  const smallCanvas = (w, h, ops) => {
    const small = document.createElement('canvas')
    small.width = w
    small.height = h
    paint(small.getContext('2d'), ops)
    return small
  }
  const ground = smallCanvas(layout.width * TILE, layout.height * TILE, groundOps(layout))
  const items = itemsOf(layout).map(item => ({ ...item, image: smallCanvas(item.w * TILE, item.h * TILE, item.ops) }))
  const laptops = { open: smallCanvas(TILE, TILE, LAPTOP.open), closed: smallCanvas(TILE, TILE, LAPTOP.closed) }
  // the desk behind each seat, so its laptop can open when someone is writing there
  const deskOfSeat = new Map(layout.spots.desks.map(d => [`${d.x},${d.y}`, `${d.desk.x},${d.desk.y}`]))
  const laptopDesks = new Set(deskOfSeat.values())

  // words on the floor and walls: light, with a dark edge, so they read on any theme
  const label = (value, x, y, size, align = 'center') => {
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.8)'
    ctx.shadowBlur = 3
    text(value, x, y, size, '#e6e2f2', align)
    ctx.restore()
  }

  const drawPlan = ({ tile, left, top }) => {
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(ground, left, top, layout.width * tile, layout.height * tile)
    // a room's name goes in its top-left corner; small rooms and stairs have none
    for (const room of layout.rooms)
      if (tile >= 9 && room.w >= 4 && room.level !== 'stairs') label(room.name, left + (room.x + 0.4) * tile, top + (room.y + 0.55) * tile, Math.max(9, tile * 0.5), 'left')
    const gate = layout.spots.entrance
    label('Front gate', left + (gate.x + 0.5) * tile, top + (gate.y + 0.5) * tile, Math.max(8, tile * 0.4))
  }

  const drawItem = (item, { tile, left, top }, open) => {
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(item.image, left + item.x * tile, top + item.y * tile, item.w * tile, item.h * tile)
    const key = `${item.x},${item.y}`
    if (item.kind === 'desk' && laptopDesks.has(key)) ctx.drawImage(open.has(key) ? laptops.open : laptops.closed, left + item.x * tile, top + item.y * tile, tile, tile)
  }

  const bubble = (value, kind, x, y, tile, ink) => {
    const size = Math.max(9, tile * 0.5)
    ctx.font = `600 ${size}px ${fontFamily()}`
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

  // draws the body now; the name, label and bubble go in `tags`, to be drawn on top of everything
  const drawPerson = (p, { tile, left, top }, t, ink, tags) => {
    const phase = t * 10 + hash(p.id)
    const walking = p.pose === 'walk'
    const dx = p.pose === 'shake' && !reduced ? Math.sin(phase * 3) * tile * 0.1 : 0
    const dy = reduced ? 0 : walking
      ? -Math.abs(Math.sin(phase)) * tile * 0.12
      : p.pose === 'cheer' ? -Math.abs(Math.sin(phase * 0.8)) * tile * 0.2 // a little hop
        : p.pose === 'type' ? Math.sin(phase * 2) * tile * 0.03 : 0
    // someone from a chat other than the one picked is dimmed
    const dim = selected && p.sessionId && p.sessionId !== selected
    ctx.save()
    if (dim) ctx.globalAlpha = 0.35
    const cx = left + (p.x + 0.5) * tile + dx
    const drop = SEATED.has(p.pose) ? tile * 0.3 : 0
    const cy = top + (p.y + 0.5) * tile + dy + drop

    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    ctx.beginPath()
    ctx.ellipse(cx, cy + tile * 0.4, tile * 0.28, tile * 0.1, 0, 0, Math.PI * 2)
    ctx.fill()

    // the pixel-art person, and the plain shapes for a pose that has no sprite
    // with less motion, a resting person stays in one frame; walking still walks
    const sprite = spriteFor({ pose: p.pose, t: reduced && !walking ? 0 : t, id: p.id, kind: p.kind, color: p.color, dir: p.dir })
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

    ctx.restore()

    tags.push(() => {
      ctx.save()
      if (dim) ctx.globalAlpha = 0.35
      const fontSize = Math.max(8, tile * 0.42)
      const named = tile >= 11 // too small to read: no names
      if (named) label(p.name, cx, cy + tile * 0.62, fontSize)
      if (multiChat && p.sessionId) {
        // a dot in the chat's colour, just before the name
        ctx.font = `500 ${fontSize}px ${fontFamily()}`
        const radius = Math.max(2, tile * 0.11)
        ctx.beginPath()
        ctx.arc(named ? cx - ctx.measureText(p.name).width / 2 - radius - 2 : cx, cy + tile * 0.62, radius, 0, Math.PI * 2)
        ctx.fillStyle = chatColor(p.sessionId)
        ctx.fill()
        ctx.strokeStyle = 'rgba(0,0,0,0.6)'
        ctx.stroke()
      }
      if (p.label && tile >= 14) text(p.label, cx, cy + tile * 0.62 + fontSize * 1.1, fontSize * 0.9, '#b9b4c8')
      if (p.bubble) bubble(p.bubble.text, p.bubble.kind, cx, headTop, tile, ink)
      ctx.restore()
    })
  }

  // which colour is which chat, in the corner
  const drawLegend = here => {
    const size = 11
    const shown = here.slice(0, 10)
    shown.forEach((id, i) => {
      const y = 14 + i * 16
      ctx.beginPath()
      ctx.arc(14, y, 4, 0, Math.PI * 2)
      ctx.fillStyle = chatColor(id)
      ctx.fill()
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'
      ctx.stroke()
      const name = getChatName(id) || id.slice(0, 6)
      label(name.length > 24 ? `${name.slice(0, 23)}…` : name, 24, y, size, 'left')
    })
    if (here.length > shown.length) label(`+${here.length - shown.length} more`, 24, 14 + shown.length * 16, size, 'left')
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
        const x = cx + (reduced ? 0 : Math.sin(e.age * 20) * tile * 0.1) // it wobbles
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
    const view = manual ? keepInView(manual, layout, width, height) : fit(width, height, layout)
    const t = performance.now() / 1000
    const ink = {
      fg: color('--fg'), dim: color('--dim'), line: color('--line'), panel: color('--panel'), bg: color('--bg'), acc: color('--acc'),
      ok: color(BUBBLES.ok), bad: color(BUBBLES.bad), ask: color(BUBBLES.ask), info: color(BUBBLES.info),
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    // an opaque ground, so a recording of the canvas looks like the screen
    ctx.fillStyle = ink.bg
    ctx.fillRect(0, 0, width, height)
    drawPlan(view)

    // who is writing where: that desk's laptop is open
    const open = new Set()
    for (const person of snap.workers) {
      if (person.pose !== 'type') continue
      const desk = deskOfSeat.get(`${Math.round(person.x)},${Math.round(person.y)}`)
      if (desk) open.add(desk)
    }

    // Everything is drawn from the back to the front: chairs and sofas first,
    // then whatever is further up the plan before what is further down, so a
    // desk hides the legs of whoever sits behind it.
    for (const item of items) if (item.under) drawItem(item, view, open)
    const seat = layout.spots.ceoSeat
    const ceo = { id: 'ceo', name: 'CEO', color: '#264653', kind: 'manager', x: seat.x, y: seat.y, pose: 'sit', dir: 'down', facing: 1, bubble: snap.ceo.bubble, label: snap.ceo.papers > 0 ? `${snap.ceo.papers} approved` : '', carry: null }
    const here = [...new Set(snap.workers.map(w => w.sessionId).filter(Boolean))]
    multiChat = here.length > 1
    const tags = []
    const draws = items.filter(item => !item.under).map(item => ({ key: item.y + item.h, run: () => drawItem(item, view, open) }))
    for (const person of [ceo, ...snap.workers]) draws.push({ key: person.y + 0.9, run: () => drawPerson(person, view, t, ink, tags) })
    for (const one of draws.sort((a, b) => a.key - b.key)) one.run()

    // the number of papers on the manager's tray, and then names, labels and bubbles
    const tray = layout.furniture.find(item => item.kind === 'tray')
    if (snap.stack > 0) label(`${snap.stack}`, view.left + (tray.x + 0.5) * view.tile, view.top + (tray.y + 0.5) * view.tile, Math.max(9, view.tile * 0.5))
    for (const tag of tags) tag()
    if (multiChat) drawLegend(here)

    // effects: what the stage says happened, and code glyphs rising from whoever is writing
    const now = performance.now()
    const dt = paused || !lastDraw ? 0 : Math.min(0.1, (now - lastDraw) / 1000)
    lastDraw = now
    for (const e of stage.takeEffects()) {
      sound.play(soundFor(e.kind))
      if (isShown(e.kind, reduced)) effects.spawn(e.kind, e.x, e.y, e)
    }
    for (const person of snap.workers) {
      if (person.pose !== 'type' || paused || Math.random() >= 2 * dt) continue
      sound.play('click') // each line of code typed
      if (isShown('glyph', reduced)) effects.spawn('glyph', person.x, person.y - 0.6)
    }
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

  // Zoom with the wheel, pan by dragging, double-click to fit the whole plan again.
  const setManual = value => {
    const was = manual !== null
    manual = value
    if ((manual !== null) !== was) {
      canvas.style.cursor = manual ? 'grab' : ''
      onView(manual !== null)
    }
  }
  canvas.addEventListener(
    'wheel',
    event => {
      event.preventDefault()
      const base = fit(width, height, layout)
      const next = zoomAt(manual ?? base, base, { x: event.offsetX, y: event.offsetY }, Math.exp(-event.deltaY * 0.0015))
      setManual(next.tile <= base.tile * 1.001 ? null : next) // all the way out is the fitted plan
    },
    { passive: false },
  )
  let drag = null
  canvas.addEventListener('pointerdown', event => {
    if (!manual || event.button !== 0) return
    drag = { x: event.clientX, y: event.clientY }
    canvas.setPointerCapture(event.pointerId)
    canvas.style.cursor = 'grabbing'
  })
  canvas.addEventListener('pointermove', event => {
    if (!drag || !manual) return
    manual = keepInView({ ...manual, left: manual.left + event.clientX - drag.x, top: manual.top + event.clientY - drag.y }, layout, width, height)
    drag = { x: event.clientX, y: event.clientY }
  })
  const endDrag = () => {
    drag = null
    if (manual) canvas.style.cursor = 'grab'
  }
  canvas.addEventListener('pointerup', endDrag)
  canvas.addEventListener('pointercancel', endDrag)
  canvas.addEventListener('dblclick', () => setManual(null))

  const setSelected = id => {
    selected = id
  }

  const setPaused = on => {
    paused = on
    stage.setPaused(on)
  }

  return { feed, setVisible, setPaused, setSelected, setSound: sound.setOn, resetView: () => setManual(null), isZoomed: () => manual !== null, skip: stage.skip, isIdle: stage.isIdle }
}
