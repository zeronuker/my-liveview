const $ = id => document.getElementById(id)
const rowsEl = $('rows')
const nameEl = $('name')
const statusEl = $('status')

const MARKS = { add: '+', del: '-', ctx: ' ' }
const FEED_MAX = 100
const results = new Map() // tool id -> did it land
const feed = [] // newest first
const files = new Map() // path -> { path, cwd, adds, dels, last }; newest last
let current = null // { id, timer, settle }
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

const show = (event, animate) => {
  if (current) {
    clearInterval(current.timer)
    clearTimeout(current.settle)
  }
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

// a page opened late is sent the backlog at once: draw only the last edit
const flush = () => {
  if (!pending) return
  const event = pending
  pending = null
  show(event, Date.now() - event.at < 5000)
}

const STATUS_MARK = { running: '...', done: 'ok', failed: 'failed' }

const renderLists = () => {
  isListsDue = false
  $('feed-list').replaceChildren(
    ...feed.map(item => {
      const li = document.createElement('li')
      li.className = item.status
      const tool = document.createElement('span')
      tool.className = 'tool'
      tool.textContent = STATUS_MARK[item.status]
      const text = document.createElement('span')
      text.textContent = item.summary
      text.title = `${baseName(item.cwd)}: ${item.summary}`
      li.append(tool, text)
      return li
    }),
  )
  $('file-list').replaceChildren(
    ...[...files.values()].reverse().map(file => {
      const li = document.createElement('li')
      const button = document.createElement('button')
      button.type = 'button'
      button.title = file.path
      if (current?.path === file.path) button.setAttribute('aria-current', 'true')
      const name = document.createElement('span')
      name.textContent = baseName(file.path)
      const counts = document.createElement('span')
      counts.className = 'counts'
      counts.textContent = `+${file.adds} -${file.dels}`
      button.append(name, counts)
      button.onclick = () => show(file.last, false)
      li.append(button)
      return li
    }),
  )
}

function scheduleLists() {
  if (isListsDue) return
  isListsDue = true
  requestAnimationFrame(renderLists)
}

const source = new EventSource('/stream')
source.onopen = () => {
  // the server replays its backlog on every connect: start from nothing
  feed.length = 0
  files.clear()
  results.clear()
  $('conn').textContent = 'connected'
}
source.onerror = () => ($('conn').textContent = 'reconnecting...')
source.onmessage = message => {
  const event = JSON.parse(message.data)
  if (event.type === 'tool') {
    feed.unshift({ ...event, status: results.get(event.id) === false ? 'failed' : 'running' })
    if (feed.length > FEED_MAX) feed.pop()
  } else if (event.type === 'edit') {
    const before = files.get(event.path)
    files.delete(event.path) // re-added last: the list is newest first
    files.set(event.path, {
      path: event.path,
      adds: (before?.adds ?? 0) + event.adds,
      dels: (before?.dels ?? 0) + event.dels,
      last: event,
    })
    pending = event
    requestAnimationFrame(flush)
  } else if (event.type === 'done') {
    results.set(event.id, event.ok)
    const item = feed.find(entry => entry.id === event.id)
    if (item) item.status = event.ok ? 'done' : 'failed'
    if (current?.id === event.id && !event.ok) setStatus('NOT APPLIED', true)
  }
  scheduleLists()
}
