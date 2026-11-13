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
const STAIR_SIDE = 8 // extra cost of a step on the side of a stair, beside its handrail: people keep to the middle
const EXTRA_STAYS = 30 // seconds someone brought in for a busy spell is kept with nothing to do before going home

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

// `breaks: false` keeps free workers where they are (the tests that are not about their daily life use it)
export const createStage = ({ layout, getMult = () => 1, breaks = true }) => {
  const { grid, spots } = layout
  // the sides of each stair (the first and last column of a flight three wide or more) cost more to walk on
  const stairSides = new Set()
  for (const room of layout.rooms ?? [])
    if (room.level === 'stairs' && room.w >= 3) for (let y = room.y; y < room.y + room.h; y++) for (const x of [room.x, room.x + room.w - 1]) stairSides.add(`${x},${y}`)
  // each trip is a little different from the shortest way (and the same one for the same worker and trip), and keeps off the sides of the stairs
  const routeOptions = worker => ({ cost: (x, y) => (stairSides.has(`${x},${y}`) ? STAIR_SIDE : 0), seed: hashOf(`${worker.id}|${worker.trips++}`) })
  const workers = new Map() // id -> worker (the managers too)
  // which way each seat faces, by place; a seat with no entry faces the room
  const faceAt = new Map([...spots.desks, ...spots.seats, ...(spots.huddle ?? []), ...spots.managers.map(m => m.seat), spots.ceoSeat].filter(s => s.face).map(s => [`${s.x},${s.y}`, s.face]))
  // The people of each chat: a manager (with a desk and a tray of their own) and a team who live in the office.
  // A lane of work (the director's `hire`) is given to one of the team, who has it until the lane is ended.
  const managers = new Map() // chat -> its manager
  const teams = new Map() // chat -> { residents: the team, spare: who can still be brought in when it is busy }
  const lanes = new Map() // lane id -> the person doing it
  const handedIn = new Map() // lane id -> chat, for work that is on a manager's tray
  const phases = new Map() // chat -> what it is doing: 'chat', 'working', 'planning' or 'waiting' (see director.js)
  const meetingEnd = new Map() // chat -> when a meeting the CEO called is over (a chat that is planning has one until it stops)
  const answered = new Set() // chats whose permission has been answered
  const compacted = new Set() // chats whose memory has been compacted
  const lastOf = new Map() // chat -> the worker last given something to do
  const deskOwner = Array(spots.desks.length).fill(null)
  const seatOwner = Array(spots.seats.length).fill(null)
  const ceo = { bubble: null, papers: 0 }
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
    quiet: 0, breakAfter: 0.5 + ((hashOf(info.id) >>> 20) % 25) / 10, turns: 0, trips: 0, // free: seconds with nothing to do, how many before the next thing to do
    lane: null, unboundFor: 0, resident: false, extra: false, retiring: false, stack: 0, // work: which lane they hold, for how long they have had none, whether they live here or came in for a busy spell
    ...personality(info.id), rank: hashOf(info.id), ...info, info, // the lower rank gives way (see walk)
  })

  // the manager of a chat sits at a desk of their own, with a tray (a fourth chat shares the first desk)
  const managerOf = sessionId => managers.get(sessionId)
  const addManager = (info, sessionId) => {
    const post = spots.managers[managers.size % spots.managers.length]
    const manager = makeWorker(info, post.seat.x, post.seat.y, true)
    manager.post = post
    workers.set(manager.id, manager)
    managers.set(sessionId, manager)
  }

  // the CEO is a person like the rest: at his desk at first, and then (see ceoAmbient) now and then up and about
  const ceoPerson = makeWorker({ id: 'ceo', name: 'CEO', color: '#264653', kind: 'manager', sessionId: null }, spots.ceoSeat.x, spots.ceoSeat.y, true)
  ceoPerson.breakAfter = 20
  workers.set(ceoPerson.id, ceoPerson)
  const ceoSeatJob = () => ({ brk: true, spot: () => spots.ceoSeat, act: { pose: 'sit', dur: 1, brk: true, rest: 'sit' } })
  ceoPerson.queue.push(ceoSeatJob())

  // someone who lives in the office: at their desk at once, or (when brought in for a busy spell) walking in
  const addResident = (team, info, arriving) => {
    const worker = makeWorker(info, spots.entrance.x, spots.entrance.y, !arriving)
    worker.resident = true
    worker.extra = arriving
    if (arriving) {
      worker.enterAt = Math.max(clock, lastArrival + ENTER_GAP)
      lastArrival = worker.enterAt
    } else {
      const desk = deskOf(worker)
      worker.x = desk.x
      worker.y = desk.y
      worker.arriving = false
    }
    workers.set(worker.id, worker)
    team.residents.add(worker)
    startAmbient(worker)
    return worker
  }

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
  const homeOf = worker => (worker.kind === 'manager' ? worker.post.seat : seatOf(worker))
  // where a worker hands work in: the tray of their chat's manager
  const trayOf = worker => managerOf(worker.sessionId)?.post ?? spots.managers[0]

  // a chair at the meeting room's table that nobody else is heading for (or the first, when all are taken)
  const huddleSpot = worker => {
    const taken = new Set([...workers.values()].filter(w => w !== worker && w.present && w.goal).map(w => `${w.goal[0]},${w.goal[1]}`))
    return spots.huddle.find(h => !taken.has(`${h.x},${h.y}`)) ?? spots.huddle[0]
  }

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
      {
        spot: () => placeAt(trayOf(worker).handIn, worker),
        act: {
          pose: 'give', dur: 0.8, label: 'Handing in', carry: null,
          done: () => {
            handedIn.set(worker.lane ?? worker.id, worker.sessionId)
            const manager = managerOf(worker.sessionId)
            if (manager) manager.stack++
            emit('ring', trayOf(worker).handIn.x, trayOf(worker).handIn.y, { tone: 'ok' })
          },
        },
      },
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
      case 'huddle': // planning, or the todo list: a chair at the meeting room's table, until the tool is over
        return [{ spot: () => huddleSpot(worker), act: { pose: 'sit', dur: 1.5, label: cmd.label ?? 'Planning', ...waitsForNext } }]
      case 'planned':
        return [{ spot: null, act: { pose: 'cheer', dur: 1, label: 'Plan ready', bubble: ok('✓') } }]
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
    if (worker.lane) lanes.delete(worker.lane)
    if (worker.kind === 'manager' && managers.get(worker.sessionId) === worker) managers.delete(worker.sessionId)
    const team = teams.get(worker.sessionId)
    if (worker.extra && team) {
      team.residents.delete(worker) // someone brought in for a busy spell can be brought in again
      team.spare.push(worker.info)
    }
  }

  // the lane's work is done: its worker is free again
  const release = worker => {
    lanes.delete(worker.lane)
    worker.lane = null
    worker.carry = null
    worker.unboundFor = 0
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
    worker.rest = act.rest ?? null
    worker.pose = worker.rest ?? 'idle'
    act.done?.()
    if (act.leave) remove(worker)
  }

  const startNext = worker => {
    for (;;) {
      if (worker.queue.length === 0) {
        worker.pose = worker.rest ?? 'idle'
        worker.warm = false
        return
      }
      // a new job after a quiet moment: a short pause to take it in, first
      if (!worker.warm) {
        worker.warm = true
        if (!isInstant() && !worker.queue[0].brk) {
          worker.pose = 'idle'
          worker.wait = { left: worker.react, then: () => startNext(worker) }
          return
        }
      }
      const job = worker.queue.shift()
      if (job.skipIf?.()) continue
      job.onStart?.()
      worker.rest = null
      if (job.carryNow !== undefined) worker.carry = job.carryNow
      worker.pending = job.act
      const spot = typeof job.spot === 'function' ? job.spot() : job.spot
      worker.goal = spot ? [spot.x, spot.y] : null // where they are going to be, which others choose round
      if (!spot) return begin(worker)
      const path = isInstant() ? null : findPath(grid, [Math.round(worker.x), Math.round(worker.y)], [spot.x, spot.y], undefined, routeOptions(worker))
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
    const path = findPath(grid, here, goal, avoid, routeOptions(worker))
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

  // Real work, as against what someone does when they are free (a job with `brk`).
  const hasWork = worker => worker.queue.some(job => !job.brk)
  const isBusy = worker => hasWork(worker) || (worker.act && !worker.act.brk) || (worker.pending && !worker.pending.brk)

  // What someone does when they are free, one thing after another. How it goes depends on what their chat is doing: while
  // it is working they are mostly at their desks and on trips to the file room, the server room and the test lab; while it
  // waits for the person they linger, and many go out of the building. Each is [desk, trip, break] as a share of 100, and
  // the rest go outside. Any work that arrives ends it at once, wherever the worker is.
  const MIX = { chat: [60, 65, 90], working: [35, 75, 90], planning: [60, 65, 90], waiting: [20, 25, 60] }
  const phaseOf = sessionId => phases.get(sessionId) ?? 'chat'
  const choose = (list, n) => (list?.length ? list[n % list.length] : null)
  let breakTurn = 0
  const startAmbient = worker => {
    const roll = hashOf(`${worker.id}|${worker.turns++}`)
    const [desk, trip, rest] = MIX[phaseOf(worker.sessionId)] ?? MIX.chat
    const share = (roll >>> 4) % 100
    const more = roll >>> 12
    worker.quiet = 0
    const job = { brk: true, skipIf: () => hasWork(worker) }
    const go = (spot, act) => worker.queue.push({ ...job, spot: () => placeAt(spot, worker), act: { ...act, brk: true } })
    const outside = choose(spots.outside, more)
    const abroad = [
      [choose(spots.files, more), { pose: 'grab', dur: 2 + (more % 3), label: 'Filing' }],
      [choose(spots.server, more), { pose: 'scan', dur: 3 + (more % 3), label: 'Checking servers' }],
      [choose(spots.lab, more), { pose: 'machine', dur: 3 + (more % 3), label: 'Testing' }],
    ].filter(([spot]) => spot)
    if (share < desk || !spots.breaks?.length) {
      worker.queue.push({ ...job, spot: () => deskOf(worker), act: { pose: 'type', dur: 8 + (more % 13), brk: true, rest: 'sit' } }) // and sits at the desk until the next thing
    } else if (share < trip && abroad.length > 0) {
      const [spot, act] = abroad[more % abroad.length]
      go(spot, act)
    } else if (share < rest || !outside) {
      const spot = spots.breaks[(hashOf(worker.id) + breakTurn++) % spots.breaks.length]
      go(spot, { pose: 'idle', dur: 6 + (more % 7), label: spot.label })
    } else {
      go(outside, { pose: 'idle', dur: 8 + (more % 7), label: outside.label })
    }
  }

  // work for someone on their way to something of their own: they turn round where they are
  const interrupt = worker => {
    if (worker.pending?.brk) {
      worker.cells = []
      worker.pending = null
      worker.pose = 'idle'
      worker.rest = null
      worker.v = 0
    }
  }

  // sends someone out through the front door, once what they have to do is done
  const sendOut = worker => {
    worker.retiring = true
    interrupt(worker)
    worker.queue.push({ spot: () => spots.entrance, act: { dur: 0, leave: true } })
  }

  // Someone drops what they are doing (their own things, not real work) and goes to the meeting room's table, and stays
  // until the meeting is over. A manager, or the CEO, goes back to their desk after.
  const redirect = worker => {
    worker.queue = worker.queue.filter(job => !job.brk)
    interrupt(worker)
    if (worker.act?.brk && !worker.act.until) worker.act.dur = 0
  }
  const inMeeting = sessionId => phaseOf(sessionId) === 'planning' || (meetingEnd.get(sessionId) ?? -1) > clock
  const joinMeeting = (worker, sessionId) => {
    worker.meeting = sessionId
    redirect(worker)
    worker.queue.push({
      brk: true,
      skipIf: () => {
        const over = !inMeeting(sessionId)
        if (over) worker.meeting = null
        return over
      },
      spot: () => huddleSpot(worker),
      act: { pose: 'sit', dur: 1, label: phaseOf(sessionId) === 'planning' ? 'Planning' : 'Meeting', brk: true, until: () => !inMeeting(sessionId), done: () => { worker.meeting = null } },
    })
    if (worker === ceoPerson) worker.queue.push(ceoSeatJob())
    else if (worker.kind === 'manager') worker.queue.push({ brk: true, skipIf: () => hasWork(worker), spot: () => worker.post.seat, act: { pose: 'sit', dur: 0.3, brk: true } })
  }
  // the manager and up to four of the team who are free sit down at the table
  const gather = sessionId => {
    const team = teams.get(sessionId)
    const free = team ? [...team.residents].filter(w => !w.lane && !w.retiring && !w.meeting).slice(0, 4) : []
    for (const worker of [managers.get(sessionId), ...free]) if (worker && !worker.meeting) joinMeeting(worker, sessionId)
  }

  // The CEO, now and then, when he has had nothing to do for a while: calls a short meeting about a chat that is talking or
  // waiting (and the manager and some of the team come), walks round checking on the team, or stays at his desk.
  const ceoAmbient = () => {
    ceoPerson.quiet = 0
    ceoPerson.breakAfter = 20 + (hashOf(`ceo|${ceoPerson.turns++}`) % 30)
    const sessions = [...teams.keys()]
    if (sessions.length === 0) return
    const roll = hashOf(`ceo|${ceoPerson.turns}|roll`) % 100
    const talking = sessions.filter(id => ['chat', 'waiting'].includes(phaseOf(id)) && !inMeeting(id))
    if (roll < 30 && talking.length > 0) {
      const sessionId = talking[hashOf(`ceo|${ceoPerson.turns}|chat`) % talking.length]
      meetingEnd.set(sessionId, clock + 20 + (hashOf(`ceo|${ceoPerson.turns}|long`) % 16))
      gather(sessionId)
      joinMeeting(ceoPerson, sessionId)
    } else if (roll < 75) {
      const stops = [...(spots.rounds ?? []), ...[...managers.values()].map(m => ({ ...m.post.handIn, label: 'Checking in' }))]
      if (stops.length === 0) return
      const h = hashOf(`ceo|${ceoPerson.turns}|stops`)
      const two = [stops[h % stops.length], stops[(h >>> 8) % stops.length]]
      for (const stop of new Set(two)) ceoPerson.queue.push({ brk: true, spot: () => placeAt(stop, ceoPerson), act: { pose: 'idle', dur: 3 + (h % 3), label: stop.label, brk: true } })
      ceoPerson.queue.push(ceoSeatJob())
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
    // nothing to do for a moment: something of their own (see startAmbient)
    const free = worker.queue.length === 0 && !worker.act && worker.cells.length === 0 && !worker.pending && !worker.wait
    worker.quiet = free ? worker.quiet + dt : 0
    if (free && breaks && !instant && !worker.retiring && worker.quiet >= worker.breakAfter) {
      if (worker.kind === 'worker') startAmbient(worker)
      else if (worker === ceoPerson) ceoAmbient()
    }
    // someone brought in for a busy spell goes home once there has been nothing for them for a while
    worker.unboundFor = worker.lane ? 0 : worker.unboundFor + dt
    if (worker.extra && !worker.retiring && !instant && worker.unboundFor >= EXTRA_STAYS) sendOut(worker)
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

  // someone busy with their own things is idle: that never keeps the Office from being quiet
  const isIdle = () => [...workers.values()].every(w => w.present && !isBusy(w))

  // a long line of work makes everyone hurry a little
  const rush = () => {
    let waiting = 0
    for (const w of workers.values()) waiting += w.queue.filter(job => !job.brk).length
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
      case 'team': {
        // a chat is here: its manager and team are in the office already, at their desks
        if (teams.has(cmd.sessionId)) return
        addManager(cmd.manager, cmd.sessionId)
        const team = { residents: new Set(), spare: [...cmd.reserve] }
        teams.set(cmd.sessionId, team)
        for (const info of cmd.workers) addResident(team, info, false)
        return
      }
      case 'phase': {
        // what the chat is doing now: plan mode brings the manager, some of the team and the CEO to the meeting table
        phases.set(cmd.sessionId, cmd.phase)
        if (cmd.phase === 'planning') {
          gather(cmd.sessionId)
          joinMeeting(ceoPerson, cmd.sessionId)
        }
        return
      }
      case 'leave': {
        // the chat has gone for good: its manager, team and helpers all walk out
        teams.delete(cmd.sessionId)
        phases.delete(cmd.sessionId)
        meetingEnd.delete(cmd.sessionId)
        for (const worker of [...workers.values()]) if (worker.sessionId === cmd.sessionId) sendOut(worker)
        return
      }
      case 'hire': {
        const { worker: info } = cmd
        if (lanes.has(info.id) || workers.has(info.id)) return
        const team = teams.get(info.sessionId)
        let worker = null
        if (info.kind === 'worker' && team) {
          // the one who has been free longest; if all are busy, someone more is brought in for the busy spell
          const free = [...team.residents].filter(w => !w.lane && !w.retiring).sort((a, b) => (a.meeting ? 1 : 0) - (b.meeting ? 1 : 0) || b.unboundFor - a.unboundFor)
          worker = free[0] ?? (team.spare.length > 0 ? addResident(team, team.spare.pop(), true) : null)
        }
        if (!worker) {
          // a helper, or more work than the whole team can take: a new person walks in for it
          worker = makeWorker(info, spots.entrance.x, spots.entrance.y, false)
          worker.enterAt = Math.max(clock, lastArrival + ENTER_GAP)
          lastArrival = worker.enterAt
          workers.set(worker.id, worker)
        }
        worker.lane = info.id
        worker.unboundFor = 0
        lanes.set(info.id, worker)
        lastOf.set(worker.sessionId, worker.id)
        return
      }
      case 'do': {
        const worker = lanes.get(cmd.worker)
        if (!worker) return
        interrupt(worker)
        worker.queue.push(...jobs(worker, cmd))
        lastOf.set(worker.sessionId, worker.id)
        return
      }
      case 'fire': {
        // a lane is over: whoever did it is free again (but a helper or someone only taken on for it goes home)
        const worker = lanes.get(cmd.worker)
        if (!worker) return
        interrupt(worker)
        if (worker.resident) worker.queue.push({ spot: null, act: { dur: 0, done: () => release(worker) } })
        else sendOut(worker)
        return
      }
      case 'review': {
        const manager = managerOf(cmd.sessionId)
        if (!manager) return
        const delivered = () => cmd.workers.every(id => handedIn.has(id) || !lanes.has(id))
        manager.queue.push({ spot: () => manager.post.seat, act: { pose: 'review', dur: 2.5, label: 'Reviewing', until: delivered } })
        return
      }
      case 'submit': {
        const manager = managerOf(cmd.sessionId)
        if (!manager) return
        manager.queue.push(
          {
            carryNow: 'papers',
            spot: () => spots.ceoDelivery,
            act: {
              pose: 'give', dur: 1.2, label: 'Submitting', carry: null, bubble: ok('✓'),
              done: () => {
                ceo.papers += manager.stack
                emit('confetti', spots.ceoSeat.x, spots.ceoSeat.y)
                manager.stack = 0
                ceo.bubble = { text: 'Received', kind: 'ok', until: clock + 2.5 }
              },
            },
          },
          { spot: () => manager.post.seat, act: { pose: 'idle', dur: 0.4 } },
        )
        return
      }
      case 'ask': {
        answered.delete(cmd.sessionId)
        const asker = workers.get(lastOf.get(cmd.sessionId))
        const worker = asker?.present && !asker.retiring ? asker : managerOf(cmd.sessionId)
        if (!worker) return
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
      case 'fail': {
        const manager = managerOf(cmd.sessionId)
        manager?.queue.push({ spot: () => manager.post.seat, act: { pose: 'shake', dur: 2.5, label: cmd.label, bubble: bad('!') } })
        return
      }
      case 'compact': {
        // the manager tidies the notes in the file room until the compaction is over
        const manager = managerOf(cmd.sessionId)
        if (!manager) return
        compacted.delete(cmd.sessionId)
        let started = false
        manager.queue.push(
          {
            skipIf: () => compacted.has(cmd.sessionId),
            onStart: () => { started = true },
            spot: () => shelfFor(null),
            act: { pose: 'scan', dur: 1.5, label: 'Compacting memory', bubble: { text: '…', kind: 'info' }, until: () => compacted.has(cmd.sessionId) },
          },
          { skipIf: () => !started, spot: () => manager.post.seat, act: { pose: 'sit', dur: 0.3 } },
        )
        return
      }
      case 'compacted':
        compacted.add(cmd.sessionId)
        return
      case 'note': // a few words over the CEO or the manager
        if (cmd.who === 'ceo') ceo.bubble = { text: cmd.text, kind: cmd.kind, until: clock + 2.5 }
        else managerOf(cmd.sessionId)?.queue.push({ spot: null, act: { pose: 'idle', dur: 1.6, label: cmd.text, bubble: { text: '•', kind: cmd.kind } } })
        return
      case 'memo':
        managerOf(cmd.sessionId)?.queue.push({ spot: null, act: { pose: 'read', dur: 1.2, label: 'Reading a memo' } })
        return
      case 'clear': {
        // /clear: once everyone who was working has stopped, what is on the tray is swept away
        const manager = managerOf(cmd.sessionId)
        if (!manager) return
        manager.queue.push({
          spot: null,
          act: {
            pose: 'idle', dur: 1, label: 'Fresh start', until: () => [...lanes.values()].every(w => w.sessionId !== cmd.sessionId),
            done: () => {
              manager.stack = 0
              for (const [id, session] of handedIn) if (session === cmd.sessionId) handedIn.delete(id)
            },
          },
        })
        return
      }
      case 'denied': {
        const last = workers.get(lastOf.get(cmd.sessionId))
        const worker = last?.present && !last.retiring ? last : managerOf(cmd.sessionId)
        worker?.queue.push({ spot: null, act: { pose: 'shake', dur: 1.4, label: 'Blocked', bubble: bad('✗') } })
        return
      }
      case 'celebrate': {
        // a commit or a push went through: whoever of the team is free cheers, the CEO says so, and there is confetti (more for a push)
        const label = cmd.what === 'push' ? 'Pushed!' : 'Committed!'
        const team = teams.get(cmd.sessionId)
        const cheering = [managerOf(cmd.sessionId), ...(team ? team.residents : [])].filter(w => w?.present && !w.retiring && !isBusy(w))
        for (const worker of cheering) {
          redirect(worker)
          worker.queue.push({ brk: true, spot: null, act: { pose: 'cheer', dur: 2.5, label, bubble: ok('✓'), brk: true } })
        }
        ceo.bubble = { text: label, kind: 'ok', until: clock + 3 }
        for (const worker of cheering.slice(0, cmd.what === 'push' ? 6 : 1)) emit('confetti', worker.x, worker.y)
        return
      }
      case 'prompt':
        ceo.bubble = { text: 'New request', kind: 'info', until: clock + 2.5 }
        emit('ring', ceoPerson.x, ceoPerson.y, { tone: 'info' })
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

  const personOf = w => {
    const [dx, dy] = shift(w)
    return { id: w.id, name: w.name, color: w.color, kind: w.kind, x: w.x + dx, y: w.y + dy, pose: w.pose, facing: w.facing, dir: w.dir, sessionId: w.sessionId, bubble: w.bubble, label: w.label, carry: w.carry }
  }

  // the CEO is told apart from the rest: he is one person, whose bubble is what the Office says to him
  const snapshot = () => ({
    clock,
    stack: [...managers.values()].reduce((total, m) => total + m.stack, 0),
    trays: [...managers.values()].map(m => ({ x: m.post.tray.x, y: m.post.tray.y, count: m.stack })),
    ceo: { ...personOf(ceoPerson), papers: ceo.papers, bubble: ceo.bubble && { text: ceo.bubble.text, kind: ceo.bubble.kind }, label: ceoPerson.label || (ceo.papers > 0 ? `${ceo.papers} approved` : '') },
    workers: [...workers.values()].filter(w => w.present && w !== ceoPerson).map(personOf),
  })

  // what has happened since the last call, for the Office to show
  const takeEffects = () => effects.splice(0)

  // how many of a chat's team are on a lane of work, and how many there are (not counting the manager)
  const teamOf = sessionId => {
    const people = [...workers.values()].filter(w => w.sessionId === sessionId && w.kind !== 'manager' && w.present)
    return { busy: people.filter(w => w.lane).length, size: people.length }
  }

  return { apply, tick, snapshot, isIdle, skip, setPaused, takeEffects, teamOf }
}
