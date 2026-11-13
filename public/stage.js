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
const ACCEL = 14 // tiles a second, each second: people do not start at full speed
const DECEL = 6 // and slow down for the last stretch
const MIN_SPEED = 0.7
const ARRIVING = 1.5 // how much faster someone new walks on the long first trip, from the gate to where they work
const REROUTE = 0.5 // seconds waiting for someone in the way before going round
const STUCK = 4 // seconds before someone who cannot get round is walked through
const GHOST = 2 // seconds of walking through people, once stuck
const ENTER_GAP = 0.4 // seconds between two arrivals
const STEP = 0.1 // simulated seconds per step; longer gaps use fewer, bigger steps
const MAX_CATCH_UP = 120 // simulated seconds a long gap is allowed to cover
const INSTANT_STEPS = 200 // at instant speed: how many steps a tick may take

// poses at a desk or a seat: the person faces the viewer
const FACES_YOU = new Set(['sit', 'type', 'read', 'review'])

const baseName = path => String(path ?? '').split(/[\\/]/).filter(Boolean).pop() ?? ''

// Everyone is a little different, and always the same: how fast they walk, how
// long they take to react to a new job, how long they settle after arriving.
const hashOf = text => {
  let h = 2166136261
  for (const ch of String(text)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return h >>> 0
}
export const personality = id => {
  const h = hashOf(id)
  return { speed: 0.85 + (h % 36) / 100, react: 0.15 + ((h >>> 8) % 41) / 100, settle: 0.2 + ((h >>> 16) % 26) / 100 }
}

// `breaks: false` keeps idle workers where they are (the tests that are not about breaks use it)
export const createStage = ({ layout, getMult = () => 1, breaks = true }) => {
  const { grid, spots } = layout
  const workers = new Map() // id -> worker (the manager too)
  // which way each seat faces, by place; a seat with no entry faces the room
  const faceAt = new Map([...spots.desks, ...spots.seats, spots.managerSeat].filter(s => s.face).map(s => [`${s.x},${s.y}`, s.face]))
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
  const effects = [] // what the Office should show for a moment: confetti, a warning, a ring
  let labTurn = 0
  let shelfTurn = 0

  const makeWorker = (info, x, y, present) => ({
    queue: [], cells: [], pending: null, act: null,
    pose: 'idle', facing: 1, dir: 'down', bubble: null, label: '', carry: null,
    desk: -1, seat: -1, deskSlot: 0, seatSlot: 0, enterAt: 0, present, x, y,
    wait: null, // { left, then }: a moment of hesitating or settling, then carry on
    warm: false, // already busy, so the next job is started without hesitating
    v: 0, stall: 0, ghost: 0, rerouted: false, // walking: speed, time held up, time walking through people
    arriving: true, // the first trip, from the gate, is the long one: faster
    quiet: 0, breakAfter: 10 + ((hashOf(info.id) >>> 20) % 11), onBreak: false, // idle: seconds with nothing to do, how many before a break
    ...personality(info.id), rank: hashOf(info.id), ...info, // the lower rank gives way (see walk)
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

  // A place at a spot that several people may come to at once (the tray, the CEO's door, the front door): the spot
  // itself for the first, then the nearest free cell within two steps of it, so a crowd stands round it, not on it.
  const placeAt = (spot, worker) => {
    const taken = new Set([...workers.values()].filter(w => w !== worker && w.present && w.goal).map(w => `${w.goal[0]},${w.goal[1]}`))
    const seen = new Set([`${spot.x},${spot.y}`])
    const ring = [[spot.x, spot.y]]
    for (let head = 0; head < ring.length; head++) {
      const [x, y] = ring[head]
      if (Math.abs(x - spot.x) + Math.abs(y - spot.y) >= 2) continue
      for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) {
        const [nx, ny] = [x + dx, y + dy]
        if (seen.has(`${nx},${ny}`) || grid[ny]?.[nx] === undefined || grid[ny][nx] === '#') continue
        seen.add(`${nx},${ny}`)
        ring.push([nx, ny])
      }
    }
    const [x, y] = ring.find(([cx, cy]) => !taken.has(`${cx},${cy}`)) ?? ring[0]
    return { x, y }
  }

  // at instant speed nothing is happening in view, so there is nothing to show
  const emit = (kind, x, y, extra) => {
    if (!isInstant()) effects.push({ kind, x, y, ...extra })
  }

  const ok = text => ({ text, kind: 'ok' })
  const bad = text => ({ text, kind: 'bad' })

  // what a step means for a worker: a list of jobs
  const jobs = (worker, cmd) => {
    const file = baseName(cmd.path ?? worker.path)
    const waitsForNext = { until: () => worker.queue.length > 0 }
    const handIn = [
      { spot: () => placeAt(spots.handIn, worker), act: { pose: 'give', dur: 0.8, label: 'Handing in', carry: null, done: () => { handedIn.add(worker.id); stack++; emit('ring', spots.handIn.x, spots.handIn.y, { tone: 'ok' }) } } },
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
        return worker.kind === 'subagent' ? handIn : [{ spot: null, act: { pose: 'cheer', dur: 1, label: 'Found it', bubble: ok('✓') } }]
      case 'reject':
        return [{ spot: null, act: { pose: 'shake', dur: 1.4, label: 'Edit not applied', bubble: bad('✗'), carry: null } }]
      case 'test':
        return [{ spot: () => spots.lab[labTurn++ % spots.lab.length], act: { pose: 'machine', dur: 1.5, label: 'Running tests', ...waitsForNext } }]
      case 'search':
        return [{ spot: () => shelfFor(null), act: { pose: 'scan', dur: 1.2, label: cmd.label ?? 'Searching', ...waitsForNext } }]
      case 'call': // an MCP tool: out by the front door, waiting for the answer
        return [{ spot: () => placeAt(spots.entrance, worker), act: { pose: 'scan', dur: 1.2, label: cmd.label ?? (cmd.server ? `Calling ${cmd.server}` : 'Calling a tool'), ...waitsForNext } }]
      case 'unavailable':
        return [{ spot: null, act: { pose: 'shake', dur: 1.5, label: 'Tool unavailable', bubble: bad('✗') } }]
      case 'pass':
        return [{ spot: null, act: { pose: 'cheer', dur: 1.2, label: 'Passed', bubble: ok('✓') } }]
      case 'fail':
        return [{ spot: null, act: { pose: 'shake', dur: 1.5, label: 'Failed', bubble: bad('✗') } }]
      default:
        return []
    }
  }

  const remove = worker => {
    worker.removed = true
    worker.wait = null
    workers.delete(worker.id)
    for (const owners of [deskOwner, seatOwner]) owners.forEach((id, i) => id === worker.id && (owners[i] = null))
  }

  // a job's act begins: the worker is where it should be
  const begin = worker => {
    const act = { ...worker.pending, t: 0 }
    worker.pending = null
    worker.act = act
    worker.pose = act.pose ?? 'idle'
    if (FACES_YOU.has(act.pose)) {
      worker.dir = faceAt.get(`${Math.round(worker.x)},${Math.round(worker.y)}`) ?? 'down' // sitting at a desk or a seat, they face the way it faces
      if (worker.dir === 'left' || worker.dir === 'right') worker.facing = worker.dir === 'left' ? -1 : 1 // and the side view is turned to match
    }
    worker.label = act.label ?? ''
    worker.bubble = act.bubble ?? null
    if (act.bubble?.kind === 'bad') emit('warning', worker.x, worker.y) // something went wrong
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
      if (worker.queue.length === 0) {
        worker.pose = 'idle'
        worker.warm = false
        return
      }
      // a new job after a quiet moment: a short pause to take it in, first
      if (!worker.warm) {
        worker.warm = true
        if (!isInstant()) {
          worker.pose = 'idle'
          worker.wait = { left: worker.react, then: () => startNext(worker) }
          return
        }
      }
      const job = worker.queue.shift()
      if (job.skipIf?.()) continue
      if (!job.brk) worker.onBreak = false
      job.onStart?.()
      if (job.carryNow !== undefined) worker.carry = job.carryNow
      worker.pending = job.act
      const spot = typeof job.spot === 'function' ? job.spot() : job.spot
      worker.goal = spot ? [spot.x, spot.y] : null // where they are going to be, which others choose round
      if (!spot) return begin(worker)
      const path = isInstant() ? null : findPath(grid, [Math.round(worker.x), Math.round(worker.y)], [spot.x, spot.y])
      if (path && path.length > 0) {
        worker.cells = path
        worker.pose = 'walk'
        face(worker, path[0][0] - worker.x, path[0][1] - worker.y) // turns to the first step at once
        worker.v = 0
        worker.stall = 0
        worker.rerouted = false
      } else {
        worker.x = spot.x // already there, or (instant speed) straight there
        worker.y = spot.y
        begin(worker)
      }
      return
    }
  }

  // which way they face, as pixel-agent-desk does it: by the larger part of the step
  const face = (worker, dx, dy) => {
    if (dx !== 0) worker.facing = Math.sign(dx)
    if (Math.abs(dx) > Math.abs(dy)) worker.dir = dx > 0 ? 'right' : 'left'
    else if (dy !== 0) worker.dir = dy > 0 ? 'down' : 'up'
  }

  // someone is in the way: go round them, by a new path that leaves out their cells and the next few cells of any
  // of them who is walking, so the way round does not cross where they are going
  const reroute = (worker, occupied, held) => {
    const goal = worker.cells.at(-1)
    const here = [Math.round(worker.x), Math.round(worker.y)]
    const avoid = new Set(occupied.keys())
    for (const other of held) for (const [x, y] of other.cells.slice(0, 3)) avoid.add(`${x},${y}`)
    avoid.delete(`${here[0]},${here[1]}`)
    avoid.delete(`${goal[0]},${goal[1]}`)
    const path = findPath(grid, here, goal, avoid)
    if (path && path.length > 0) worker.cells = path
  }

  // Walking: up to speed and down again, and never into someone else's cell.
  // In the way: wait a moment, go round, and if that cannot be done for a few
  // seconds, walk through them for a while rather than stand there for good.
  // Of two walkers in each other's way only one goes round: the one with the lower rank. The
  // other waits for the way to clear, so they never both dodge the same way and meet again.
  const walk = (worker, dt, occupied) => {
    // who is in the next cell, which is not the last?
    const holdingUp = () => {
      if (worker.cells.length <= 1) return []
      const [nx, ny] = worker.cells[0]
      return (occupied.get(`${nx},${ny}`) ?? []).filter(other => other !== worker)
    }
    const isBlocked = () => holdingUp().length > 0
    if (worker.ghost > 0) worker.ghost -= dt
    else if (isBlocked()) {
      const held = holdingUp()
      const allWalking = held.every(other => other.cells.length > 0)
      worker.v = 0
      worker.stall += dt
      worker.pose = worker.stall > 0.25 ? 'idle' : 'walk' // a very short hold-up is not a stop, which would look like stuttering
      // goes round: held up by someone standing still, or by walkers who all rank higher
      if (worker.stall >= REROUTE && !worker.rerouted && (!allWalking || held.every(other => other.rank > worker.rank))) {
        worker.rerouted = true
        reroute(worker, occupied, held)
      }
      if (worker.stall >= (allWalking ? STUCK / 2 : STUCK)) {
        worker.ghost = GHOST
        worker.stall = 0
        worker.rerouted = false
      }
      return
    }
    worker.stall = 0
    worker.rerouted = false
    worker.pose = 'walk'

    let left = 0
    let [px, py] = [worker.x, worker.y]
    for (const [cx, cy] of worker.cells) {
      left += Math.abs(cx - px) + Math.abs(cy - py)
      ;[px, py] = [cx, cy]
    }
    const target = Math.min(WALK * worker.speed * (worker.arriving ? ARRIVING : 1), MIN_SPEED + Math.sqrt(2 * DECEL * left))
    worker.v = Math.max(MIN_SPEED, worker.v < target ? Math.min(target, worker.v + ACCEL * dt) : Math.max(target, worker.v - DECEL * 2 * dt))

    let distance = worker.v * dt
    while (distance > 0 && worker.cells.length > 0) {
      const [tx, ty] = worker.cells[0]
      const dx = tx - worker.x
      const dy = ty - worker.y
      const gap = Math.hypot(dx, dy)
      face(worker, dx, dy)
      if (gap <= distance) {
        worker.x = tx
        worker.y = ty
        worker.cells.shift()
        // at the edge of a cell someone else is standing in: stop here, not halfway into it
        distance = worker.cells.length > 0 && worker.ghost <= 0 && isBlocked() ? 0 : distance - gap
      } else {
        worker.x += (dx / gap) * distance
        worker.y += (dy / gap) * distance
        distance = 0
      }
    }
    if (worker.cells.length === 0) arrive(worker)
  }

  // Real work, as against a break (a job with `brk`).
  const hasWork = worker => worker.queue.some(job => !job.brk)

  // A break: walk to a spot for a few seconds (a different one for each, in turn), then back to the desk or seat. Any
  // work that arrives ends it, wherever the worker is.
  let breakTurn = 0
  const startBreak = worker => {
    const spot = spots.breaks?.[(hashOf(worker.id) + breakTurn++) % spots.breaks.length]
    worker.quiet = 0
    if (!spot) return
    const home = worker.desk >= 0 ? spots.desks[worker.desk] : worker.seat >= 0 ? spots.seats[worker.seat] : null
    const duration = 6 + (hashOf(`${worker.id}${Math.floor(clock)}`) % 7)
    worker.queue.push(
      { brk: true, skipIf: () => hasWork(worker), onStart: () => { worker.onBreak = true }, spot: () => placeAt(spot, worker), act: { pose: 'idle', dur: duration, label: spot.label, brk: true } },
      { brk: true, skipIf: () => !worker.onBreak || hasWork(worker), spot: () => home, act: { pose: 'idle', dur: 0.2, done: () => { worker.onBreak = false } } },
    )
  }

  // work for someone on their way to a break: they turn round where they are
  const interrupt = worker => {
    if (worker.pending?.brk) {
      worker.cells = []
      worker.pending = null
      worker.pose = 'idle'
      worker.v = 0
      worker.onBreak = false
    }
  }

  // at the spot: a moment to settle before the job begins
  const arrive = worker => {
    worker.v = 0
    worker.arriving = false
    if (isInstant()) return begin(worker)
    worker.pose = 'idle'
    worker.wait = { left: worker.settle, then: () => begin(worker) }
  }

  const update = (worker, dt, instant, occupied) => {
    if (!worker.present) {
      if (clock < worker.enterAt) return
      worker.present = true
    }
    // nothing to do for a while: a break, to the coffee bar or the vending machines, the hub or the terrace
    const free = worker.queue.length === 0 && !worker.act && worker.cells.length === 0 && !worker.pending && !worker.wait
    worker.quiet = free ? worker.quiet + dt : 0
    if (free && breaks && !instant && worker.kind === 'worker' && worker.quiet >= worker.breakAfter) startBreak(worker)
    if (worker.wait) {
      worker.wait.left -= instant ? Infinity : dt
      if (worker.wait.left > 0) return
      const { then } = worker.wait
      worker.wait = null
      return then()
    }
    if (worker.cells.length > 0) return walk(worker, dt, occupied)
    if (worker.act) {
      if (worker.act.brk && hasWork(worker)) return finish(worker) // a break ends the moment there is work
      worker.act.t += dt
      if (worker.act.t >= (instant ? 0 : worker.act.dur) && (!worker.act.until || worker.act.until())) finish(worker)
      return
    }
    startNext(worker)
  }

  const isInstant = () => skipping || getMult() === 0

  // someone on a break is idle: a break never keeps the Office from being quiet
  const isIdle = () => [...workers.values()].every(w => w.present && !hasWork(w) && (w.onBreak || (w.queue.length === 0 && !w.act && w.cells.length === 0 && !w.pending && !w.wait)))

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
    // who stands in which cell, for walking round each other
    const occupied = new Map()
    for (const w of workers.values()) {
      if (!w.present) continue
      const key = `${Math.round(w.x)},${Math.round(w.y)}`
      occupied.set(key, [...(occupied.get(key) ?? []), w])
    }
    for (const worker of [...workers.values()]) update(worker, dt, instant, occupied)
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
        interrupt(worker)
        worker.queue.push(...jobs(worker, cmd))
        lastOf.set(worker.sessionId, worker.id)
        return
      }
      case 'fire': {
        const worker = workers.get(cmd.worker)
        if (worker) {
          interrupt(worker)
          worker.queue.push({ spot: () => spots.entrance, act: { dur: 0, leave: true } })
        }
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
                emit('confetti', spots.ceoSeat.x, spots.ceoSeat.y)
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
            spot: () => placeAt(spots.ceoDoor, worker),
            act: { pose: 'ask', dur: 0.5, label: cmd.label ?? 'Needs approval', bubble: { text: '?', kind: 'ask' }, until: () => answered.has(cmd.sessionId) },
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
        emit('ring', spots.ceoSeat.x, spots.ceoSeat.y, { tone: 'info' })
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
        return { id: w.id, name: w.name, color: w.color, kind: w.kind, x: w.x + dx, y: w.y + dy, pose: w.pose, facing: w.facing, dir: w.dir, sessionId: w.sessionId, bubble: w.bubble, label: w.label, carry: w.carry }
      }),
  })

  // what has happened since the last call, for the Office to show
  const takeEffects = () => effects.splice(0)

  return { apply, tick, snapshot, isIdle, skip, setPaused, takeEffects }
}
