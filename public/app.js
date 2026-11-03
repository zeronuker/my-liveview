const $ = id => document.getElementById(id)
const rowsEl = $('rows')
const nameEl = $('name')
const statusEl = $('status')

const MARKS = { add: '+', del: '-', ctx: ' ' }
const FEED_MAX = 100
const results = new Map() // tool id -> did it land
const feed = [] // newest first
const files = new Map() // sessionId|path -> { sessionId, path, adds, dels, last }; newest last
const chats = new Map() // sessionId -> { id, label, lastAt, count }
const latest = new Map() // sessionId -> that chat's last edit
let lastEdit = null // the last edit of any chat
let selected = '' // a sessionId, or '' for every chat
let current = null // { id, path, timer, settle }
let pending = null
let isListsDue = false

const baseName = p => p.split(/[\\/]/).filter(Boolean).pop() ?? p

const setStatus = (text, isFailed) => {
  statusEl.textContent = text
  statusEl.classList.toggle('failed', Boolean(isFailed))
}

const buildRow = (row, isNew) => {
  const el = document.createElement('div')
  el.className = `row ${row.kind}${row.kind === 'add' && isNew ? ' new' : ''}`
  if (row.kind === 'gap') {
    el.textContent = row.text
    return el
  }
  for (const [cls, text] of [['n', row.n], ['m', MARKS[row.kind]], ['t', row.text]]) {
    const span = document.createElement('span')
    span.className = cls
    span.textContent = text
    el.append(span)
  }
  return el
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

  const els = event.rows.map(row => buildRow(row, event.isNew))
  rowsEl.replaceChildren(...els)
  const adds = els.filter(el => el.classList.contains('add'))
  const firstChanged = els.find(el => el.classList.contains('add') || el.classList.contains('del'))
  current = { id: event.id, path: event.path }
  scheduleLists()

  const settle = () => {
    rowsEl.classList.remove('live')
    const isFailed = results.get(event.id) === false
    setStatus(isFailed ? 'NOT APPLIED' : 'edited', isFailed)
  }
  if (!animate) {
    settle()
    firstChanged?.scrollIntoView({ block: 'center' })
    return
  }

  // new lines appear one per tick, newest kept in view; the real edit is
  // already decided, only the pace is staged
  adds.forEach(el => (el.hidden = true))
  rowsEl.classList.add('live')
  setStatus('writing')
  firstChanged?.scrollIntoView({ block: 'center' })
  const tick = Math.max(15, Math.min(120, 4000 / Math.max(1, adds.length)))
  let shown = 0
  current.timer = setInterval(() => {
    if (shown < adds.length) {
      const el = adds[shown++]
      el.hidden = false
      el.scrollIntoView({ block: 'nearest' })
      return
    }
    clearInterval(current.timer)
    current.settle = setTimeout(settle, 24 * tick)
  }, tick)
}

const clearView = () => {
  stopAnimation()
  current = null
  rowsEl.replaceChildren()
  rowsEl.classList.remove('live')
  nameEl.textContent = 'Waiting for an edit...'
  nameEl.removeAttribute('title')
  setStatus('')
}

// a page opened late is sent the backlog at once: draw only the last edit
const flush = () => {
  if (!pending) return
  const event = pending
  pending = null
  show(event, Date.now() - event.at < 5000)
}

const select = sessionId => {
  selected = sessionId
  pending = null
  const event = sessionId ? latest.get(sessionId) : lastEdit
  if (event) show(event, false)
  else clearView()
  scheduleLists()
}

const isShown = sessionId => !selected || selected === sessionId

const item = (tag, className, ...children) => {
  const el = document.createElement(tag)
  if (className) el.className = className
  el.append(...children)
  return el
}

const span = (className, text) => {
  const el = document.createElement('span')
  el.className = className
  el.textContent = text
  return el
}

const chatButton = (sessionId, label, count) => {
  const button = item('button', '', span('', label), span('counts', String(count)))
  button.type = 'button'
  if (selected === sessionId) button.setAttribute('aria-current', 'true')
  button.onclick = () => select(sessionId)
  return item('li', '', button)
}

const STATUS_MARK = { running: '...', done: 'ok', failed: 'failed' }

const renderLists = () => {
  isListsDue = false
  // first-seen order, so a button never moves under the pointer
  const all = [...chats.values()]
  $('chat-list').replaceChildren(
    chatButton('', 'All chats', all.reduce((sum, chat) => sum + chat.count, 0)),
    ...all.map(chat => chatButton(chat.id, chat.label, chat.count)),
  )

  $('feed-list').replaceChildren(
    ...feed
      .filter(entry => isShown(entry.sessionId))
      .map(entry => {
        const text = span('', entry.summary)
        text.title = `${chats.get(entry.sessionId)?.label ?? ''}: ${entry.summary}`
        return item('li', entry.status, span('tool', STATUS_MARK[entry.status]), text)
      }),
  )

  $('file-list').replaceChildren(
    ...[...files.values()]
      .filter(file => isShown(file.sessionId))
      .reverse()
      .map(file => {
        const button = item('button', '', span('', baseName(file.path)), span('counts', `+${file.adds} -${file.dels}`))
        button.type = 'button'
        button.title = file.path
        if (current?.path === file.path) button.setAttribute('aria-current', 'true')
        button.onclick = () => show(file.last, false)
        return item('li', '', button)
      }),
  )
}

function scheduleLists() {
  if (isListsDue) return
  isListsDue = true
  requestAnimationFrame(renderLists)
}

const noteChat = event => {
  const chat = chats.get(event.sessionId) ?? { id: event.sessionId, count: 0 }
  chats.set(event.sessionId, {
    ...chat,
    label: `${baseName(event.cwd)} · ${event.sessionId.slice(0, 6)}`,
    lastAt: event.at,
    count: chat.count + (event.type === 'tool' ? 1 : 0),
  })
}

const source = new EventSource('/stream')
source.onopen = () => {
  // the server replays its backlog on every connect: start from nothing
  for (const map of [files, chats, latest, results]) map.clear()
  feed.length = 0
  lastEdit = null
  selected = ''
  clearView()
  $('conn').textContent = 'connected'
}
source.onerror = () => ($('conn').textContent = 'reconnecting...')
source.onmessage = message => {
  const event = JSON.parse(message.data)
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
      last: event,
    })
    latest.set(event.sessionId, event)
    lastEdit = event
    if (isShown(event.sessionId)) {
      pending = event
      requestAnimationFrame(flush)
    }
  } else if (event.type === 'done') {
    results.set(event.id, event.ok)
    const entry = feed.find(one => one.id === event.id)
    if (entry) entry.status = event.ok ? 'done' : 'failed'
    if (current?.id === event.id && !event.ok) setStatus('NOT APPLIED', true)
  }
  scheduleLists()
}
