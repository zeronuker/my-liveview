import { highlight, langOf } from './highlight.js'
import { fileTree, groupChats } from './tree.js'

const $ = id => document.getElementById(id)
const rowsEl = $('rows')
const nameEl = $('name')
const miniEl = $('mini')
const miniBox = $('mini-box')

const MARKS = { add: '+', del: '-', ctx: ' ' }
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
const CARET = 'caret'

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
  side: store.get('side', false) === true,
  follow: store.get('follow', true) !== false,
  focus: store.get('focus', false) === true,
}

const collapsed = new Set(store.get('collapsed', [])) // folders the person closed
const results = new Map() // tool id -> did it land
const feed = [] // newest first
const files = new Map() // sessionId|path -> { sessionId, path, adds, dels, isNew, last }; newest last
const chats = new Map() // sessionId -> { id, label, firstAt, lastAt, count }
const latest = new Map() // sessionId -> that chat's last edit
let selected = '' // '' for every chat, 'dir:<folder>' for a project, else a sessionId
let current = null // { id, path, event, phase, newest, timer, settle }
let pending = null // an edit waiting for the next frame
let queued = null // an edit that came in while paused
let isListsDue = false
let isPaused = false
let isStopped = false

const baseName = p => p.split(/[\\/]/).filter(Boolean).pop() ?? p

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

const setState = (state, note = '') => {
  $('dot').dataset.state = state
  $('st').textContent = STATES[state]
  $('status').textContent = state === 'idle' ? '' : `${STATES[state]}${note}`
  $('status').classList.toggle('failed', state === 'failed')
}

// what the status says: paused wins, then a failed edit, then where the edit is
const refreshState = () => {
  if (isPaused) setState('paused', queued ? ' · a new edit is waiting' : '')
  else if (!current) setState('idle')
  else if (results.get(current.id) === false) setState('failed')
  else setState(current.phase)
}

/* the file view */

const buildRow = (row, { isNew, lang }) => {
  const el = document.createElement('div')
  el.className = `row ${row.kind}${row.kind === 'add' && isNew ? ' new' : ''}`
  el.dataset.kind = row.kind
  if (row.kind === 'gap') {
    el.textContent = row.text
    return el
  }
  const text = span('t', '')
  if (row.kind === 'ctx')
    for (const part of highlight(row.text, lang))
      text.append(part.cls ? span(`t-${part.cls}`, part.text) : part.text)
  else text.textContent = row.text ?? ''
  el.append(span('n', row.n ?? ''), span('m', MARKS[row.kind] ?? ''), text)
  return el
}

// one column of rows, or two with a changed block's old and new lines side by
// side (the shorter side padded so the unchanged lines below stay level)
const buildSide = (event, opts) => {
  const left = []
  const right = []
  let block = { d: [], a: [] }
  let shift = 0 // how far the old line numbers have drifted from the new
  const pad = () => buildRow({ kind: 'pad' }, opts)
  const flush = () => {
    const count = Math.max(block.d.length, block.a.length)
    for (let i = 0; i < count; i++) {
      left.push(block.d[i] ? buildRow(block.d[i], opts) : pad())
      right.push(block.a[i] ? buildRow(block.a[i], opts) : pad())
    }
    shift += block.d.length - block.a.length
    block = { d: [], a: [] }
  }
  for (const row of event.rows) {
    if (row.kind === 'del') block.d.push(row)
    else if (row.kind === 'add') block.a.push(row)
    else {
      flush()
      left.push(buildRow(row.kind === 'ctx' ? { ...row, n: row.n + shift } : row, opts))
      right.push(buildRow(row, opts))
    }
  }
  flush()
  const columns = [item('div', 'col', ...left), item('div', 'col', ...right)]
  rowsEl.replaceChildren(item('div', 'split', ...columns))
  return { all: [...left, ...right], adds: right.filter(el => el.dataset.kind === 'add') }
}

const build = event => {
  const opts = { isNew: event.isNew, lang: langOf(event.path) }
  if (prefs.side) return buildSide(event, opts)
  const all = event.rows.map(row => buildRow(row, opts))
  rowsEl.replaceChildren(...all)
  return { all, adds: all.filter(el => el.dataset.kind === 'add') }
}

// a line not yet written is out of the way (unified) or only invisible (side
// by side, where the two columns must stay level)
const reveal = (el, isShown) => {
  if (prefs.side) el.classList.toggle('unrevealed', !isShown)
  else el.hidden = !isShown
}

const markNewest = el => {
  current.newest?.classList.remove('nw')
  current.newest?.querySelector(`.${CARET}`)?.remove()
  current.newest = el
  if (!el) return
  el.classList.add('nw')
  el.querySelector('.t').append(span(CARET, '▍'))
}

const stopAnimation = () => {
  if (!current) return
  clearInterval(current.timer)
  clearTimeout(current.settle)
}

const show = (event, animate) => {
  stopAnimation()
  nameEl.textContent = baseName(event.path)
  nameEl.title = event.path

  const { all, adds } = build(event)
  current = { id: event.id, path: event.path, event, phase: 'writing', newest: null, timer: 0, settle: 0 }
  const firstChanged = all.find(el => el.dataset.kind === 'add' || el.dataset.kind === 'del')
  renderMini()
  scheduleLists()

  const settle = () => {
    rowsEl.classList.remove('live')
    markNewest(null)
    current.phase = 'edited'
    refreshState()
  }
  if (!animate) {
    rowsEl.classList.remove('live')
    current.phase = 'edited'
    refreshState()
    firstChanged?.scrollIntoView({ block: 'center' })
    return
  }

  // new lines appear one per tick; the real edit is already decided, only the
  // pace is staged
  const mult = SPEEDS[prefs.speed - 1].mult
  const tick = Math.max(15, Math.min(120, 4000 / Math.max(1, adds.length))) * mult
  adds.forEach(el => reveal(el, false))
  rowsEl.classList.add('live')
  refreshState()
  if (prefs.follow) firstChanged?.scrollIntoView({ block: 'center' })
  let shown = 0
  current.timer = setInterval(() => {
    if (isPaused) return
    if (mult === 0) {
      adds.forEach(el => reveal(el, true))
      shown = adds.length
    } else if (shown < adds.length) {
      const el = adds[shown++]
      reveal(el, true)
      markNewest(el)
      if (prefs.follow) el.scrollIntoView({ block: 'nearest' })
    }
    updateBox()
    if (shown >= adds.length) {
      clearInterval(current.timer)
      current.settle = setTimeout(settle, Math.max(1200, 24 * tick))
    }
  }, mult === 0 ? 30 : tick)
}

const clearView = () => {
  stopAnimation()
  current = null
  rowsEl.replaceChildren()
  rowsEl.classList.remove('live')
  nameEl.textContent = 'Waiting for an edit...'
  nameEl.removeAttribute('title')
  renderMini()
  refreshState()
}

const rerender = () => {
  if (current) show(current.event, false)
}

// a page opened late is sent the backlog at once: draw only the last edit
const flush = () => {
  if (!pending) return
  const event = pending
  pending = null
  if (isPaused) {
    queued = event
    refreshState()
  } else show(event, Date.now() - event.at < 5000)
}

const DIR = 'dir:'

// is this chat in what is selected: everything, one project, or one chat
const isShown = sessionId =>
  !selected ||
  selected === sessionId ||
  (selected.startsWith(DIR) && chats.get(sessionId)?.cwd === selected.slice(DIR.length))

const select = scope => {
  selected = scope
  pending = null
  queued = null
  const event = [...latest.values()].filter(edit => isShown(edit.sessionId)).sort((a, b) => b.at - a.at)[0]
  if (event) show(event, false)
  else clearView()
  scheduleLists()
}

/* the map of changes beside the scrollbar */

const updateBox = () => {
  const { scrollTop, scrollHeight, clientHeight } = rowsEl
  const isOverflowing = scrollHeight > clientHeight + 1
  miniBox.hidden = !isOverflowing
  if (!isOverflowing) return
  miniBox.style.top = `${(scrollTop / scrollHeight) * 100}%`
  miniBox.style.height = `${(clientHeight / scrollHeight) * 100}%`
}

const renderMini = () => {
  const rows = current?.event.rows ?? []
  miniEl.replaceChildren(miniBox)
  for (let i = 0; i < rows.length; ) {
    const kind = rows[i].kind
    if (kind !== 'add' && kind !== 'del') {
      i++
      continue
    }
    let j = i
    while (j < rows.length && rows[j].kind === kind) j++
    const mark = span(`mm ${kind}${kind === 'add' && current.event.isNew ? ' new' : ''}`, '')
    mark.style.top = `${(i / rows.length) * 100}%`
    mark.style.height = `${((j - i) / rows.length) * 100}%`
    miniEl.append(mark)
    i = j
  }
  updateBox()
}

rowsEl.addEventListener('scroll', updateBox)
new ResizeObserver(updateBox).observe(rowsEl)
// the map is the scrollbar: click or drag on it to scroll
const scrollToPointer = event => {
  const y = event.clientY - miniEl.getBoundingClientRect().top
  rowsEl.scrollTop = (y / miniEl.clientHeight) * rowsEl.scrollHeight - rowsEl.clientHeight / 2
}
miniEl.onpointerdown = event => {
  miniEl.setPointerCapture(event.pointerId)
  scrollToPointer(event)
}
miniEl.onpointermove = event => {
  if (miniEl.hasPointerCapture(event.pointerId)) scrollToPointer(event)
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
// when pressed; any other row runs `onPress`.
const node = ({ key, iconName, label, title, badge, right, kids = [], isSelected, opensOnPress, onPress }) => {
  const isOpen = !collapsed.has(key)
  const row = item('div', `nrow${isSelected ? ' sel' : ''}`)
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
  if (title) main.title = title
  if (isSelected) main.setAttribute('aria-current', 'true')
  main.onclick = () => (opensOnPress && kids.length > 0 ? toggleFolder(key) : onPress?.())
  row.append(main)

  const li = item('li', 'node', row)
  if (kids.length > 0 && isOpen) li.append(item('ul', 'kids', ...kids))
  return li
}

const plainCount = n => span('counts', String(n))
const changeCount = file => item('span', 'counts', span('pos', `+${file.adds}`), ' ', span('neg', `−${file.dels}`))

// All chats > a folder for each project > the chats working in it
const chatTree = () => {
  const groups = groupChats([...chats.values()])
  const total = groups.reduce((sum, group) => sum + group.chats.reduce((n, chat) => n + chat.count, 0), 0)
  return node({
    key: 'c:all',
    iconName: 'layers',
    label: 'All chats',
    right: plainCount(total),
    isSelected: selected === '',
    onPress: () => select(''),
    kids: groups.map(group =>
      node({
        key: `c:${group.cwd}`,
        iconName: 'folder',
        label: group.name,
        title: group.cwd,
        right: plainCount(group.chats.reduce((n, chat) => n + chat.count, 0)),
        isSelected: selected === `${DIR}${group.cwd}`,
        onPress: () => select(`${DIR}${group.cwd}`),
        kids: group.chats.map(chat =>
          node({
            key: `c:${chat.id}`,
            iconName: 'chat',
            label: chat.id.slice(0, 6),
            title: chat.label,
            right: plainCount(chat.count),
            isSelected: selected === chat.id,
            onPress: () => select(chat.id),
          }),
        ),
      }),
    ),
  })
}

// Each project's folder > the folders and files touched inside it
const fileNodes = (dir, base) => [
  ...dir.dirs.map(sub => {
    const key = `${base}/${sub.name}`
    return node({ key, iconName: 'folder', label: sub.name, opensOnPress: true, kids: fileNodes(sub, key) })
  }),
  ...dir.files.map(file =>
    node({
      key: `${base}|${file.name}`,
      iconName: 'file',
      label: file.name,
      title: file.path,
      badge: file.isNew ? span('pill', 'new') : null,
      right: changeCount(file),
      isSelected: current?.path === file.path,
      onPress: () => show(file.last, false),
    }),
  ),
]

const fileTreeNodes = () =>
  fileTree(
    [...files.values()]
      .filter(file => isShown(file.sessionId))
      .map(file => ({ ...file, cwd: chats.get(file.sessionId)?.cwd ?? '' })),
  ).map(project =>
    node({
      key: `f:${project.cwd}`,
      iconName: 'folder',
      label: project.name,
      title: project.cwd,
      opensOnPress: true,
      kids: fileNodes(project, `f:${project.cwd}`),
    }),
  )

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
  const scopeLabel = selected.startsWith(DIR) ? baseName(selected.slice(DIR.length)) : chats.get(selected)?.label
  $('s-chat').textContent = selected ? (scopeLabel ?? '') : 'All chats'
  renderElapsed()
}
setInterval(renderElapsed, 1000)

const renderLists = () => {
  isListsDue = false
  // first-seen order, so a button never moves under the pointer
  $('chat-list').replaceChildren(chatTree())

  $('feed-list').replaceChildren(
    ...feed
      .filter(entry => isShown(entry.sessionId))
      .map(entry => {
        const text = span('', entry.summary)
        text.title = `${chats.get(entry.sessionId)?.label ?? ''}: ${entry.summary}`
        return item('li', entry.status, span('tool', STATUS_MARK[entry.status]), text)
      }),
  )

  const fileRows = fileTreeNodes()
  $('file-list').replaceChildren(...(fileRows.length > 0 ? fileRows : [item('li', 'hint', 'No edits yet')]))
  renderStats()
}

function scheduleLists() {
  if (isListsDue) return
  isListsDue = true
  requestAnimationFrame(renderLists)
}

const noteChat = event => {
  const chat = chats.get(event.sessionId) ?? { id: event.sessionId, count: 0, firstAt: event.at }
  chats.set(event.sessionId, {
    ...chat,
    cwd: event.cwd,
    label: `${baseName(event.cwd)} · ${event.sessionId.slice(0, 6)}`,
    lastAt: event.at,
    count: chat.count + (event.type === 'tool' ? 1 : 0),
  })
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
  for (const [id, key] of [['b-follow', 'follow'], ['b-wrap', 'wrap'], ['b-side', 'side'], ['b-focus', 'focus']])
    $(id).setAttribute('aria-pressed', String(prefs[key]))
  for (const swatch of document.querySelectorAll('.swatch'))
    swatch.setAttribute('aria-pressed', String(swatch.dataset.theme === prefs.theme))
  $('speed').value = String(prefs.speed)
  $('speed-out').textContent = SPEEDS[prefs.speed - 1].name
  updateBox()
}

const setPaused = on => {
  isPaused = on
  document.body.classList.toggle('paused', on)
  $('b-pause').textContent = on ? 'Resume' : 'Pause'
  $('b-pause').setAttribute('aria-pressed', String(on))
  if (!on && queued) {
    const event = queued
    queued = null
    show(event, true)
  }
  refreshState()
}

$('b-pause').onclick = () => setPaused(!isPaused)
$('b-follow').onclick = () => save('follow', !prefs.follow)
$('b-wrap').onclick = () => save('wrap', !prefs.wrap)
$('b-focus').onclick = () => save('focus', !prefs.focus)
$('b-side').onclick = () => {
  save('side', !prefs.side)
  rerender()
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
  for (const map of [files, chats, latest, results]) map.clear()
  feed.length = 0
  selected = ''
  pending = null
  queued = null
  clearView()
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
    clearView()
    nameEl.textContent = 'Live view stopped. You can close this window.'
    $('st').textContent = 'stopped'
    $('conn').textContent = 'stopped'
    window.close()
    return
  }
  if (event.type === 'tool') {
    noteChat(event)
    feed.unshift({ ...event, status: results.get(event.id) === false ? 'failed' : 'running' })
    if (feed.length > FEED_MAX) feed.pop()
  } else if (event.type === 'edit') {
    noteChat(event)
    const key = `${event.sessionId}|${event.path}`
    const before = files.get(key)
    files.delete(key) // re-added last: the list is newest first
    files.set(key, {
      sessionId: event.sessionId,
      path: event.path,
      adds: (before?.adds ?? 0) + event.adds,
      dels: (before?.dels ?? 0) + event.dels,
      isNew: before ? before.isNew : event.isNew,
      last: event,
    })
    latest.set(event.sessionId, event)
    if (isShown(event.sessionId)) {
      pending = event
      requestAnimationFrame(flush)
    }
  } else if (event.type === 'done') {
    results.set(event.id, event.ok)
    const entry = feed.find(one => one.id === event.id)
    if (entry) entry.status = event.ok ? 'done' : 'failed'
    if (current?.id === event.id) refreshState()
  }
  scheduleLists()
}
