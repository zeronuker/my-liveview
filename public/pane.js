import { highlight, langOf } from './highlight.js'
import { withInlineDiff } from './inline.js'

const MARKS = { add: '+', del: '-', ctx: ' ' }
const CARET = 'caret'

const make = (tag, className, ...children) => {
  const el = document.createElement(tag)
  if (className) el.className = className
  el.append(...children)
  return el
}

const baseName = path => path.split(/[\\/]/).filter(Boolean).pop() ?? path

const buildRow = (row, { isNew, lang }) => {
  const el = make('div', `row ${row.kind}${row.kind === 'add' && isNew ? ' new' : ''}`)
  el.dataset.kind = row.kind
  if (row.kind === 'gap') {
    el.textContent = row.text
    return el
  }
  const text = make('span', 't')
  if (row.kind === 'ctx')
    for (const part of highlight(row.text, lang))
      text.append(part.cls ? make('span', `t-${part.cls}`, part.text) : part.text)
  else if (row.parts)
    // a line that replaced another: only the words that changed are brightened
    for (const part of row.parts) text.append(part.isChanged ? make('span', 'chg', part.text) : part.text)
  else text.textContent = row.text ?? ''
  el.append(make('span', 'n', String(row.n ?? '')), make('span', 'm', MARKS[row.kind] ?? ''), text)
  return el
}

// one column of rows, or two with a changed block's old and new lines side by
// side (the shorter side padded so the unchanged lines below stay level)
const buildSide = (rows, opts) => {
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
  for (const row of withInlineDiff(rows)) {
    if (row.kind === 'del') block.d.push(row)
    else if (row.kind === 'add') block.a.push(row)
    else {
      flush()
      left.push(buildRow(row.kind === 'ctx' ? { ...row, n: row.n + shift } : row, opts))
      right.push(buildRow(row, opts))
    }
  }
  flush()
  const split = make('div', 'split', make('div', 'col', ...left), make('div', 'col', ...right))
  return { node: split, all: [...left, ...right], adds: right.filter(el => el.dataset.kind === 'add') }
}

const build = (rows, event, isSide) => {
  const opts = { isNew: event.isNew, lang: langOf(event.path) }
  if (isSide) return buildSide(rows, opts)
  const all = withInlineDiff(rows).map(row => buildRow(row, opts))
  return { all, adds: all.filter(el => el.dataset.kind === 'add') }
}

let uses = 0 // a counter, so "used longest ago" is never a tie

// One place to watch a file: its own header, rows and change map. It draws one
// edit at a time and says when it has finished (`onSettle`) so the next one
// that was waiting can take its place.
//   getPrefs()   the person's settings; isPaused()  freezes the reveal
//   didFail(id)  whether that edit was refused; onStatus()  something changed
export const createPane = ({ index, getPrefs, isPaused, didFail, onSettle, onStatus, onClose }) => {
  const nameEl = make('strong', 'name', 'Waiting for an edit...')
  const chatEl = make('span', 'chat-name')
  const statusEl = make('span', 'status')
  statusEl.setAttribute('role', 'status')
  const closeBtn = make('button', 'close', '×')
  closeBtn.type = 'button'
  closeBtn.setAttribute('aria-label', 'Close this pane')
  closeBtn.hidden = index === 0
  closeBtn.onclick = () => onClose(pane)

  const rowsEl = make('div', 'rows')
  const miniBox = make('div', 'mini-box')
  miniBox.hidden = true
  const miniEl = make('div', 'mini', miniBox)
  miniEl.setAttribute('aria-hidden', 'true')
  const root = make('section', 'pane', make('div', 'filebar', nameEl, chatEl, statusEl, closeBtn), make('div', 'code', rowsEl, miniEl))
  root.hidden = index !== 0

  let current = null // { id, path, event, rows, side, phase, newest, timer, delay, settle, finish }

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
    const rows = current?.rows ?? []
    miniEl.replaceChildren(miniBox)
    for (let i = 0; i < rows.length; ) {
      const kind = rows[i].kind
      if (kind !== 'add' && kind !== 'del') {
        i++
        continue
      }
      let j = i
      while (j < rows.length && rows[j].kind === kind) j++
      const mark = make('span', `mm ${kind}${kind === 'add' && current.event.isNew ? ' new' : ''}`)
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

  /* drawing an edit */

  // a line not yet written is out of the way (unified) or only invisible (side
  // by side, where the two columns must stay level)
  const reveal = (el, isShown) => {
    if (current.side) el.classList.toggle('unrevealed', !isShown)
    else el.hidden = !isShown
  }

  const markNewest = el => {
    current.newest?.classList.remove('nw')
    current.newest?.querySelector(`.${CARET}`)?.remove()
    current.newest = el
    if (!el) return
    el.classList.add('nw')
    el.querySelector('.t').append(make('span', CARET, '▍'))
  }

  const stop = () => {
    if (!current) return
    clearInterval(current.timer)
    clearTimeout(current.delay)
    clearTimeout(current.settle)
  }

  // the header's status: paused wins, then a refused edit, then where the reveal is
  const refresh = () => {
    let text = ''
    if (current) {
      if (isPaused()) text = 'paused'
      else if (didFail(current.id)) text = 'NOT APPLIED'
      else text = current.phase
    }
    statusEl.textContent = text
    statusEl.classList.toggle('failed', text === 'NOT APPLIED')
    onStatus()
  }

  // Draws one edit. `animate` reveals the new lines one by one at `mult` times
  // the usual pace (0 is all at once), and holds the last line `settleMs` more.
  const render = (event, rows, { animate, mult = 1, settleMs = 1200 } = {}) => {
    stop()
    const prefs = getPrefs()
    nameEl.textContent = baseName(event.path)
    nameEl.title = event.path
    const built = build(rows, event, prefs.side)
    if (built.node) rowsEl.replaceChildren(built.node)
    else rowsEl.replaceChildren(...built.all)
    const { all, adds } = built
    current = { id: event.id, path: event.path, event, rows, side: prefs.side, phase: 'writing', newest: null, timer: 0, delay: 0, settle: 0, finish: null }
    pane.usedAt = ++uses
    const firstChanged = all.find(el => el.dataset.kind === 'add' || el.dataset.kind === 'del')
    renderMini()

    const settle = () => {
      rowsEl.classList.remove('live')
      markNewest(null)
      current.phase = 'edited'
      refresh()
      onSettle(pane)
    }
    if (!animate) {
      rowsEl.classList.remove('live')
      current.phase = 'edited'
      refresh()
      firstChanged?.scrollIntoView({ block: 'center' })
      return
    }

    // new lines appear one per tick; the real edit is already decided, only the pace is staged
    const tick = Math.max(15, Math.min(120, 4000 / Math.max(1, adds.length))) * mult
    adds.forEach(el => reveal(el, false))
    rowsEl.classList.add('live')
    refresh()
    if (prefs.follow) firstChanged?.scrollIntoView({ block: 'center' })
    let shown = 0
    const step = () => {
      if (isPaused()) return
      if (mult === 0) {
        adds.forEach(el => reveal(el, true))
        shown = adds.length
      } else if (shown < adds.length) {
        const el = adds[shown++]
        reveal(el, true)
        markNewest(el)
        if (getPrefs().follow) el.scrollIntoView({ block: 'nearest' })
      }
      updateBox()
      if (shown >= adds.length) {
        clearInterval(current.timer)
        current.settle = setTimeout(settle, settleMs === 1200 ? Math.max(1200, 24 * tick) : settleMs)
      }
    }
    // lines taken out show alone for a moment first, so what is about to go can be read
    const pause = event.dels > 0 ? 1200 * mult : 0
    if (pause > 0) current.delay = setTimeout(() => (current.timer = setInterval(step, tick)), pause)
    else current.timer = setInterval(step, mult === 0 ? 30 : tick)
    // the reveal, all of it now (`silent` leaves the next waiting edit for the caller)
    current.finish = silent => {
      stop()
      adds.forEach(el => reveal(el, true))
      rowsEl.classList.remove('live')
      markNewest(null)
      current.phase = 'edited'
      refresh()
      if (!silent) onSettle(pane)
    }
  }

  const clear = () => {
    stop()
    current = null
    rowsEl.replaceChildren()
    rowsEl.classList.remove('live')
    nameEl.textContent = 'Waiting for an edit...'
    nameEl.removeAttribute('title')
    chatEl.textContent = ''
    renderMini()
    refresh()
  }

  const pane = {
    root,
    index,
    usedAt: 0,
    get current() {
      return current
    },
    get isBusy() {
      return current?.phase === 'writing'
    },
    get isVisible() {
      return !root.hidden
    },
    key: () => (current ? `${current.event.sessionId}|${current.path}` : null),
    open: () => (root.hidden = false),
    hide: () => {
      clear()
      if (index !== 0) root.hidden = true
    },
    setChat: text => (chatEl.textContent = text),
    setTitle: text => (nameEl.textContent = text),
    finish: silent => current?.finish?.(silent),
    render,
    clear,
    refresh,
    updateBox,
  }
  return pane
}
