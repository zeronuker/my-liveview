// The Office's small effects: confetti when work reaches the CEO, a warning
// triangle when something goes wrong, code glyphs floating up from someone
// writing, a ring when something changes. They are particles in tile units
// (x, y as on the stage); office.js draws them. Time is in seconds. Plain data
// in, plain data out, so it can be tested.
const CONFETTI = ['#ff4d4d', '#ffeb3b', '#4caf50', '#2196f3', '#e91e63', '#9c27b0']
const GLYPHS = ['0', '1', '{', '}', ';', '>', '_']
const GLYPH_COLORS = ['#00f2ff', '#00ffaa']
const GRAVITY = 9 // tiles a second, each second

export const createEffects = ({ random = Math.random, max = 400 } = {}) => {
  let list = []
  const between = (low, high) => low + random() * (high - low)
  const pick = items => items[Math.floor(random() * items.length)]
  const add = effect => {
    if (list.length < max) list.push({ age: 0, ...effect })
  }

  // `x` and `y` are where it starts, in tiles; `tone` colours a ring
  const spawn = (kind, x, y, { tone = 'info' } = {}) => {
    switch (kind) {
      case 'confetti':
        for (let i = 0; i < 20; i++)
          add({ kind, x: x + between(-0.15, 0.15), y, vx: between(-1.2, 1.2), vy: between(-5, -2), spin: between(-8, 8), size: between(0.6, 1.4), color: pick(CONFETTI), life: between(1.5, 2.5) })
        break
      case 'warning':
        add({ kind, x, y, vy: -0.25, life: 1.2 })
        break
      case 'ring':
        add({ kind, x, y, tone, life: 0.6 })
        break
      case 'glyph':
        add({ kind, x: x + between(-0.2, 0.2), y, vy: between(-1.2, -0.6), glyph: pick(GLYPHS), color: pick(GLYPH_COLORS), life: between(1, 1.5) })
        break
    }
  }

  const update = seconds => {
    for (const e of list) {
      e.age += seconds
      if (e.kind === 'confetti') {
        e.vy += GRAVITY * seconds
        e.vx *= 0.98 ** (seconds * 60)
        e.x += e.vx * seconds
      }
      if (e.vy) e.y += e.vy * seconds
    }
    list = list.filter(e => e.age < e.life)
  }

  return { spawn, update, all: () => list }
}
