// The Office's stage: it plays the director's commands out over time. Workers
// walk over the floor plan, do their jobs and talk in bubbles. It knows nothing
// about drawing: office.js asks for a snapshot and paints it.
//
// Time is the stage's own. `tick(now)` moves it on by however long it has been
// since the last tick, so a window that was hidden for a while catches up in
// one go (up to two simulated minutes), and `getMult()` is the speed: 1 for
// normal, 2 for slow, 0.4 for fast, 0 for instant (nobody walks, nothing waits).
//
// Each worker has a line of jobs. A job is a place to go and something to do
// there; a job can hold the worker there until something happens (`until`).
import { findPath } from './walk.js'

const WALK = 4 // tiles a second
const ENTER_GAP = 0.4 // seconds between two arrivals
const STEP = 0.1 // simulated seconds per step; longer gaps use fewer, bigger steps
const MAX_CATCH_UP = 120 // simulated seconds a long gap is allowed to cover
const INSTANT_STEPS = 200 // at instant speed: how many steps a tick may take

const baseName = path => String(path ?? '').split(/[\\/]/).filter(Boolean).pop() ?? ''

export const createStage = ({ layout, getMult = () => 1 }) => {
  const { grid, spots } = layout
  const workers = new Map() // id -> worker (the manager too)
  const handedIn = new Set() // workers whose work is on the manager's tray
  const answered = new Set() // chats whose permission has been answered
  const compacted = new Set() // chats whose memory has been compacted
  const lastOf = new Map() // chat -> the worker last given something to do
  const deskOwner = Array(spots.desks.length).fill(null)
  const seatOwner = Array(spots.seats.length).fill(null)
  const ceo = { bubble: null, papers: 0 }
  let stack = 0 // work on the manager's tray
  let clock = 0 // simulated seconds
  let lastTick = null
  let lastArrival = -Infinity
  let shared = 0 // desks and seats used by more than one when the places run out
  let paused = false
  let skipping = false
  const deskSharers = Array(spots.desks.length).fill(0) // how many share each desk, past the first
  const seatSharers = Array(spots.seats.length).fill(0)
  let labTurn = 0
  let shelfTurn = 0

  const makeWorker = (info, x, y, present) => ({
    queue: [], cells: [], pending: null, act: null,
    pose: 'idle', facing: 1, bubble: null, label: '', carry: null,
    desk: -1, seat: -1, deskSlot: 0, seatSlot: 0, enterAt: 0, present, x, y, ...info,
  })

  const manager = makeWorker({ id: 'manager', name: 'Manager', color: '#8d6e63', kind: 'manager', sessionId: null }, spots.managerSeat.x, spots.managerSeat.y, true)
  workers.set(manager.id, manager)

  // a free desk or seat first; when all are taken, one is shared
  const claim = (owners, sharers, worker, key) => {
    if (worker[key] !== -1) return worker[key]
    let i = owners.indexOf(null)
    if (i === -1) {
      i = shared++ % owners.length
      worker[`${key}Slot`] = ++sharers[i] // a place to stand beside whoever is there
    } else owners[i] = worker.id
    worker[key] = i
    return i
  }
  const deskOf = worker => spots.desks[claim(deskOwner, deskSharers, worker, 'desk')]
  const seatOf = worker => spots.seats[claim(seatOwner, seatSharers, worker, 'seat')]
  const shelfFor = path => {
    if (!path) return spots.files[shelfTurn++ % spots.files.length]
    const sum = [...path].reduce((total, ch) => total + ch.charCodeAt(0), 0)
    return spots.files[sum % spots.files.length]
  }
  const homeOf = worker => (worker.kind === 'manager' ? spots.managerSeat : seatOf(worker))

  const ok = text => ({ text, kind: 'ok' })
  const bad = text => ({ text, kind: 'bad' })

  // what a step means for a worker: a list of jobs
  const jobs = (worker, cmd) => {
    const file = baseName(cmd.path ?? worker.path)
    const waitsForNext = { until: () => worker.queue.length > 0 }
    const handIn = [
      { spot: () => spots.handIn, act: { pose: 'give', dur: 0.8, label: 'Handing in', carry: null, done: () => { handedIn.add(worker.id); stack++ } } },
      { spot: () => seatOf(worker), act: { pose: 'sit', dur: 0.4 } },
    ]
    switch (cmd.step) {
      case 'arrive':
        return [{ spot: () => seatOf(worker), act: { pose: 'sit', dur: 0.6, label: worker.agentType ? `${worker.agentType} helper` : 'Helper' } }]
      case 'fetch':
        return [{ spot: () => shelfFor(cmd.path ?? worker.path), act: { pose: 'grab', dur: 1.1, label: `Fetching ${file}`, carry: 'book' } }]
      case 'study':
        return [{ spot: () => seatOf(worker), act: { pose: 'read', dur: 2.4, label: `Reading ${file}` } }]
      case 'write': {
        const lines = Math.min(200, (cmd.adds ?? 0) + (cmd.dels ?? 0))
        return [{ spot: () => deskOf(worker), act: { pose: 'type', dur: 1.4 + lines * 0.03, label: `Writing ${file}`, carry: 'book' } }]
      }
      case 'handIn':
        return handIn
      case 'report': // a helper hands in its report; a worker says what the search found
        return worker.kind === 'subagent' ? handIn : [{ spot: null, act: { pose: 'idle', dur: 1, label: 'Found it', bubble: ok('✓') } }]
      case 'reject':
        return [{ spot: null, act: { pose: 'shake', dur: 1.4, label: 'Edit not applied', bubble: bad('✗'), carry: null } }]
      case 'test':
        return [{ spot: () => spots.lab[labTurn++ % spots.lab.length], act: { pose: 'machine', dur: 1.5, label: 'Running tests', ...waitsForNext } }]
      case 'search':
        return [{ spot: () => shelfFor(null), act: { pose: 'scan', dur: 1.2, label: 'Searching', ...waitsForNext } }]
      case 'call': // an MCP tool: out by the front door, waiting for the answer
        return [{ spot: () => spots.entrance, act: { pose: 'scan', dur: 1.2, label: cmd.server ? `Calling ${cmd.server}` : 'Calling a tool', ...waitsForNext } }]
      case 'unavailable':
        return [{ spot: null, act: { pose: 'shake', dur: 1.5, label: 'Tool unavailable', bubble: bad('✗') } }]
      case 'pass':
        return [{ spot: null, act: { pose: 'idle', dur: 1.2, label: 'Passed', bubble: ok('✓') } }]
      case 'fail':
        return [{ spot: null, act: { pose: 'shake', dur: 1.5, label: 'Failed', bubble: bad('✗') } }]
      default:
        return []
    }
  }

  const remove = worker => {
    worker.removed = true
    workers.delete(worker.id)
    for (const owners of [deskOwner, seatOwner]) owners.forEach((id, i) => id === worker.id && (owners[i] = null))
  }

  // a job's act begins: the worker is where it should be
  const begin = worker => {
    const act = { ...worker.pending, t: 0 }
    worker.pending = null
    worker.act = act
    worker.pose = act.pose ?? 'idle'
    worker.label = act.label ?? ''
    worker.bubble = act.bubble ?? null
    if (act.carry !== undefined) worker.carry = act.carry
  }

  const finish = worker => {
    const { act } = worker
    worker.act = null
    worker.bubble = null
    worker.label = ''
    worker.pose = 'idle'
    act.done?.()
    if (act.leave) remove(worker)
  }

  const startNext = worker => {
    for (;;) {
      const job = worker.queue.shift()
      if (!job) {
        worker.pose = 'idle'
        return
      }
      if (job.skipIf?.()) continue
      job.onStart?.()
      if (job.carryNow !== undefined) worker.carry = job.carryNow
      worker.pending = job.act
      const spot = typeof job.spot === 'function' ? job.spot() : job.spot
      if (!spot) return begin(worker)
      const path = isInstant() ? null : findPath(grid, [Math.round(worker.x), Math.round(worker.y)], [spot.x, spot.y])
      if (path && path.length > 0) {
        worker.cells = path
        worker.pose = 'walk'
      } else {
        worker.x = spot.x // already there, or (instant speed) straight there
        worker.y = spot.y
        begin(worker)
      }
      return
    }
  }

  const walk = (worker, dt) => {
    let distance = WALK * dt
    while (distance > 0 && worker.cells.length > 0) {
      const [tx, ty] = worker.cells[0]
      const dx = tx - worker.x
      const dy = ty - worker.y
      const gap = Math.hypot(dx, dy)
      if (dx !== 0) worker.facing = Math.sign(dx)
      if (gap <= distance) {
        worker.x = tx
        worker.y = ty
        worker.cells.shift()
        distance -= gap
      } else {
        worker.x += (dx / gap) * distance
        worker.y += (dy / gap) * distance
        distance = 0
      }
    }
    if (worker.cells.length === 0) begin(worker)
  }

  const update = (worker, dt, instant) => {
    if (!worker.present) {
      if (clock < worker.enterAt) return
      worker.present = true
    }
    if (worker.cells.length > 0) return walk(worker, dt)
    if (worker.act) {
      worker.act.t += dt
      if (worker.act.t >= (instant ? 0 : worker.act.dur) && (!worker.act.until || worker.act.until())) finish(worker)
      return
    }
    startNext(worker)
  }

  const isInstant = () => skipping || getMult() === 0

  const isIdle = () => [...workers.values()].every(w => w.queue.length === 0 && !w.act && w.cells.length === 0 && !w.pending && w.present)

  // a long line of work makes everyone hurry a little
  const rush = () => {
    let waiting = 0
    for (const w of workers.values()) waiting += w.queue.length
    return Math.min(4, 1 + Math.max(0, waiting - 6) * 0.15)
  }

  const tick = now => {
    if (lastTick === null) {
      lastTick = now
      return
    }
    const real = Math.max(0, (now - lastTick) / 1000)
    lastTick = now
    if (paused) return
    const mult = getMult()
    const instant = mult === 0
    const sim = instant ? INSTANT_STEPS : Math.min(real / mult, MAX_CATCH_UP) * rush()
    const steps = instant ? INSTANT_STEPS : Math.max(1, Math.ceil(sim / STEP))
    const dt = instant ? 1 : sim / steps
    for (let i = 0; i < steps; i++) {
      step(dt, instant)
      if (instant && isIdle()) break
    }
  }

  const step = (dt, instant) => {
    clock += dt
    for (const worker of [...workers.values()]) update(worker, dt, instant)
    if (ceo.bubble && ceo.bubble.until <= clock) ceo.bubble = null
  }

  // Skip: what is going on is over, now. A worker waiting on a permission still waits.
  const skip = () => {
    skipping = true
    for (let i = 0; i < INSTANT_STEPS && !isIdle(); i++) step(1, true)
    skipping = false
  }

  const setPaused = on => {
    paused = on
  }

  const apply = (cmd, now) => {
    tick(now)
    switch (cmd.cmd) {
      case 'hire': {
        const { worker: info } = cmd
        if (workers.has(info.id)) return
        const enterAt = Math.max(clock, lastArrival + ENTER_GAP)
        lastArrival = enterAt
        const worker = makeWorker(info, spots.entrance.x, spots.entrance.y, false)
        worker.enterAt = enterAt
        workers.set(worker.id, worker)
        lastOf.set(worker.sessionId, worker.id)
        return
      }
      case 'do': {
        const worker = workers.get(cmd.worker)
        if (!worker) return
        worker.queue.push(...jobs(worker, cmd))
        lastOf.set(worker.sessionId, worker.id)
        return
      }
      case 'fire': {
        const worker = workers.get(cmd.worker)
        if (worker) worker.queue.push({ spot: () => spots.entrance, act: { dur: 0, leave: true } })
        return
      }
      case 'review': {
        const delivered = () => cmd.workers.every(id => handedIn.has(id) || !workers.has(id))
        manager.queue.push({ spot: () => spots.managerSeat, act: { pose: 'review', dur: 2.5, label: 'Reviewing', until: delivered } })
        return
      }
      case 'submit':
        manager.queue.push(
          {
            carryNow: 'papers',
            spot: () => spots.ceoDelivery,
            act: {
              pose: 'give', dur: 1.2, label: 'Submitting', carry: null, bubble: ok('✓'),
              done: () => {
                ceo.papers += stack
                stack = 0
                ceo.bubble = { text: 'Received', kind: 'ok', until: clock + 2.5 }
              },
            },
          },
          { spot: () => spots.managerSeat, act: { pose: 'idle', dur: 0.4 } },
        )
        return
      case 'ask': {
        answered.delete(cmd.sessionId)
        const asker = workers.get(lastOf.get(cmd.sessionId))
        const worker = asker?.present && !asker.queue.some(job => job.act?.leave) ? asker : manager
        let started = false
        worker.queue.push(
          {
            skipIf: () => answered.has(cmd.sessionId),
            onStart: () => { started = true },
            spot: () => spots.ceoDoor,
            act: { pose: 'ask', dur: 0.5, label: 'Needs approval', bubble: { text: '?', kind: 'ask' }, until: () => answered.has(cmd.sessionId) },
          },
          { skipIf: () => !started, spot: () => homeOf(worker), act: { pose: 'sit', dur: 0.3 } },
        )
        return
      }
      case 'answered':
        answered.add(cmd.sessionId)
        return
      case 'fail':
        manager.queue.push({ spot: () => spots.managerSeat, act: { pose: 'shake', dur: 2.5, label: cmd.label, bubble: bad('!') } })
        return
      case 'compact': {
        // the manager tidies the notes in the file room until the compaction is over
        compacted.delete(cmd.sessionId)
        let started = false
        manager.queue.push(
          {
            skipIf: () => compacted.has(cmd.sessionId),
            onStart: () => { started = true },
            spot: () => shelfFor(null),
            act: { pose: 'scan', dur: 1.5, label: 'Compacting memory', bubble: { text: '…', kind: 'info' }, until: () => compacted.has(cmd.sessionId) },
          },
          { skipIf: () => !started, spot: () => spots.managerSeat, act: { pose: 'sit', dur: 0.3 } },
        )
        return
      }
      case 'compacted':
        compacted.add(cmd.sessionId)
        return
      case 'note': // a few words over the CEO or the manager
        if (cmd.who === 'ceo') ceo.bubble = { text: cmd.text, kind: cmd.kind, until: clock + 2.5 }
        else manager.queue.push({ spot: null, act: { pose: 'idle', dur: 1.6, label: cmd.text, bubble: { text: '•', kind: cmd.kind } } })
        return
      case 'memo':
        manager.queue.push({ spot: null, act: { pose: 'read', dur: 1.2, label: 'Reading a memo' } })
        return
      case 'clear': {
        // /clear: once everyone who was here has gone home, what is on the tray is swept away
        const there = [...workers.keys()].filter(id => id !== manager.id)
        manager.queue.push({
          spot: null,
          act: {
            pose: 'idle', dur: 1, label: 'Fresh start', until: () => there.every(id => !workers.has(id)),
            done: () => { stack = 0; handedIn.clear() },
          },
        })
        return
      }
      case 'denied': {
        const last = workers.get(lastOf.get(cmd.sessionId))
        const worker = last?.present && !last.queue.some(job => job.act?.leave) ? last : manager
        worker.queue.push({ spot: null, act: { pose: 'shake', dur: 1.4, label: 'Blocked', bubble: bad('✗') } })
        return
      }
      case 'prompt':
        ceo.bubble = { text: 'New request', kind: 'info', until: clock + 2.5 }
        return
    }
  }

  // someone sharing a desk or seat stands beside whoever is already there
  const OFFSETS = [[0, 0], [0.3, 0], [-0.3, 0], [0, 0.28], [0.3, 0.28], [-0.3, 0.28], [0, -0.28]]
  const onSpot = (w, spot) => spot && w.x === spot.x && w.y === spot.y
  const shift = w => {
    const slot = onSpot(w, spots.desks[w.desk]) ? w.deskSlot : onSpot(w, spots.seats[w.seat]) ? w.seatSlot : 0
    return OFFSETS[slot % OFFSETS.length]
  }

  const snapshot = () => ({
    clock,
    stack,
    ceo: { papers: ceo.papers, bubble: ceo.bubble && { text: ceo.bubble.text, kind: ceo.bubble.kind } },
    workers: [...workers.values()]
      .filter(w => w.present)
      .map(w => {
        const [dx, dy] = shift(w)
        return { id: w.id, name: w.name, color: w.color, kind: w.kind, x: w.x + dx, y: w.y + dy, pose: w.pose, facing: w.facing, bubble: w.bubble, label: w.label, carry: w.carry }
      }),
  })

  return { apply, tick, snapshot, isIdle, skip, setPaused }
}
