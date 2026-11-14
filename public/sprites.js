// The Office's pixel art: the people, drawn in code as small grids of letters.
// Each letter is a colour (see INK). A person is a head, a torso and legs put
// together; a worker's own colours (shirt, hair, skin, trousers) are put in
// when the grid is turned into cells. Plain data in, plain data out, so it can
// be tested; office.js draws the cells on the canvas.
//
// There are three views: the front, the side (facing right; the Office flips
// it to face left) and the back. The angled Office adds two 3/4 views, `front3q`
// (turned towards the lower right) and `back3q` (towards the upper right), which
// are flipped for the other side. A view only holds the parts that differ from
// the front; anything it lacks is taken from its parent (the side for front3q,
// the back for back3q), then from the front. Grids are 12 pixels
// wide and 16 tall. Walking has 4 frames, resting poses 2 (a small squash,
// like breathing), as small sprites need no more.

export const WIDTH = 12
export const HEIGHT = 16

const BLANK = '............'

// the heads: short hair and long hair, from the front, the side and the back
const HEADS = {
  front: {
    short: [
      '...oooooo...',
      '..ohhhhhho..',
      '.ohhhhhhhho.',
      '.ohssssssho.',
      '.ohsessesho.',
      '.osssssssso.',
      '..oSSSSSSo..',
    ],
    long: [
      '...oooooo...',
      '..ohhhhhho..',
      '.ohhhhhhhho.',
      '.ohhsssshho.',
      '.ohsessesho.',
      '.ohssssssho.',
      '..ohSSSSho..',
    ],
  },
  side: {
    short: [
      '...oooooo...',
      '..ohhhhhho..',
      '.ohhhhhhhho.',
      '.ohhhhsssso.',
      '.ohhhsssesso',
      '.ohhssssso..',
      '..ohsSSSSo..',
    ],
    long: [
      '...oooooo...',
      '..ohhhhhho..',
      '.ohhhhhhhho.',
      '.ohhhhsssso.',
      '.ohhhsssesso',
      '.ohhhssssso.',
      '..ohhhSSSo..',
    ],
  },
  // turned towards the viewer's right: the face reaches the right edge, hair is on the left
  front3q: {
    short: [
      '...oooooo...',
      '..ohhhhhho..',
      '.ohhhhhhhho.',
      '.ohhhssssso.',
      '.ohhsessesso',
      '.ohhsssssso.',
      '..ohsSSSSo..',
    ],
    long: [
      '...oooooo...',
      '..ohhhhhho..',
      '.ohhhhhhhho.',
      '.ohhhssssso.',
      '.ohhsessesso',
      '.ohhhssssso.',
      '..ohhSSSSo..',
    ],
  },
  // the back of the head, a sliver of cheek showing on the right
  back3q: {
    short: [
      '...oooooo...',
      '..ohhhhhho..',
      '.ohhhhhhhho.',
      '.ohhhhhhhsso',
      '.ohhhhhhhsso',
      '.ohhhhhhhho.',
      '..ohhhSSho..',
    ],
    long: [
      '...oooooo...',
      '..ohhhhhho..',
      '.ohhhhhhhho.',
      '.ohhhhhhhsso',
      '.ohhhhhhhsso',
      '.ohhhhhhhho.',
      '..ohhhhhho..',
    ],
  },
  back: {
    short: [
      '...oooooo...',
      '..ohhhhhho..',
      '.ohhhhhhhho.',
      '.ohhhhhhhho.',
      '.ohhhhhhhho.',
      '.ohhhhhhhho.',
      '..ohhSShho..',
    ],
    long: [
      '...oooooo...',
      '..ohhhhhho..',
      '.ohhhhhhhho.',
      '.ohhhhhhhho.',
      '.ohhhhhhhho.',
      '.ohhhhhhhho.',
      '..ohhhhhho..',
    ],
  },
}

// five rows each, the last being the hips
const HIPS = '..oppppppo..'
const TORSOS = {
  front: {
    down: ['.obbbbbbbbo.', '.oBbbbbbbBo.', '.oBbbbbbbBo.', '.osbbbbbbso.', HIPS],
    type1: ['.obbbbbbbbo.', '.oBbbbbbbBo.', '.oBbbbbbbBo.', '.obbsssbbbo.', HIPS],
    type2: ['.obbbbbbbbo.', '.oBbbbbbbBo.', '.oBbbbbbbBo.', '.obbbsssbbo.', HIPS],
    read1: ['.obbbbbbbbo.', '.oBbbbbbbBo.', '.oBmwwwwmBo.', '.osmwwwwmso.', HIPS],
    read2: ['.obbbbbbbbo.', '.oBbbbbbbBo.', '.oBmwlwwmBo.', '.osmwlwwmso.', HIPS],
    give: ['.obbbbbbbbo.', '.oBbbbbbbbbs', '.oBbbbbbbBo.', '.osbbbbbbso.', HIPS],
    up: ['sobbbbbbbbos', 'BoBbbbbbbBoB', '.oBbbbbbbBo.', '.obbbbbbbbo.', HIPS],
  },
  // from the side the one arm we see hangs in the middle, and swings
  side: {
    down: ['.obbbbbbbbo.', '.obbbBBbbbo.', '.obbbBBbbbo.', '.obbbBsbbbo.', HIPS],
    swingA: ['.obbbbbbbbo.', '.obbbbbBBbo.', '.obbbbbBBbo.', '.obbbbbBsbo.', HIPS],
    swingB: ['.obbbbbbbbo.', '.obbBBbbbbo.', '.obbBBbbbbo.', '.obbBsbbbbo.', HIPS],
    type1: ['.obbbbbbbbo.', '.obbbBBbbbo.', '.obbbBBbbbo.', '.obbbbbbsso.', HIPS],
    type2: ['.obbbbbbbbo.', '.obbbBBbbbo.', '.obbbBBbbbo.', '.obbbbbbsbo.', HIPS],
    read1: ['.obbbbbbbbo.', '.obbbBBbbbo.', '.obbbbBmwwo.', '.obbbbbsmwo.', HIPS],
    read2: ['.obbbbbbbbo.', '.obbbBBbbbo.', '.obbbbBmwlo.', '.obbbbbsmwo.', HIPS],
  },
  // from behind, at a desk: no hands in front, the elbows move a little
  back: {
    down: ['.obbbbbbbbo.', '.oBbbbbbbBo.', '.oBbbbbbbBo.', '.obbbbbbbbo.', HIPS],
    type1: ['.obbbbbbbbo.', '.obBbbbbBbo.', '.oBbbbbbbBo.', '.obbbbbbbbo.', HIPS],
    type2: ['.obbbbbbbbo.', '.oBbbbbbbBo.', '.obBbbbbBbo.', '.obbbbbbbbo.', HIPS],
    read1: ['.obbbbbbbbo.', '.oBbbbbbbBo.', '.oBbbbbbbBo.', '.obbbbbbbbo.', HIPS],
    read2: ['.obbbbbbbbo.', '.obBbbbbBbo.', '.oBbbbbbbBo.', '.obbbbbbbbo.', HIPS],
  },
}

// four rows each
const LEGS = {
  front: {
    stand: ['..oppooppo..', '..oppooppo..', '..okkookko..', '..oooooooo..'],
    walkA: ['..oppooppo..', '.oppo.oppo..', '.okko.okko..', '.oooo.oooo..'],
    walkB: ['..oppooppo..', '..oppo.oppo.', '..okko.okko.', '..oooo.oooo.'],
    sit: ['..oppppppo..', '..okkppkko..', BLANK, BLANK],
  },
  // sitting: from the side the thighs go forward and a foot comes down; from behind just the thighs
  side: { sit: ['..opppppppoo', '......okkkko', BLANK, BLANK] },
  back: { sit: ['..oppppppo..', '..oppppppo..', BLANK, BLANK] },
}

const VIEWS = ['front', 'side', 'back', 'front3q', 'back3q']
const PARENT = { front3q: 'side', back3q: 'back' } // a 3/4 view takes what it lacks from here, then from the front
const part = (parts, view, key) => parts[view]?.[key] ?? parts[PARENT[view]]?.[key] ?? parts.front[key]

// A frame is a head, a torso and legs. `squash` takes a row off the hair (the
// person is a little shorter: a breath, or the middle of a step); `overlay` is
// a list of [x, y, letter] drawn on top.
const compose = (view, look, torso, legs, { squash = false, overlay = [] } = {}) => {
  const torsoRows = part(TORSOS, view, torso) ?? part(TORSOS, view, 'down')
  let rows = [...part(HEADS, view, look), ...torsoRows, ...part(LEGS, view, legs)]
  if (squash) rows = [BLANK, rows[0], ...rows.slice(2)]
  const grid = rows.map(row => [...row])
  for (const [x, y, letter] of overlay) grid[y][x] = letter
  return grid.map(row => row.join(''))
}

const HAND_UP = [[0, 3, 's'], [0, 4, 's'], [1, 5, 'B'], [1, 6, 'B']]

// What each pose looks like over time: its frames (for a view and a head) and
// how long each is shown, in seconds.
const breathe = (view, look, torso, legs) => [compose(view, look, torso, legs), compose(view, look, torso, legs, { squash: true })]
const POSES = {
  idle: { every: 0.7, frames: (v, l) => breathe(v, l, 'down', 'stand') },
  walk: {
    every: 0.15,
    frames: (v, l) => [
      compose(v, l, 'swingA', 'walkA'),
      compose(v, l, 'down', 'stand', { squash: true }),
      compose(v, l, 'swingB', 'walkB'),
      compose(v, l, 'down', 'stand', { squash: true }),
    ],
  },
  sit: { every: 0.9, frames: (v, l) => breathe(v, l, 'down', 'sit') },
  type: { every: 0.18, frames: (v, l) => [compose(v, l, 'type1', 'sit'), compose(v, l, 'type2', 'sit')] },
  read: { every: 0.8, frames: (v, l) => [compose(v, l, 'read1', 'sit'), compose(v, l, 'read2', 'sit')] },
  grab: { every: 1, frames: (v, l) => [compose(v, l, 'give', 'stand')] },
  give: { every: 1, frames: (v, l) => [compose(v, l, 'give', 'stand')] },
  ask: { every: 0.35, frames: (v, l) => [compose(v, l, 'down', 'stand', { overlay: HAND_UP }), compose(v, l, 'down', 'stand')] },
  machine: { every: 0.25, frames: (v, l) => [compose(v, l, 'type1', 'stand'), compose(v, l, 'type2', 'stand')] },
  scan: { every: 0.5, frames: (v, l) => breathe(v, l, 'down', 'stand') },
  review: { every: 0.8, frames: (v, l) => [compose(v, l, 'read1', 'sit'), compose(v, l, 'read2', 'sit')] },
  cheer: { every: 0.16, frames: (v, l) => breathe(v, l, 'up', 'stand') },
  shake: { every: 0.7, frames: (v, l) => breathe(v, l, 'down', 'stand') },
}

// Poses that only make sense facing you (a raised hand, a cheer); from behind or beside they show the front.
const FRONT_ONLY = new Set(['ask', 'cheer'])

export const poses = () => Object.keys(POSES)
export const views = () => [...VIEWS]
export const framesOf = (pose, head = 'short', view = 'front') => POSES[pose]?.frames(view, head) ?? null

// which view someone in a pose, going a way, is seen in; and does it face left (to be flipped)
const VIEW_OF = { down: 'front', up: 'back', left: 'side', right: 'side' }
// in the angled Office, down is towards the lower left, right the lower right, up the upper right and left the upper left
const ANGLED_VIEW_OF = { down: 'front3q', right: 'front3q', up: 'back3q', left: 'back3q' }
export const viewOf = (pose, dir = 'down', angled = false) => {
  const view = (angled ? ANGLED_VIEW_OF : VIEW_OF)[dir] ?? 'front'
  return FRONT_ONLY.has(pose) ? 'front' : view
}
// a 3/4 view is drawn facing right, so it is flipped for someone going towards the left of the screen
export const flipsAngled = (view, dir) => view.endsWith('3q') && (dir === 'down' || dir === 'left')

// Colours, as ramps: each shade is a little darker and a little cooler, never
// just black added.
const SKINS = [['#f3cfa8', '#d9a47f'], ['#e0ac81', '#b97f5b'], ['#c68c62', '#9c6443'], ['#8d5a3b', '#6a3f29']]
const HAIRS = [['#2f2233', '#1d1424'], ['#5a3a2a', '#3b2419'], ['#b5651d', '#8a4a12'], ['#d9b35c', '#b38e3d'], ['#8c8c9a', '#6b6b79'], ['#a03a3a', '#7a2626']]
const PANTS = ['#3b4a6b', '#4a4a55', '#5b4636']
const INK = {
  o: '#2b2233', e: '#20182a', k: '#1f1a24', w: '#f3efe6', l: '#b9b4a8', m: '#a8652f',
  y: '#e9c46a', g: '#20182a', t: '#c0392b',
}

const hashOf = text => {
  let h = 2166136261
  for (const ch of String(text)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return h >>> 0
}

// Who someone is, from their id: always the same for one id.
export const lookOf = (id, kind = 'worker') => {
  const h = hashOf(id)
  if (kind === 'manager') return { head: 'short', skin: SKINS[1], hair: HAIRS[0], pants: PANTS[0], h }
  return { head: h % 2 ? 'long' : 'short', skin: SKINS[(h >>> 1) % SKINS.length], hair: HAIRS[(h >>> 4) % HAIRS.length], pants: PANTS[(h >>> 9) % PANTS.length], h }
}

// '#rrggbb' to a darker, cooler '#rrggbb'
export const shadeOf = hex => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  let h = 0
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
  }
  h = (h * 60 + 360 + 12) % 360 // a little towards blue
  const s = d === 0 ? 0 : Math.min(1, d / (1 - Math.abs(2 * l - 1)) * 1.05)
  const l2 = l * 0.7
  const c = (1 - Math.abs(2 * l2 - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l2 - c / 2
  const [r2, g2, b2] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(h / 60) % 6]
  return `#${[r2, g2, b2].map(v => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('')}`
}

// what a kind of person wears: the manager a tie (from the front) and glasses
// (front and side), a helper a hard hat
const dressed = (rows, kind, view) => {
  const grid = rows.map(row => [...row])
  if (kind === 'manager') {
    if (view === 'front') {
      for (const [x, y] of [[5, 8], [6, 8], [5, 9], [6, 9], [5, 10], [6, 10]]) if (grid[y][x] === 'b') grid[y][x] = 't'
      for (const x of [3, 8]) if (grid[4][x] === 's') grid[4][x] = 'g'
    }
    if (view === 'front3q') for (const [x, y] of [[4, 8], [4, 9], [4, 10]]) if (grid[y][x] === 'b') grid[y][x] = 't'
    if (view === 'side' && grid[4][9] === 's') grid[4][9] = 'g'
  }
  if (kind === 'subagent')
    for (const y of [1, 2]) grid[y] = grid[y].map(cell => (cell === 'h' ? 'y' : cell))
  return grid
}

// the cells of one frame in someone's colours: a grid of '#rrggbb' or null
export const tint = (rows, { look, shirt, kind = 'worker', view = 'front' }) => {
  const ink = {
    ...INK,
    s: look.skin[0], S: look.skin[1], h: look.hair[0], H: look.hair[1], p: look.pants,
    b: shirt, B: shadeOf(shirt),
  }
  return dressed(rows, kind, view).map(row => row.map(letter => ink[letter] ?? null))
}

// Small signs of life, from the person's id and the time: every few seconds they blink (the eyes shut for a moment), and
// every so often someone who is standing or sitting still scratches their head or stretches. Always the same for one
// id; none of it with `still` (less motion).
const BLINK_FOR = 0.15 // seconds the eyes are shut
const FIDGET_FOR = 0.7 // seconds a fidget lasts
const FIDGET_POSES = new Set(['idle', 'scan', 'sit']) // the poses of someone not busy with their hands
const SCRATCH = HAND_UP
const STRETCH = [...HAND_UP, [11, 3, 's'], [11, 4, 's'], [10, 5, 'B'], [10, 6, 'B']]

export const isBlinking = (t, h) => (t + (h % 100) / 10) % (3 + (h % 30) / 10) < BLINK_FOR

// 'scratch', 'stretch' or null: which fidget someone is in at a time
export const fidgetOf = (t, h) => {
  const period = 7 + ((h >>> 8) % 9)
  const at = t + ((h >>> 4) % 50) / 5
  if (at % period >= FIDGET_FOR) return null
  return (Math.floor(at / period) + h) % 2 ? 'stretch' : 'scratch'
}

const withOverlay = (rows, overlay) => {
  const grid = rows.map(row => [...row])
  for (const [x, y, letter] of overlay) grid[y][x] = letter
  return grid.map(row => row.join(''))
}

// Which frame someone is in: `t` is the time in seconds, `dir` which way they
// face ('down', 'up', 'left', 'right'), and the id puts neighbours out of
// step. Null for a pose with no sprite (the Office then draws a shape).
export const spriteFor = ({ pose, t, id, kind = 'worker', color, dir = 'down', still = false, angled = false }) => {
  const def = POSES[pose]
  if (!def) return null
  const look = lookOf(id, kind)
  const view = viewOf(pose, dir, angled)
  const frames = def.frames(view, look.head)
  const index = Math.floor(t / def.every + (look.h % 7)) % frames.length
  let rows = frames[index]
  const blink = !still && view !== 'back' && view !== 'back3q' && isBlinking(t, look.h)
  const fidget = !still && view === 'front' && FIDGET_POSES.has(pose) ? fidgetOf(t, look.h) : null
  if (blink) rows = rows.map(row => row.replace(/e/g, 'S'))
  if (fidget) rows = withOverlay(rows, fidget === 'stretch' ? STRETCH : SCRATCH)
  return {
    width: WIDTH,
    height: HEIGHT,
    view,
    cells: tint(rows, { look, shirt: color, kind, view }),
    key: `${pose}${index}|${view}|${look.head}|${look.skin[0]}|${look.hair[0]}|${look.pants}|${color}|${kind}${blink ? '|blink' : ''}${fidget ? `|${fidget}` : ''}`,
  }
}

// small things carried
const CARRY = {
  book: { rows: ['ooooo', 'ommmo', 'omwwo', 'omwwo', 'ommmo', 'ooooo'] },
  papers: { rows: ['oooooo', 'owwwwo', 'owllwo', 'owwwwo', 'owllwo', 'owwwwo', 'oooooo'] },
}
export const carrySprite = what => {
  const item = CARRY[what]
  if (!item) return null
  return {
    width: item.rows[0].length,
    height: item.rows.length,
    cells: item.rows.map(row => [...row].map(letter => INK[letter] ?? null)),
    key: `carry-${what}`,
  }
}
