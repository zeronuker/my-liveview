import { createMap } from './map.js'
import { createOffice } from './office.js'
import { createPane } from './pane.js'
import { nextInLine, placeEdit } from './place.js'
import { createRecorder } from './recorder.js'
import { clamp, makeResizer } from './resize.js'
import { fileLabels } from './tree.js'
import { parseView } from './viewparam.js'
import { wholeRows } from './whole.js'

const $ = id => document.getElementById(id)

const SPEEDS = [
  { name: 'slow', mult: 2 },
  { name: 'normal', mult: 1 },
  { name: 'fast', mult: 0.4 },
  { name: 'instant', mult: 0 },
]
const THEMES = ['dark', 'light', 'contrast']
const OLD_THEMES = { midnight: 'dark', terminal: 'dark' } // themes there were before, and the one each is now
const MAP_MODES = ['nebula', 'city']
const MAP_SHOW = { height: ['lines', 'changes'], footprint: ['lines', 'changes'], colour: ['folder', 'age', 'changes', 'type'], windows: ['recent', 'changes'] }
const STATES = { writing: 'writing', edited: 'edited', failed: 'NOT APPLIED', paused: 'paused', idle: 'idle' }
const FEED_MAX = 100
const ACTIVE_MS = 4000 // a chat that did something this recently counts as working

// a window opened with /?view=... is pinned to that view: it shows it, and does not save the choice (viewparam.js)
const pinned = parseView(location.search)
const PINNED_CHOICES = new Set(['office', 'map', 'angled', 'rotation'])

// what the person chose, kept in this browser between visits
const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(`lv.${key}`)
      return raw === null ? fallback : JSON.parse(raw)
    } catch {
      return fallback
    }
  },
  set(key, value) {
    if (pinned && PINNED_CHOICES.has(key)) return // a pinned window keeps its view to itself
    try {
      localStorage.setItem(`lv.${key}`, JSON.stringify(value))
    } catch {
      // a private window: the choice just is not kept
    }
  },
}
const pick = (value, isOk, fallback) => (isOk(value) ? value : fallback)
const prefs = {
  theme: pick(OLD_THEMES[store.get('theme', 'dark')] ?? store.get('theme', 'dark'), v => THEMES.includes(v), 'dark'),
  // how fast edits are typed in Code, and how fast the Office plays: each view its own (1 slow .. 4 instant)
  codeSpeed: pick(store.get('codeSpeed', store.get('speed', 2)), v => Number.isInteger(v) && v >= 1 && v <= 4, 2),
  officeSpeed: pick(store.get('officeSpeed', store.get('speed', 2)), v => Number.isInteger(v) && v >= 1 && v <= 4, 2),
  size: pick(store.get('size', 13), v => Number.isInteger(v) && v >= 11 && v <= 20, 13),
  wrap: store.get('wrap', false) === true,
  whole: store.get('whole', true) !== false,
  side: store.get('side', false) === true,
  follow: store.get('follow', true) !== false,
  nav: store.get('nav', true) !== false, // the chats at the left are open
  dock: store.get('dock', false) === true, // the floating controls are open (they start folded to a pill)
  awake: store.get('awake', false) === true,
  office: store.get('office', false) === true,
  map: store.get('map', false) === true, // with office on: the Map in place of the Office
  mapMode: pick(store.get('mapMode', 'nebula'), v => MAP_MODES.includes(v), 'nebula'),
  mapShow: Object.fromEntries(Object.entries(MAP_SHOW).map(([part, options]) => [part, pick(store.get('mapShow', {})?.[part], v => options.includes(v), options[0])])), // what a City building shows
  sound: store.get('sound', false) === true,
  drone: store.get('drone', false) === true, // the Nebula's camera roams by itself
  angled: store.get('angled', false) === true, // the Office from an angle
  rotation: pick(store.get('rotation', 0), v => Number.isInteger(v) && v >= 0 && v <= 3, 0), // and turned this many quarter turns
  reposDir: pick(store.get('reposDir', ''), v => typeof v === 'string', ''), // the folder that holds the person's repos (the Map's list)
}
// a narrow window starts with the chats closed: they would cover the view
if (window.innerWidth < 1000) prefs.nav = false
if (pinned) {
  const { name, ...choices } = pinned
  Object.assign(prefs, choices)
  document.title = `Live View: ${name}`
}

const collapsed = new Set(store.get('collapsed', [])) // folders the person closed
const customNames = store.get('names', {}) // chat id -> a name the person gave it
const wholeCache = new Map() // edit id -> its whole file, or null when the server no longer has it
const results = new Map() // tool id -> did it land
const feed = [] // newest first
const files = new Map() // sessionId|path -> { sessionId, path, adds, dels, isNew, last }
const chats = new Map() // sessionId -> { id, cwd, title, firstAt, lastAt, count }
const latest = new Map() // sessionId -> that chat's last edit
const statusOf = new Map() // sessionId -> 'busy' or 'idle', as the Claude app records it
const queue = [] // edits waiting for a pane to be free, in the order they came
let viewGen = 0 // bumped when the view is reset, so edits still on their way are dropped
let selected = '' // '' for every chat, else one chat's id
let isListsDue = false
const paused = { code: false, office: false } // Pause is each view's own
let isStopped = false
let isReplaying = true // the server's history comes first, then live events

const baseName = p => p.split(/[\\/]/).filter(Boolean).pop() ?? p

// a chat is called what the person named it, else what the app or its first
// message called it, else its project and the start of its id
const labelOf = chat => customNames[chat.id] ?? chat.title ?? `${baseName(chat.cwd)} · ${chat.id.slice(0, 6)}`
const nameOfChat = id => (chats.has(id) ? labelOf(chats.get(id)) : '')

const span = (className, text) => {
  const el = document.createElement('span')
  el.className = className
  el.textContent = text
  return el
}

const item = (tag, className, ...children) => {
  const el = document.createElement(tag)
  if (className) el.className = className
  el.append(...children)
  return el
}

// is this chat the one selected, or is every chat
const isShown = sessionId => !selected || selected === sessionId

/* the panes: up to four files watched at once */

const panes = [0, 1, 2, 3].map(index =>
  createPane({
    index,
    getPrefs: () => prefs,
    isPaused: () => paused.code,
    didFail: id => results.get(id) === false,
    onSettle: () => drain(),
    onStatus: () => refreshState(),
    onClose: pane => {
      pane.hide()
      layoutPanes()
      drain()
    },
  }),
)
$('panes').append(...panes.map(pane => pane.root))

// the card of the worker clicked in the Office
function showInspector(who) {
  const box = $('inspector')
  box.hidden = !who
  if (!who) return
  const dot = span('swatch-dot')
  dot.style.background = who.color
  box.replaceChildren(item('div', 'who', dot, who.name), ...[who.chat, who.job].filter(Boolean).map(text => span('line', text)).map(line => item('div', '', line)))
}
const office = createOffice({ canvas: $('office-canvas'), getMult: () => SPEEDS[prefs.officeSpeed - 1].mult, getChatName: id => nameOfChat(id), onView: zoomed => ($('z-fit').disabled = !zoomed), onInspect: showInspector })

const map = createMap({
  canvas: $('map-canvas'),
  tip: $('map-tip'),
  caption: $('map-caption'),
  bar: { box: $('replay'), open: $('m-replay'), play: $('r-play'), time: $('r-time'), date: $('r-date'), speed: $('r-speed'), close: $('r-close') },
  onTree: count => {
    mapFiles = count
    scheduleLists()
  },
  onFolders: list => {
    mapFolders = list
    scheduleLists()
  },
})
let mapFiles = -1 // how many files the Map's repo has (0: nothing to draw), -1 before it is read
let mapFolders = [] // the nebula's folders: [{ cloud, name, color }], listed under the repo shown
// the Map shows the repo of the chat picked, else of the chat that was active last
// the Map shows a repo picked under Repos, else the chosen chat's folder, else the latest chat's
let pickedRepo = ''
const latestCwd = () => [...chats.values()].sort((a, b) => b.lastAt - a.lastAt)[0]?.cwd ?? ''
const mapCwd = () => pickedRepo || (chats.get(selected)?.cwd ?? latestCwd())

// the Map's list of repos: the git repos in the folder set in Settings, else in the folder that holds the latest chat's repo
let repos = []
let reposFrom = null
const parentOf = dir => dir.replace(/[\\/]+$/, '').replace(/[\\/][^\\/]*$/, '')
const loadRepos = () => {
  const dir = prefs.reposDir.trim() || parentOf(latestCwd())
  if (dir === reposFrom) return
  reposFrom = dir
  if (!dir) return void (repos = [])
  fetch(`/repos?dir=${encodeURIComponent(dir)}`)
    .then(res => (res.ok ? res.json() : []))
    .catch(() => [])
    .then(list => {
      if (dir !== reposFrom) return
      repos = list
      scheduleLists()
    })
}
// a folder of the repo shown, with its colour on the Map; pointing at it lights that folder there
const folderRow = folder => {
  const dot = span('fdot')
  dot.style.background = folder.color
  const row = item('button', 'frow', dot, span('ntext', folder.name))
  row.type = 'button'
  const on = () => map.lightFolder(folder.cloud)
  const off = () => map.lightFolder(-1)
  row.addEventListener('pointerenter', on)
  row.addEventListener('focus', on)
  row.addEventListener('pointerleave', off)
  row.addEventListener('blur', off)
  return item('li', 'folder', row)
}
const foldersSeen = new Set() // repos whose Folders list has been drawn since the page opened: it starts shut
const repoList = () => {
  const shown = mapCwd()
  return repos.map(repo => {
    const key = `r:${repo.path}`
    const isShown = repo.path === shown
    if (isShown && mapFolders.length && !foldersSeen.has(key)) {
      foldersSeen.add(key)
      collapsed.add(key)
    }
    return node({
      key,
      iconName: 'folder',
      label: repo.name,
      title: repo.path,
      isSelected: isShown,
      kids: isShown ? mapFolders.map(folderRow) : [],
      onPress: () => {
        pickedRepo = repo.path
        scheduleLists()
      },
    })
  })
}

// the recording is a download, named after the day and time
const download = (blob, name) => {
  const link = item('a')
  link.href = URL.createObjectURL(blob)
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(link.href), 10000)
}
const recorder = createRecorder({
  canvas: $('office-canvas'),
  save: download,
  onChange: () => {
    $('b-record').setAttribute('aria-pressed', String(recorder.isRecording))
    $('b-record').querySelector('.rec-label').textContent = recorder.isRecording ? 'Stop' : 'Record'
  },
})

/* how wide each part is: the person drags the edges, and it is remembered */

const DEFAULT_NAV = 290 // the chat list's width until the person drags it
const sizes = {
  nav: pick(store.get('navW', DEFAULT_NAV), v => Number.isFinite(v) && v >= 180 && v <= 480, DEFAULT_NAV),
  split: pick(store.get('split', 0.5), v => Number.isFinite(v) && v >= 0.2 && v <= 0.8, 0.5),
}
const panesEl = $('panes')
const splitEl = $('rz-split')
const widthRoom = () => window.innerWidth - 320 // what the chat list may take

// the share the first of two panes takes, side by side or one above the other
const applySplit = () => {
  const isTwo = panesEl.classList.contains('two')
  const isStacked = panesEl.classList.contains('stacked')
  const shares = `minmax(0, ${sizes.split}fr) minmax(0, ${1 - sizes.split}fr)`
  panesEl.style.gridTemplateColumns = isTwo && !isStacked ? shares : ''
  panesEl.style.gridTemplateRows = isTwo && isStacked ? shares : ''
  splitEl.style.top = isStacked ? `${sizes.split * 100}%` : ''
  splitEl.style.left = isStacked ? '' : `${sizes.split * 100}%`
  splitEl.setAttribute('aria-orientation', isStacked ? 'horizontal' : 'vertical')
}

const applySizes = () => {
  document.documentElement.style.setProperty('--nav-w', `${sizes.nav}px`)
  applySplit()
  for (const pane of panes) pane.updateBox()
}

// one pane, two side by side (draggable split), or three/four in a 2x2 grid
// (with three, the last one takes the whole bottom row)
const layoutPanes = () => {
  const shown = panes.filter(pane => pane.isVisible)
  panesEl.classList.toggle('two', shown.length === 2)
  panesEl.classList.toggle('quad', shown.length > 2)
  shown.forEach((pane, i) => (pane.root.style.gridColumn = shown.length === 3 && i === 2 ? '1 / -1' : ''))
  applySplit()
}

// two panes need room: below 600px of width they sit one above the other
new ResizeObserver(([entry]) => {
  panesEl.classList.toggle('stacked', entry.contentRect.width < 600)
  applySplit()
}).observe(panesEl)

makeResizer({
  el: $('rz-nav'),
  label: 'Resize the chat list',
  size: () => sizes.nav,
  fromPointer: event => event.clientX - $('files').getBoundingClientRect().left,
  min: () => 180,
  max: () => Math.min(480, widthRoom()),
  step: 16,
  set: value => {
    sizes.nav = value
    applySizes()
  },
  commit: () => store.set('navW', sizes.nav),
  reset: () => {
    sizes.nav = DEFAULT_NAV
    applySizes()
  },
})
makeResizer({
  el: splitEl,
  label: 'Resize the two files',
  size: () => sizes.split,
  fromPointer: event => {
    const rect = panesEl.getBoundingClientRect()
    return panesEl.classList.contains('stacked') ? (event.clientY - rect.top) / rect.height : (event.clientX - rect.left) / rect.width
  },
  min: () => 0.2,
  max: () => 0.8,
  step: 0.02,
  set: value => {
    sizes.split = value
    applySizes()
  },
  commit: () => store.set('split', sizes.split),
  reset: () => {
    sizes.split = 0.5
    applySizes()
  },
})

// a window made smaller takes room back from the chat list (not remembered: it may grow again)
window.addEventListener('resize', () => {
  if (sizes.nav <= widthRoom()) return
  sizes.nav = clamp(widthRoom(), 180, sizes.nav)
  applySizes()
})
applySizes()

const setState = (state, note = '') => {
  $('dot').dataset.state = state
  $('st').textContent = `${STATES[state]}${note}`
}

// the top bar: paused wins, then a refused edit, then whether anything is being written
const refreshState = () => {
  const busy = panes.filter(pane => pane.isBusy)
  const failed = panes.some(pane => pane.current && results.get(pane.current.id) === false)
  $('b-skip').disabled = !prefs.office && busy.length === 0 && queue.length === 0
  const waiting = queue.length > 0 ? ` · ${queue.length} waiting` : ''
  if (paused.code) setState('paused', waiting)
  else if (failed) setState('failed')
  else if (busy.length > 0) setState('writing', waiting)
  else if (panes.some(pane => pane.current)) setState('edited')
  else setState('idle')
  scheduleLists() // the sidebar's animation follows what the panes are doing
}

// The rows to draw: the whole file when it is wanted and still kept, else the
// changed part, with a line saying why when the whole file was wanted.
const rowsFor = event => {
  if (!prefs.whole || event.tooBig) return event.rows
  const text = wholeCache.get(event.id)
  const whole = typeof text === 'string' ? wholeRows(event.rows, text) : null
  if (whole) return whole
  const why = !event.hasWhole
    ? 'the file is over 300 KB'
    : text === null
      ? 'the whole file is only kept for the latest edits'
      : 'this edit is too large to show the file whole'
  return [{ kind: 'gap', text: `... only the changed part is shown: ${why}` }, ...event.rows]
}

const fetchWhole = id =>
  fetch(`/whole?id=${encodeURIComponent(id)}`)
    .then(
      res => (res.ok ? res.text() : null),
      () => null,
    )
    .then(text => {
      wholeCache.set(id, text)
      if (wholeCache.size > 40) wholeCache.delete(wholeCache.keys().next().value)
    })

// resolves once the whole file for an edit is at hand, if it is wanted
const ensureWhole = event =>
  prefs.whole && event.hasWhole && !wholeCache.has(event.id) ? fetchWhole(event.id) : Promise.resolve()

const keyOf = event => `${event.sessionId}|${event.path}`
const snapshot = () =>
  panes.map(pane => ({ key: pane.key(), isBusy: pane.isBusy, isVisible: pane.isVisible, usedAt: pane.usedAt }))

// A live edit goes to a pane: the one already showing that file, a finished
// one, or a second one that opens. If its file is still being written, or both
// panes are, it waits in line: an edit is never cut short, only skipped by the
// person (Skip, or the instant speed).
const place = event => {
  const { pane: at } = placeEdit(snapshot(), keyOf(event), { allowInterrupt: false })
  if (at === -1) {
    queue.push(event)
    refreshState()
    return
  }
  const pane = panes[at]
  pane.open()
  layoutPanes()
  pane.render(event, rowsFor(event), { animate: true, mult: SPEEDS[prefs.codeSpeed - 1].mult })
}

// A pane has finished: edits that waited take the panes that are free, in order.
const drain = () => {
  for (;;) {
    const i = nextInLine(snapshot(), queue.map(keyOf))
    if (i === -1) break
    place(queue.splice(i, 1)[0])
  }
  refreshState()
}

// edits are taken one after another, so they keep their order while the whole file is fetched
let chain = Promise.resolve()
const ingest = event => {
  const gen = viewGen
  chain = chain
    .then(() => ensureWhole(event))
    .then(() => {
      if (gen === viewGen) place(event)
    })
    .catch(error => console.error(error))
}

// Starts the view over, showing one edit as it ended (or nothing).
const resetView = event => {
  viewGen++
  queue.length = 0
  for (const pane of panes) pane.hide()
  layoutPanes()
  refreshState()
  if (!event) return
  const gen = viewGen
  ensureWhole(event).then(() => {
    if (gen !== viewGen) return
    panes[0].render(event, rowsFor(event), { animate: false })
    refreshState()
  })
}

// '' for every chat, else one chat; the view shows its latest edit
const select = sessionId => {
  selected = sessionId
  const event = [...latest.values()].filter(edit => isShown(edit.sessionId)).sort((a, b) => b.at - a.at)[0]
  resetView(event ?? null)
  scheduleLists()
}

// the person picks a chat in the list: it is selected, and in the Office its
// workers stand out (a chat that is followed automatically does not dim the others)
const pickChat = sessionId => {
  pickedRepo = '' // a chat picked: the Map shows its repo again
  select(sessionId)
  office.setSelected(sessionId)
}

// a file under a chat: that chat becomes the selected one, showing that file
const openFile = file => {
  selected = file.sessionId
  resetView(file.last)
  scheduleLists()
}

// the edits on screen drawn again, after a setting that changes how they look
const rerenderAll = () => {
  const jobs = panes
    .filter(pane => pane.current)
    .map(pane => {
      const event = pane.current.event
      return ensureWhole(event).then(() => {
        if (pane.current?.event === event) pane.render(event, rowsFor(event), { animate: false })
      })
    })
  Promise.all(jobs).then(drain)
}

// Skip: what is being written ends now, and whatever waited is shown as it
// ends up, the latest four staying on screen.
const skipAll = () => {
  for (const pane of panes) if (pane.isBusy) pane.finish(true)
  while (queue.length > 0) {
    const event = queue.shift()
    const { pane: at } = placeEdit(snapshot(), keyOf(event))
    panes[at].open()
    layoutPanes()
    panes[at].render(event, rowsFor(event), { animate: false })
  }
  refreshState()
}

/* the lists, and the stats bar */

// small outline icons, drawn here so no library is needed
const ICONS = {
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z',
  file: 'M14 3v4a1 1 0 0 0 1 1h4M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z',
  chat: 'M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.9-.9L3 20l1.1-4.7A8.4 8.4 0 0 1 3 11.5 8.5 8.5 0 0 1 12 3a8.5 8.5 0 0 1 9 8.5z',
  layers: 'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5',
  chevron: 'M9 6l6 6-6 6',
}
const icon = (name, className) => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('class', `icon ${className}`)
  svg.setAttribute('aria-hidden', 'true')
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', ICONS[name])
  svg.append(path)
  return svg
}

const toggleFolder = key => {
  if (!collapsed.delete(key)) collapsed.add(key)
  store.set('collapsed', [...collapsed])
  scheduleLists()
}

// One row of a tree: an arrow when it holds others, an icon, a name and
// whatever sits at the right. A folder with `opensOnPress` opens and closes
// when pressed; any other row runs `onPress`. `activity` ('working' or
// 'waiting') puts a pulsing dot on a row that work is happening in.
const node = ({ key, iconName, label, title, badge, right, meta, kids = [], isSelected, activity, opensOnPress, onPress, onRename }) => {
  const isOpen = !collapsed.has(key)
  const row = item('div', `nrow${meta ? ' tall' : ''}${isSelected ? ' sel' : ''}${activity ? ` busy ${activity}` : ''}`)
  // the sweep carries on where it was after a redraw: its start comes from one shared clock
  if (activity) row.style.setProperty('--phase', `${-(Date.now() % (activity === 'working' ? 1600 : 2800))}ms`)
  if (kids.length > 0) {
    const twisty = item('button', 'twisty', icon('chevron', 'chev'))
    twisty.type = 'button'
    twisty.setAttribute('aria-expanded', String(isOpen))
    twisty.setAttribute('aria-label', `${isOpen ? 'Collapse' : 'Expand'} ${label}`)
    twisty.onclick = () => toggleFolder(key)
    row.append(twisty)
  } else row.append(item('span', 'twisty gap'))

  const main = item('button', 'nlabel', icon(iconName, `ico-${iconName}`))
  // a row with a second line (a chat: what it changed) stacks its name over it
  const top = meta ? item('span', 'ntop', span('ntext', label)) : main
  if (!meta) main.append(span('ntext', label))
  if (badge) top.append(badge)
  if (right) top.append(right)
  if (meta) main.append(item('span', 'nbody', top, span('nmeta', meta)))
  main.type = 'button'
  if (title) main.title = activity ? `${title}\n(${activity})` : title
  if (onRename) main.ondblclick = onRename
  if (isSelected) main.setAttribute('aria-current', 'true')
  main.onclick = () => (opensOnPress && kids.length > 0 ? toggleFolder(key) : onPress?.())
  row.append(main)

  const li = item('li', 'node', row)
  if (kids.length > 0 && isOpen) li.append(item('ul', 'kids', ...kids))
  return li
}

const PHASES = { chat: 'Chatting', working: 'Working', planning: 'Planning', waiting: 'Waiting for you' }
// in the Office a chat's row says what its team is doing: the phase, and how many are on work
const phasePill = chat => {
  const { phase, busy, size } = office.chatInfo(chat.id)
  const pill = span(`phase ${phase ?? ''}`, `${PHASES[phase] ?? 'Quiet'}${phase === 'working' && size ? ` ${busy}/${size}` : ''}`)
  return pill
}
const plainCount = n => span('counts', String(n))
// under a chat's name: how many files it changed, the lines added and removed, and how long ago it started
const chatMeta = (chat, own) => {
  const adds = own.reduce((sum, file) => sum + file.adds, 0)
  const dels = own.reduce((sum, file) => sum + file.dels, 0)
  const mins = Math.floor((Date.now() - chat.firstAt) / 60000)
  return `${own.length} ${own.length === 1 ? 'file' : 'files'} · +${adds} −${dels} · ${mins < 1 ? 'just now' : mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h ${mins % 60} min`}`
}
const changeCount = file => item('span', 'counts', span('pos', `+${file.adds}`), ' ', span('neg', `−${file.dels}`))

// What each tool did, under a chat (its own) and under All chats (the latest of every chat), newest first
const ACTIVITY_SHOWN = 5 // under a chat, until "Show earlier" is pressed
const ACTIVITY_ALL = 3 // under All chats
const KIND = { Read: 'read', Edit: 'edit', Write: 'new' } // the dot's colour, as on the Map
const wholeActivity = new Set() // chats whose whole activity is listed
const ago = at => {
  const secs = Math.max(0, Math.round((Date.now() - at) / 1000))
  return secs < 60 ? `${secs}s` : secs < 3600 ? `${Math.floor(secs / 60)}m` : `${Math.floor(secs / 3600)}h`
}
const activityRow = entry => {
  const text = entry.path ? `${entry.tool.toLowerCase()} · ${baseName(entry.path)}` : entry.summary
  const when = entry.status === 'running' ? '···' : entry.status === 'failed' ? 'failed' : ago(entry.at)
  const row = item('li', `act ${entry.status}`, span(`kind ${KIND[entry.tool] ?? ''}`), span('atext', text), span('atime', when))
  row.title = `${nameOfChat(entry.sessionId)}: ${entry.summary}`
  return row
}
const earlierRow = (id, total) => {
  const isWhole = wholeActivity.has(id)
  const button = item('button', 'amore', isWhole ? 'Show fewer' : `Show ${total - ACTIVITY_SHOWN} earlier`)
  button.type = 'button'
  button.onclick = () => {
    if (!wholeActivity.delete(id)) wholeActivity.add(id)
    scheduleLists()
  }
  return item('li', 'act-more', button)
}
const section = text => item('li', 'ksec', text)

const renameChat = chat => {
  const name = window.prompt('Name this chat (leave it empty to go back to the automatic name)', labelOf(chat))
  if (name === null) return
  const trimmed = name.trim()
  if (trimmed) customNames[chat.id] = trimmed
  else delete customNames[chat.id]
  store.set('names', customNames)
  scheduleLists()
}

// Where work is happening right now: files being written in a pane, files
// waiting in line, and chats that did something moments ago or have a tool
// running. A tool that never reported back stops counting after a minute.
const activity = () => {
  const working = new Set(panes.filter(pane => pane.isBusy).map(pane => pane.key()))
  const waiting = new Set(queue.map(keyOf))
  const now = Date.now()
  const busyChats = new Set()
  for (const chat of chats.values()) {
    const status = statusOf.get(chat.id)
    const isRunning = feed.some(entry => entry.sessionId === chat.id && entry.status === 'running' && now - entry.at < 60000)
    const isRecent = now - chat.lastAt < ACTIVE_MS || isRunning
    // the app says when a chat is busy, thinking included; with no word from it, recent activity stands in
    if (status === 'busy' || (status === undefined && isRecent)) busyChats.add(chat.id)
  }
  return { working, waiting, busyChats }
}

// All chats > each chat > the files it touched, the latest edit on top
const chatTree = () => {
  const list = [...chats.values()]
  const act = activity()
  const fileKey = file => `${file.sessionId}|${file.path}`
  const fileActivity = file => (act.working.has(fileKey(file)) ? 'working' : act.waiting.has(fileKey(file)) ? 'waiting' : null)
  const chatActivity = (chat, own) =>
    act.busyChats.has(chat.id) || own.some(file => fileActivity(file) === 'working')
      ? 'working'
      : own.some(file => fileActivity(file) === 'waiting')
        ? 'waiting'
        : null

  const kidsOf = list.map(chat => {
    const own = [...files.values()].filter(file => file.sessionId === chat.id).sort((a, b) => b.last.at - a.last.at)
    return { chat, own, state: chatActivity(chat, own) }
  })
  const rootState = kidsOf.some(kid => kid.state === 'working') ? 'working' : kidsOf.some(kid => kid.state === 'waiting') ? 'waiting' : null

  // a chat: the files it touched, then what its tools did
  const chatNode = ({ chat, own, state }) => {
    const labels = fileLabels(own.map(file => file.path), chat.cwd)
    const mine = feed.filter(entry => entry.sessionId === chat.id)
    const listed = wholeActivity.has(chat.id) ? mine : mine.slice(0, ACTIVITY_SHOWN)
    return node({
      key: `c:${chat.id}`,
      iconName: 'chat',
      label: labelOf(chat),
      title: `${baseName(chat.cwd)} · ${chat.id.slice(0, 6)}\n${chat.cwd}\nDouble-click to rename`,
      right: phasePill(chat),
      meta: chatMeta(chat, own),
      isSelected: selected === chat.id,
      activity: state,
      onPress: () => pickChat(chat.id),
      onRename: () => renameChat(chat),
      kids: [
        ...(own.length ? [section('Files')] : []),
        ...own.map(file =>
          node({
            key: `f:${file.sessionId}|${file.path}`,
            iconName: 'file',
            label: labels.get(file.path),
            title: file.path,
            badge: file.isNew ? span('pill', 'new') : null,
            right: changeCount(file),
            isSelected: panes.some(pane => pane.isVisible && pane.key() === fileKey(file)),
            activity: fileActivity(file),
            onPress: () => {
              openFile(file)
              office.setSelected(file.sessionId)
            },
          }),
        ),
        ...(mine.length ? [section('Activity'), ...listed.map(activityRow), ...(mine.length > ACTIVITY_SHOWN ? [earlierRow(chat.id, mine.length)] : [])] : []),
      ],
    })
  }

  return node({
    key: 'c:all',
    iconName: 'layers',
    label: 'All chats',
    right: plainCount(list.reduce((sum, chat) => sum + chat.count, 0)),
    isSelected: selected === '',
    activity: rootState,
    onPress: () => pickChat(''),
    kids: [...(feed.length ? [section('Latest'), ...feed.slice(0, ACTIVITY_ALL).map(activityRow)] : []), ...kidsOf.map(chatNode)],
  })
}

const renderLists = () => {
  isListsDue = false
  loadRepos()
  map.setRepo(mapCwd())
  $('map-empty').hidden = Boolean(mapCwd()) && mapFiles !== 0
  $('map-empty').textContent = mapCwd()
    ? 'This repo has no files to show yet.'
    : repos.length
      ? 'Pick a repo under Repos on the left, or start a Claude chat, to see it here.'
      : 'Start a Claude chat, or set your repos folder in Settings, to see a repo here.'
  $('chat-list').replaceChildren(chatTree())
  $('repo-list').replaceChildren(...(repos.length ? repoList() : [item('li', 'empty', 'Set your repos folder in Settings (Map) to list them here.')]))

  // a notice when a chat is waiting on a permission
  const asking = [...chats.keys()].filter(id => office.chatInfo(id).asking)
  $('banner').hidden = asking.length === 0
  if (asking.length > 0) $('banner').textContent = `${nameOfChat(asking[0])} is waiting for you${asking.length > 1 ? ` (+${asking.length - 1} more)` : ''}`

  // each pane says which chat its file is from when every chat is in view
  for (const pane of panes) {
    const chat = pane.current?.event.sessionId
    if (chat) pane.setChat(chat === selected ? '' : nameOfChat(chat))
  }
}

function scheduleLists() {
  if (isListsDue) return
  isListsDue = true
  requestAnimationFrame(renderLists)
}

// a dot that should stop pulsing is noticed within half a second
let lastActivity = ''
let lastListAt = 0
setInterval(() => {
  const act = activity()
  const signature = `${[...act.busyChats]}|${[...act.working]}|${[...act.waiting]}`
  if (signature === lastActivity && Date.now() - lastListAt < 15000) return // the minutes under each chat move on too
  lastListAt = Date.now()
  lastActivity = signature
  scheduleLists()
}, 500)

const noteChat = event => {
  const isNew = !chats.has(event.sessionId)
  const chat = chats.get(event.sessionId) ?? { id: event.sessionId, count: 0, firstAt: event.at }
  chats.set(event.sessionId, {
    ...chat,
    cwd: event.cwd,
    lastAt: event.at,
    count: chat.count + (event.type === 'tool' ? 1 : 0),
  })
  return isNew
}

// a chat that starts while the page is open becomes the selected one in the
// lists; the panes are left alone, so an edit being typed is not cut off. The
// history being replayed does not move the selection.
const noteAndFollow = event => {
  if (noteChat(event) && !isReplaying) {
    selected = event.sessionId
    scheduleLists()
  }
}

/* the controls */

const save = (key, value) => {
  prefs[key] = value
  store.set(key, value)
  apply()
  refreshState() // Skip is on in the Office, whatever the panes are doing
}

// Stay awake: a screen wake lock keeps the display on (no screensaver) while the
// window is visible; the browser drops it when hidden, so it is asked for again.
let wakeLock = null
const syncAwake = () => {
  if (prefs.awake) {
    if (!wakeLock && document.visibilityState === 'visible')
      wakeLock = navigator.wakeLock
        ?.request('screen')
        .then(lock => {
          lock.onrelease = () => (wakeLock = null)
          return lock
        })
        .catch(() => (wakeLock = null))
  } else {
    wakeLock?.then(lock => lock?.release())
    wakeLock = null
  }
}
document.addEventListener('visibilitychange', syncAwake)

// the speed of the view shown: Code and the Office each keep their own
const speedKey = () => (prefs.office ? 'officeSpeed' : 'codeSpeed')
const press = (el, on) => el.setAttribute(el.getAttribute('role') === 'switch' ? 'aria-checked' : 'aria-pressed', String(on))

const apply = () => {
  document.documentElement.dataset.theme = prefs.theme
  document.documentElement.style.setProperty('--code-size', `${prefs.size}px`)
  document.body.classList.toggle('wrap', prefs.wrap)
  document.body.classList.toggle('nav-open', prefs.nav)
  document.body.classList.toggle('dock-open', prefs.dock)
  $('b-dock').setAttribute('aria-expanded', String(prefs.dock))
  document.body.classList.toggle('office', prefs.office)
  const isMap = prefs.office && prefs.map
  document.body.classList.toggle('map', isMap)
  document.body.classList.toggle('angled', prefs.office && !isMap && prefs.angled) // the buttons that turn the view
  document.body.classList.toggle('city', prefs.mapMode === 'city')
  office.setVisible(prefs.office && !isMap)
  map.setMode(prefs.mapMode)
  map.setDrone(prefs.drone)
  map.setMapping(prefs.mapShow)
  map.setVisible(isMap)
  office.setSound(prefs.sound)
  office.setAngled(prefs.angled)
  office.setRotation(prefs.rotation)

  // every button and switch shows its choice
  for (const el of document.querySelectorAll('[data-pref]')) press(el, prefs[el.dataset.pref])
  for (const [id, on] of [['v-code', !prefs.office], ['v-office', prefs.office && !isMap], ['v-map', isMap], ['o-flat', !prefs.angled], ['b-angled', prefs.angled], ['b-nav', prefs.nav]]) press($(id), on)
  for (const mode of MAP_MODES) press($(`m-${mode}`), prefs.mapMode === mode)
  for (const button of document.querySelectorAll('[data-show] button')) press(button, prefs.mapShow[button.parentElement.dataset.show] === button.dataset.value)
  for (const button of $('speed').querySelectorAll('button')) press(button, prefs[speedKey()] === Number(button.dataset.speed))
  for (const swatch of document.querySelectorAll('.swatch')) press(swatch, swatch.dataset.theme === prefs.theme)
  $('size-out').textContent = `${prefs.size} px`
  showPause()
  for (const pane of panes) pane.updateBox()
  syncAwake()
}

// Pause and Skip act on the view shown: Code (the panes) or the Office
const viewKey = () => (prefs.office ? 'office' : 'code')
const showPause = () => {
  const on = paused[viewKey()]
  document.body.classList.toggle('paused', on)
  $('b-pause').setAttribute('aria-label', on ? 'Resume' : 'Pause')
  $('b-pause').title = on ? 'Resume' : 'Pause'
  $('b-pause').setAttribute('aria-pressed', String(on))
}
const setPaused = (view, on) => {
  paused[view] = on
  if (view === 'office') office.setPaused(on)
  else for (const pane of panes) pane.refresh()
  showPause()
  refreshState()
}

$('b-pause').onclick = () => setPaused(viewKey(), !paused[viewKey()])
$('b-skip').onclick = () => (prefs.office ? office.skip() : skipAll())
// a choice that is on or off, from its button in the floating controls or its switch in Settings
for (const el of document.querySelectorAll('[data-pref]')) {
  el.onclick = () => {
    const key = el.dataset.pref
    save(key, !prefs[key])
    if (key === 'whole' || key === 'side') rerenderAll()
  }
}
for (const button of $('speed').querySelectorAll('button')) button.onclick = () => save(speedKey(), Number(button.dataset.speed))

// leaving the Office is the one in-app way out of the picture, so it asks first
const setView = view => {
  const leaving = prefs.office && !prefs.map && view !== 'office'
  if (leaving && recorder.isRecording && !window.confirm('Leave the Office and stop recording? The video so far is saved.')) return
  recorder.stop()
  prefs.office = view !== 'code'
  prefs.map = view === 'map'
  store.set('office', prefs.office)
  store.set('map', prefs.map)
  apply()
  refreshState() // Skip is on in the Office and the Map, whatever the panes are doing
}
$('v-code').onclick = () => setView('code')
$('v-office').onclick = () => setView('office')
$('v-map').onclick = () => setView('map')
$('o-flat').onclick = () => save('angled', false)
$('b-angled').onclick = () => save('angled', true)
for (const mode of MAP_MODES) $(`m-${mode}`).onclick = () => save('mapMode', mode)
for (const button of document.querySelectorAll('[data-show] button')) button.onclick = () => save('mapShow', { ...prefs.mapShow, [button.parentElement.dataset.show]: button.dataset.value })

// the panels that open and close: the chats, the City's layers, the new-window menu
$('b-nav').onclick = () => save('nav', !prefs.nav)
// The controls fold into a pill at the left and grow out of it. Opening widens the bar with a springy overshoot while its
// buttons slide in one after another; folding sends them away first, then draws the bar in.
// the Time-lapse bar above the controls takes their width and height (see #replay), including while they open and fold
new ResizeObserver(() => {
  const { width, height } = $('dock').getBoundingClientRect()
  $('dock').parentElement.style.setProperty('--dock-w', `${width}px`)
  $('dock').parentElement.style.setProperty('--dock-h', `${height}px`)
}).observe($('dock'))
const DOCK_SPRING = 'cubic-bezier(0.34, 1.3, 0.64, 1)'
let dockAt = -Infinity // when the last fold or opening began; a click during it is ignored
$('b-dock').onclick = async () => {
  if (performance.now() - dockAt < 700) return
  const dock = $('dock')
  const parts = () => [...dock.querySelectorAll('button:not(#b-dock), .seg, .sep')].filter(el => el.offsetParent)
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return save('dock', !prefs.dock)
  dockAt = performance.now()
  dock.style.overflow = 'hidden'
  try {
    const gone = prefs.dock ? parts().reverse().map((el, i) => el.animate({ opacity: [1, 0], transform: ['none', 'translateX(-14px)'] }, { duration: 160, delay: i * 15, easing: 'ease-in', fill: 'forwards' })) : []
    await Promise.all(gone.map(a => a.finished))
    const from = dock.getBoundingClientRect()
    save('dock', !prefs.dock)
    gone.forEach(a => a.cancel()) // they are hidden now; the next opening must find them as they were
    const to = dock.getBoundingClientRect()
    const size = dock.animate({ width: [`${from.width}px`, `${to.width}px`], height: [`${from.height}px`, `${to.height}px`] }, { duration: 460, easing: DOCK_SPRING })
    if (prefs.dock) parts().forEach((el, i) => el.animate({ opacity: [0, 1], transform: ['translateX(-14px)', 'none'] }, { duration: 320, delay: 80 + i * 30, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'backwards' }))
    await size.finished
  } finally {
    dock.style.overflow = ''
  }
}
const setOpen = (button, box, on) => {
  box.hidden = !on
  button.setAttribute(button.hasAttribute('aria-expanded') ? 'aria-expanded' : 'aria-pressed', String(on))
}
$('b-layers').onclick = () => setOpen($('b-layers'), $('map-show'), $('map-show').hidden)
$('m-replay').addEventListener('click', () => setOpen($('b-layers'), $('map-show'), false)) // the time-lapse bar takes the layers' place
$('b-pop').onclick = () => setOpen($('b-pop'), $('pop-menu'), $('pop-menu').hidden)
// a menu item opens a window like this one, made by the server (no tabs, no address bar); the link's own
// target="_blank" is the way out if the server cannot (no Chrome or Edge found)
$('pop-menu').addEventListener('click', async event => {
  const link = event.target.closest('a')
  if (!link) return
  setOpen($('b-pop'), $('pop-menu'), false)
  event.preventDefault()
  const opened = await fetch(`/open${new URL(link.href).search}`, { method: 'POST' }).then(res => res.ok, () => false)
  if (!opened) window.open(link.href, '_blank', 'noopener')
})
document.addEventListener('click', event => {
  if (!$('pop-menu').hidden && !event.target.closest('.pop')) setOpen($('b-pop'), $('pop-menu'), false)
  if (!$('map-show').hidden && !event.target.closest('#map-show, #b-layers')) setOpen($('b-layers'), $('map-show'), false)
})

// Full screen, in steps: 1 the panels close and the view fills the app window; 2 the whole screen too (where the
// browser can); then back to the window as it was. Escape goes straight back from either step.
let fullStep = 0
let canTrue = typeof document.documentElement.requestFullscreen === 'function'
const setFull = step => {
  fullStep = step
  document.body.classList.toggle('full', step > 0)
  const next = step === 0 ? 'Full screen' : step === 1 && canTrue ? 'Full screen: the whole screen' : 'Windowed'
  const button = $('b-full')
  press(button, step > 0)
  button.setAttribute('aria-label', next)
  button.title = next
  button.dataset.icon = step === 0 || (step === 1 && canTrue) ? 'enter' : 'exit'
  button.querySelector('.full-label').textContent = step === 0 ? '' : step === 1 && canTrue ? 'Whole screen' : 'Windowed'
  if (step === 2 && !document.fullscreenElement)
    document.documentElement.requestFullscreen().catch(() => {
      canTrue = false // refused: this browser stays in the window
      setFull(1)
    })
  if (step < 2 && document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
  for (const pane of panes) pane.updateBox()
}
$('b-full').onclick = () => setFull(fullStep === 0 ? 1 : fullStep === 1 && canTrue ? 2 : 0)
// leaving the browser's full screen (its own Escape) goes back to the window as it was
document.addEventListener('fullscreenchange', () => !document.fullscreenElement && fullStep === 2 && setFull(0))

// the Map's repos folder: read again when the person stops typing (on change)
$('repos-dir').value = prefs.reposDir
$('repos-dir').onchange = () => {
  save('reposDir', $('repos-dir').value.trim())
  scheduleLists()
}

// Settings: the gear opens it; the cross, a click outside it, or Escape closes it; a tab for each part of the app.
// It pops in (slides up in a narrow window) and back out; changing tab slides the page and glides the highlight.
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)')
let settingsTimer = 0
const placeTabMark = glide => {
  const mark = document.querySelector('.cbs-ind')
  const on = document.querySelector('.stab[aria-selected="true"]')
  if (!mark || !on || $('settings').hidden) return
  if (!glide) mark.style.transition = 'none'
  mark.style.transform = `translate(${on.offsetLeft}px, ${on.offsetTop}px)`
  mark.style.width = `${on.offsetWidth}px`
  mark.style.height = `${on.offsetHeight}px`
  if (!glide) {
    void mark.offsetWidth
    mark.style.transition = ''
  }
}
const setSettings = on => {
  const box = $('settings')
  clearTimeout(settingsTimer)
  $('b-gear').setAttribute('aria-expanded', String(on))
  if (on) {
    box.classList.remove('closing')
    box.hidden = false
    placeTabMark(false)
    box.querySelector('.cbs').focus({ preventScroll: true }) // the window itself: no focus ring until the keyboard is used
    return
  }
  if (box.hidden) return
  box.classList.add('closing')
  settingsTimer = setTimeout(() => {
    box.hidden = true
    box.classList.remove('closing')
  }, reduceMotion.matches ? 0 : 210)
}
const tabOrder = [...document.querySelectorAll('.stab')].map(el => el.dataset.tab)
const showTab = tab => {
  const before = document.querySelector('.stab[aria-selected="true"]')?.dataset.tab
  for (const el of document.querySelectorAll('.stab')) {
    el.setAttribute('aria-selected', String(el.dataset.tab === tab))
    el.tabIndex = el.dataset.tab === tab ? 0 : -1
  }
  for (const el of document.querySelectorAll('.spanel')) {
    el.hidden = el.dataset.panel !== tab
    if (el.hidden || before === tab || reduceMotion.matches) continue
    el.style.setProperty('--dir', tabOrder.indexOf(tab) >= tabOrder.indexOf(before) ? 1 : -1)
    el.classList.remove('anim')
    void el.offsetWidth
    el.classList.add('anim')
  }
  document.querySelector('.cbs-pane').scrollTop = 0
  placeTabMark(true)
}
for (const el of document.querySelectorAll('.stab')) el.onclick = () => showTab(el.dataset.tab)
// up and down move between the tabs, like any list of tabs
document.querySelector('.cbs-rail').addEventListener('keydown', event => {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
  event.preventDefault()
  const at = tabOrder.indexOf(document.querySelector('.stab[aria-selected="true"]').dataset.tab)
  const next = tabOrder[(at + (event.key === 'ArrowDown' ? 1 : -1) + tabOrder.length) % tabOrder.length]
  showTab(next)
  document.querySelector(`.stab[data-tab="${next}"]`).focus()
})
addEventListener('resize', () => placeTabMark(false))
$('b-gear').onclick = () => setSettings(true)
$('settings-close').onclick = () => setSettings(false)
$('settings').addEventListener('click', event => event.target === $('settings') && setSettings(false))
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return
  if (!$('settings').hidden) setSettings(false)
  else if (!$('pop-menu').hidden) setOpen($('b-pop'), $('pop-menu'), false)
  else if (!$('map-show').hidden) setOpen($('b-layers'), $('map-show'), false)
  else if (fullStep > 0) setFull(0)
})

// turn the angled view a quarter turn: the buttons, or [ and ] (not while typing in a field)
const turnView = by => save('rotation', (prefs.rotation + by + 4) % 4)
$('z-turn-left').onclick = () => turnView(-1)
$('z-turn-right').onclick = () => turnView(1)
document.addEventListener('keydown', event => {
  if (event.ctrlKey || event.metaKey || event.altKey || !document.body.classList.contains('angled') || event.target.closest('input, select, textarea, [contenteditable]')) return
  if (event.key === '[') turnView(-1)
  else if (event.key === ']') turnView(1)
})
$('z-fit').onclick = () => (prefs.map ? map.resetView() : office.resetView())
$('z-in').onclick = () => office.zoomBy(1.4)
$('z-out').onclick = () => office.zoomBy(1 / 1.4)
setInterval(() => prefs.office && scheduleLists(), 2000)
$('b-record').disabled = !recorder.isSupported()
if (!recorder.isSupported()) $('b-record').title = "This browser can't record mp4 (Chrome or Edge 126 or later can)"
$('b-record').onclick = () => (recorder.isRecording ? recorder.stop() : recorder.start())
// nothing is drawn while the window is hidden: the recording waits, and carries on when it is back
document.addEventListener('visibilitychange', () => (document.hidden ? recorder.pause() : recorder.resume()))
// closing or reloading the window while recording: the browser asks first
window.addEventListener('beforeunload', event => {
  if (!recorder.isRecording) return
  event.preventDefault()
  event.returnValue = ''
})
const textSize = by => save('size', Math.min(20, Math.max(11, prefs.size + by)))
for (const id of ['b-smaller', 's-smaller']) $(id).onclick = () => textSize(-1)
for (const id of ['b-larger', 's-larger']) $(id).onclick = () => textSize(1)
for (const swatch of document.querySelectorAll('.swatch')) swatch.onclick = () => save('theme', swatch.dataset.theme)

// the window's own size, from the app window itself
const SIZES = { small: [1000, 700], medium: [1200, 800], large: [1600, 1000] }
const resizeWindow = key => {
  const { availLeft = 0, availTop = 0, availWidth, availHeight } = screen
  const [width, height] = key === 'half' ? [Math.floor(availWidth / 2), availHeight] : SIZES[key]
  const left = key === 'half' ? availLeft + width : availLeft + Math.floor((availWidth - width) / 2)
  const top = key === 'half' ? availTop : availTop + Math.floor((availHeight - height) / 2)
  window.resizeTo(width, height)
  window.moveTo(left, top)
  // a window that refuses (a tab, say) keeps its size: say so
  setTimeout(() => {
    if (Math.abs(window.outerWidth - width) > 24) $('conn').textContent = "this window can't be resized from the page"
  }, 300)
}
$('win-size').onchange = event => {
  if (event.target.value) resizeWindow(event.target.value)
  event.target.value = '' // back to the label, so the same size can be picked again
}
apply()

/* the live stream */

const source = new EventSource('/stream')
source.onopen = () => {
  // the server replays its backlog on every connect: start from nothing
  for (const map of [files, chats, latest, results, statusOf]) map.clear()
  feed.length = 0
  selected = ''
  isReplaying = true
  resetView(null)
  scheduleLists()
  $('conn').textContent = ''
}
source.onerror = () => {
  if (!isStopped) $('conn').textContent = 'reconnecting...'
}
source.onmessage = message => {
  const event = JSON.parse(message.data)
  // the office plays what happens now, not the history a new window is sent first
  if (!isReplaying && event.type !== 'close' && event.type !== 'ready') office.feed(event)
  map.feed(event) // the history too: what was touched before this window opened stays lit
  if (event.type === 'close') {
    // the server is stopping: close this window, or say so where a tab may not close
    isStopped = true
    source.close()
    resetView(null)
    panes[0].setTitle('Live view stopped. You can close this window.')
    $('st').textContent = 'stopped'
    $('conn').textContent = 'stopped'
    window.close()
    return
  }
  if (event.type === 'ready') {
    // the history is over: open on the chat that was active most recently
    isReplaying = false
    const recent = [...chats.values()].sort((a, b) => b.lastAt - a.lastAt)[0]
    if (recent) select(recent.id)
    return
  }
  if (event.type === 'status') {
    // the app's word on whether a chat is busy or idle
    statusOf.set(event.sessionId, event.status)
    scheduleLists()
    return
  }
  if (event.type === 'title') {
    // a chat's name: from the app, or from its first message; a new chat is followed
    noteAndFollow(event)
    const chat = chats.get(event.sessionId)
    if (chat && (event.source === 'app' || !chat.title)) chat.title = event.title // the app's name wins
    scheduleLists()
    return
  }
  if (event.type === 'tool') {
    noteAndFollow(event)
    feed.unshift({ ...event, status: results.get(event.id) === false ? 'failed' : 'running' })
    if (feed.length > FEED_MAX) feed.pop()
  } else if (event.type === 'edit') {
    noteAndFollow(event)
    const key = keyOf(event)
    const before = files.get(key)
    files.set(key, {
      sessionId: event.sessionId,
      path: event.path,
      adds: (before?.adds ?? 0) + event.adds,
      dels: (before?.dels ?? 0) + event.dels,
      isNew: before ? before.isNew : event.isNew,
      last: event,
    })
    latest.set(event.sessionId, event)
    if (!isReplaying) ingest(event) // every chat's edits are shown, whichever chat is selected
  } else if (event.type === 'done') {
    results.set(event.id, event.ok)
    const entry = feed.find(one => one.id === event.id)
    if (entry) entry.status = event.ok ? 'done' : 'failed'
    for (const pane of panes) if (pane.current?.id === event.id) pane.refresh()
  }
  scheduleLists()
}
