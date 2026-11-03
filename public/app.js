import { createPane } from './pane.js'
import { nextInLine, placeEdit } from './place.js'
import { clamp, makeResizer } from './resize.js'
import { fileLabels } from './tree.js'
import { wholeRows } from './whole.js'

const $ = id => document.getElementById(id)

const SPEEDS = [
  { name: 'slow', mult: 2 },
  { name: 'normal', mult: 1 },
  { name: 'fast', mult: 0.4 },
  { name: 'instant', mult: 0 },
]
const THEMES = ['dark', 'light', 'midnight', 'terminal', 'contrast']
const STATES = { writing: 'writing', edited: 'edited', failed: 'NOT APPLIED', paused: 'paused', idle: 'idle' }
const STATUS_MARK = { running: '...', done: 'ok', failed: 'failed' }
const FEED_MAX = 100
const ACTIVE_MS = 4000 // a chat that did something this recently counts as working

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
    try {
      localStorage.setItem(`lv.${key}`, JSON.stringify(value))
    } catch {
      // a private window: the choice just is not kept
    }
  },
}
const pick = (value, isOk, fallback) => (isOk(value) ? value : fallback)
const prefs = {
  theme: pick(store.get('theme', 'midnight'), v => THEMES.includes(v), 'midnight'),
  speed: pick(store.get('speed', 2), v => Number.isInteger(v) && v >= 1 && v <= 4, 2),
  size: pick(store.get('size', 13), v => Number.isInteger(v) && v >= 11 && v <= 20, 13),
  wrap: store.get('wrap', false) === true,
  whole: store.get('whole', true) !== false,
  side: store.get('side', false) === true,
  follow: store.get('follow', true) !== false,
  focus: store.get('focus', false) === true,
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
let isPaused = false
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

/* the panes: up to two files watched at once */

const panes = [0, 1].map(index =>
  createPane({
    index,
    getPrefs: () => prefs,
    isPaused: () => isPaused,
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

/* how wide each part is: the person drags the edges, and it is remembered */

const DEFAULT_NAV = 399 // the chat list's width until the person drags it
const sizes = {
  nav: pick(store.get('navW', DEFAULT_NAV), v => Number.isFinite(v) && v >= 180 && v <= 480, DEFAULT_NAV),
  aside: pick(store.get('asideW', 300), v => Number.isFinite(v) && v >= 200 && v <= 520, 300),
  split: pick(store.get('split', 0.5), v => Number.isFinite(v) && v >= 0.2 && v <= 0.8, 0.5),
}
const panesEl = $('panes')
const splitEl = $('rz-split')
const widthRoom = () => window.innerWidth - 320 // what the two side panels may take together

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
  document.documentElement.style.setProperty('--aside-w', `${sizes.aside}px`)
  applySplit()
  for (const pane of panes) pane.updateBox()
}

const layoutPanes = () => {
  panesEl.classList.toggle('two', panes[1].isVisible)
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
  max: () => Math.min(480, widthRoom() - sizes.aside),
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
  el: $('rz-aside'),
  label: 'Resize the activity panel',
  size: () => sizes.aside,
  grows: -1, // its edge is on its left: moving left makes it wider
  fromPointer: event => $('feed').getBoundingClientRect().right - event.clientX,
  min: () => 200,
  max: () => Math.min(520, widthRoom() - sizes.nav),
  step: 16,
  set: value => {
    sizes.aside = value
    applySizes()
  },
  commit: () => store.set('asideW', sizes.aside),
  reset: () => {
    sizes.aside = 300
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

// a window made smaller takes room back from the side panels (not remembered: it may grow again)
window.addEventListener('resize', () => {
  if (sizes.nav + sizes.aside <= widthRoom()) return
  sizes.aside = clamp(widthRoom() - sizes.nav, 200, sizes.aside)
  sizes.nav = clamp(widthRoom() - sizes.aside, 180, sizes.nav)
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
  $('b-skip').disabled = busy.length === 0 && queue.length === 0
  const waiting = queue.length > 0 ? ` · ${queue.length} waiting` : ''
  if (isPaused) setState('paused', waiting)
  else if (failed) setState('failed')
  else if (busy.length > 0) setState('writing', waiting)
  else if (panes.some(pane => pane.current)) setState('edited')
  else setState('idle')
  scheduleLists() // the sidebar's animation follows what the panes are doing
}

// The rows to draw: the whole file when it is wanted and still kept, else the
// changed part, with a line saying why when the whole file was wanted.
const rowsFor = event => {
  if (!prefs.whole) return event.rows
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

// How the reveal goes: at the person's speed, or faster while edits wait in
// line so the view keeps up with the real work.
const pace = () => {
  const mult = SPEEDS[prefs.speed - 1].mult
  if (queue.length >= 3) return { mult: 0, settleMs: 300 }
  if (queue.length > 0) return { mult: Math.min(mult, 0.4), settleMs: 600 }
  return { mult }
}

// A live edit goes to a pane: the one already showing that file, a finished
// one, or a second one that opens; if both are being written it waits in line.
const place = event => {
  const { pane: at, interrupt } = placeEdit(snapshot(), keyOf(event))
  if (at === -1) {
    queue.push(event)
    refreshState()
    return
  }
  const pane = panes[at]
  if (interrupt) pane.finish(true) // the same file again: what it was writing is finished first
  pane.open()
  layoutPanes()
  pane.render(event, rowsFor(event), { animate: true, ...pace() })
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
// ends up, the latest two staying on screen.
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
const node = ({ key, iconName, label, title, badge, right, kids = [], isSelected, activity, opensOnPress, onPress, onRename }) => {
  const isOpen = !collapsed.has(key)
  const row = item('div', `nrow${isSelected ? ' sel' : ''}${activity ? ` busy ${activity}` : ''}`)
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

  const main = item('button', 'nlabel', icon(iconName, `ico-${iconName}`), span('ntext', label))
  if (badge) main.append(badge)
  if (right) main.append(right)
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

const plainCount = n => span('counts', String(n))
const changeCount = file => item('span', 'counts', span('pos', `+${file.adds}`), ' ', span('neg', `−${file.dels}`))

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

  return node({
    key: 'c:all',
    iconName: 'layers',
    label: 'All chats',
    right: plainCount(list.reduce((sum, chat) => sum + chat.count, 0)),
    isSelected: selected === '',
    activity: rootState,
    onPress: () => select(''),
    kids: kidsOf.map(({ chat, own, state }) => {
      const labels = fileLabels(own.map(file => file.path), chat.cwd)
      return node({
        key: `c:${chat.id}`,
        iconName: 'chat',
        label: labelOf(chat),
        title: `${baseName(chat.cwd)} · ${chat.id.slice(0, 6)}\n${chat.cwd}\nDouble-click to rename`,
        right: plainCount(chat.count),
        isSelected: selected === chat.id,
        activity: state,
        onPress: () => select(chat.id),
        onRename: () => renameChat(chat),
        kids: own.map(file =>
          node({
            key: `f:${file.sessionId}|${file.path}`,
            iconName: 'file',
            label: labels.get(file.path),
            title: file.path,
            badge: file.isNew ? span('pill', 'new') : null,
            right: changeCount(file),
            isSelected: panes.some(pane => pane.isVisible && pane.key() === fileKey(file)),
            activity: fileActivity(file),
            onPress: () => openFile(file),
          }),
        ),
      })
    }),
  })
}

const clock = ms => {
  const s = Math.max(0, Math.floor(ms / 1000))
  const [h, m, r] = [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
  const two = n => String(n).padStart(2, '0')
  return h ? `${h}:${two(m)}:${two(r)}` : `${m}:${two(r)}`
}

const renderElapsed = () => {
  const starts = [...chats.values()].filter(chat => isShown(chat.id)).map(chat => chat.firstAt)
  $('s-time').textContent = starts.length ? clock(Date.now() - Math.min(...starts)) : '0:00'
}

const renderStats = () => {
  const scoped = [...files.values()].filter(file => isShown(file.sessionId))
  const sum = key => scoped.reduce((total, file) => total + file[key], 0)
  $('s-files').textContent = `${scoped.length} ${scoped.length === 1 ? 'file' : 'files'}`
  $('s-add').textContent = `+${sum('adds')}`
  $('s-del').textContent = `−${sum('dels')}`
  $('s-chat').textContent = selected ? nameOfChat(selected) : 'All chats'
  renderElapsed()
}
setInterval(renderElapsed, 1000)

const renderLists = () => {
  isListsDue = false
  $('chat-list').replaceChildren(chatTree())

  $('feed-list').replaceChildren(
    ...feed
      .filter(entry => isShown(entry.sessionId))
      .map(entry => {
        const text = span('', entry.summary)
        text.title = `${nameOfChat(entry.sessionId)}: ${entry.summary}`
        return item('li', entry.status, span('tool', STATUS_MARK[entry.status]), text)
      }),
  )

  // each pane says which chat its file is from when every chat is in view
  for (const pane of panes) if (pane.current) pane.setChat(selected ? '' : nameOfChat(pane.current.event.sessionId))
  renderStats()
}

function scheduleLists() {
  if (isListsDue) return
  isListsDue = true
  requestAnimationFrame(renderLists)
}

// a dot that should stop pulsing is noticed within half a second
let lastActivity = ''
setInterval(() => {
  const act = activity()
  const signature = `${[...act.busyChats]}|${[...act.working]}|${[...act.waiting]}`
  if (signature === lastActivity) return
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

// a chat that starts while the page is open becomes the selected one, so what
// it does shows at once; the history being replayed does not move the selection
const noteAndFollow = event => {
  if (noteChat(event) && !isReplaying) select(event.sessionId)
}

/* the controls */

const save = (key, value) => {
  prefs[key] = value
  store.set(key, value)
  apply()
}

const apply = () => {
  document.documentElement.dataset.theme = prefs.theme
  document.documentElement.style.setProperty('--code-size', `${prefs.size}px`)
  document.body.classList.toggle('wrap', prefs.wrap)
  document.body.classList.toggle('focus', prefs.focus)
  for (const [id, key] of [['b-follow', 'follow'], ['b-wrap', 'wrap'], ['b-whole', 'whole'], ['b-side', 'side'], ['b-focus', 'focus']])
    $(id).setAttribute('aria-pressed', String(prefs[key]))
  for (const swatch of document.querySelectorAll('.swatch'))
    swatch.setAttribute('aria-pressed', String(swatch.dataset.theme === prefs.theme))
  $('speed').value = String(prefs.speed)
  $('speed-out').textContent = SPEEDS[prefs.speed - 1].name
  for (const pane of panes) pane.updateBox()
}

const setPaused = on => {
  isPaused = on
  document.body.classList.toggle('paused', on)
  $('b-pause').textContent = on ? 'Resume' : 'Pause'
  $('b-pause').setAttribute('aria-pressed', String(on))
  for (const pane of panes) pane.refresh()
  refreshState()
}

$('b-pause').onclick = () => setPaused(!isPaused)
$('b-skip').onclick = skipAll
$('b-follow').onclick = () => save('follow', !prefs.follow)
$('b-wrap').onclick = () => save('wrap', !prefs.wrap)
$('b-whole').onclick = () => {
  save('whole', !prefs.whole)
  rerenderAll()
}
$('b-focus').onclick = () => save('focus', !prefs.focus)
$('b-side').onclick = () => {
  save('side', !prefs.side)
  rerenderAll()
}
$('b-smaller').onclick = () => save('size', Math.max(11, prefs.size - 1))
$('b-larger').onclick = () => save('size', Math.min(20, prefs.size + 1))
$('speed').oninput = event => save('speed', Number(event.target.value))
for (const swatch of document.querySelectorAll('.swatch'))
  swatch.onclick = () => save('theme', swatch.dataset.theme)

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
  $('conn').textContent = 'connected'
}
source.onerror = () => {
  if (!isStopped) $('conn').textContent = 'reconnecting...'
}
source.onmessage = message => {
  const event = JSON.parse(message.data)
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
    if (!isReplaying && isShown(event.sessionId)) ingest(event)
  } else if (event.type === 'done') {
    results.set(event.id, event.ok)
    const entry = feed.find(one => one.id === event.id)
    if (entry) entry.status = event.ok ? 'done' : 'failed'
    for (const pane of panes) if (pane.current?.id === event.id) pane.refresh()
  }
  scheduleLists()
}
