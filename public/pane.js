import { highlight, langOf } from './highlight.js'
import { withInlineDiff } from './inline.js'
import { typingPlan } from './typing.js'

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
  const shown = withInlineDiff(rows)
  for (const row of shown) {
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
  return { node: split, all: [...left, ...right], adds: right.filter(el => el.dataset.kind === 'add'), shown }
}

const build = (rows, event, isSide) => {
  const opts = { isNew: event.isNew, lang: langOf(event.path) }
  if (isSide) return buildSide(rows, opts)
  const shown = withInlineDiff(rows)
  const all = shown.map(row => buildRow(row, opts))
  return { all, adds: all.filter(el => el.dataset.kind === 'add'), shown }
}

// What typing needs from the rows: each change's count of removed lines and
// the texts of the lines that replace them (the same grouping as buildSide).
const blocksOf = rows => {
  const blocks = []
  let open = null
  for (const row of rows) {
    if (row.kind !== 'add' && row.kind !== 'del') open = null
    else {
      if (!open || (row.kind === 'del' && open.adds.length > 0)) blocks.push((open = { dels: 0, adds: [] }))
      if (row.kind === 'del') open.dels++
      else open.adds.push(row.text ?? '')
    }
  }
  return blocks
}

// An added line showing the first part of its text; a line that replaced
// another keeps its changed words brightened as far as they have been typed.
const paintLine = (el, row, text) => {
  const t = el.querySelector('.t')
  t.replaceChildren()
  if (!row.parts || !row.text.startsWith(text)) return t.append(text)
  let left = text.length
  for (const part of row.parts) {
    const piece = part.text.slice(0, left)
    left -= piece.length
    if (piece) t.append(part.isChanged ? make('span', 'chg', piece) : piece)
  }
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

    // the new lines are typed, the removed ones selected first; the real edit is
    // already decided, only the way it is written is staged
    const { steps } = typingPlan(blocksOf(built.shown))
    const dels = all.filter(el => el.dataset.kind === 'del')
    const addRows = built.shown.filter(row => row.kind === 'add')
    adds.forEach(el => reveal(el, false))
    rowsEl.classList.add('live')
    refresh()
    if (prefs.follow) firstChanged?.scrollIntoView({ block: 'center' })
    let at = 0 // ms of the plan played so far, at the normal pace
    let next = 0
    let before = performance.now()
    const step = () => {
      const now = performance.now()
      const elapsed = now - before
      before = now
      if (isPaused()) return
      at += mult === 0 ? Infinity : elapsed / mult
      let lastTyped = -1
      while (next < steps.length && steps[next].at <= at) {
        const s = steps[next++]
        if ('add' in s) {
          reveal(adds[s.add], true)
          paintLine(adds[s.add], addRows[s.add], s.text)
          lastTyped = s.add
        } else dels.forEach((el, i) => el.classList.toggle('sel', s.select !== null && i >= s.select[0] && i < s.select[1]))
      }
      if (lastTyped !== -1) {
        markNewest(adds[lastTyped])
        if (getPrefs().follow) adds[lastTyped].scrollIntoView({ block: 'nearest' })
      }
      updateBox()
      if (next >= steps.length) {
        clearInterval(current.timer)
        current.settle = setTimeout(settle, settleMs === 1200 ? 1200 * Math.max(1, mult) : settleMs)
      }
    }
    current.timer = setInterval(step, 20)
    // the reveal, all of it now (`silent` leaves the next waiting edit for the caller)
    current.finish = silent => {
      stop()
      markNewest(null)
      adds.forEach((el, i) => {
        reveal(el, true)
        paintLine(el, addRows[i], addRows[i].text ?? '')
      })
      dels.forEach(el => el.classList.remove('sel'))
      rowsEl.classList.remove('live')
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
