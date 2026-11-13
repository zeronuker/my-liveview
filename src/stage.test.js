import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildStudio } from '../public/studio.js'
import { createStage, personality } from '../public/stage.js'

const layout = buildStudio()
const at = (p, list) => list.some(s => s.x === Math.round(p.x) && s.y === Math.round(p.y))

// a stage with a clock the test moves by hand, in milliseconds
const setup = (options = {}) => {
  let t = 0
  const stage = createStage({ layout, breaks: false, ...options })
  stage.tick(t)
  // chat 's' has its manager and no team of its own, so a hire is a new person (the tests of teams are further down)
  stage.apply({ cmd: 'team', sessionId: 's', manager: { id: 'manager', name: 'Manager', color: '#8d6e63', kind: 'manager', sessionId: 's' }, workers: [], reserve: [] }, t)
  const run = (seconds, stepMs = 100) => {
    for (let spent = 0; spent < seconds * 1000; spent += stepMs) stage.tick((t += stepMs))
  }
  const settle = (limit = 600) => {
    for (let spent = 0; spent < limit && !stage.isIdle(); spent++) run(1)
  }
  const hire = (id, extra = {}) => stage.apply({ cmd: 'hire', worker: { id, name: id, color: '#fff', kind: 'worker', sessionId: 's', ...extra } }, t)
  const doStep = (worker, step, extra = {}) => stage.apply({ cmd: 'do', worker, step, ...extra }, t)
  const person = id => stage.snapshot().workers.find(w => w.id === id)
  return { stage, run, settle, hire, doStep, person, now: () => t }
}

test('a worker walks in through the front door', () => {
  const { stage, hire, run, person } = setup()
  hire('w1')
  run(0.1)

  assert.deepEqual([person('w1').x, person('w1').y], [layout.spots.entrance.x, layout.spots.entrance.y])
  assert.equal(stage.snapshot().workers.some(w => w.kind === 'manager'), true)
})

test('fetch goes to the file room, study to the lounge, write to a desk', () => {
  const { hire, doStep, settle, person } = setup()
  hire('w1', { path: 'src/a.js' })

  doStep('w1', 'fetch', { path: 'src/a.js' })
  settle()
  assert.ok(at(person('w1'), layout.spots.files))
  assert.equal(person('w1').carry, 'book')

  doStep('w1', 'study')
  settle()
  assert.ok(at(person('w1'), layout.spots.seats))

  doStep('w1', 'write', { path: 'src/a.js', adds: 3, dels: 1 })
  settle()
  assert.ok(at(person('w1'), layout.spots.desks))
})

test('a worker types while writing, and what is being done shows above them', () => {
  const { hire, doStep, run, person } = setup()
  hire('w1', { path: 'src/a.js' })
  doStep('w1', 'write', { path: 'src/a.js', adds: 3, dels: 1 })
  const poses = new Set()
  for (let i = 0; i < 200; i++) {
    run(0.1)
    poses.add(person('w1').pose)
    if (person('w1').pose === 'type') assert.match(person('w1').label, /Writing a\.js/)
  }

  assert.ok(poses.has('walk') && poses.has('type'))
})

test('two workers get two desks; more workers than desks share without trouble', () => {
  const { hire, doStep, settle, person } = setup()
  const ids = Array.from({ length: layout.spots.desks.length + 4 }, (_, i) => `w${i}`)
  for (const id of ids) {
    hire(id)
    doStep(id, 'write', { path: `${id}.js`, adds: 1, dels: 0 })
  }
  settle()
  const desks = ids.map(id => `${Math.round(person(id).x)},${Math.round(person(id).y)}`)

  assert.equal(new Set(desks).size, layout.spots.desks.length)
  for (const id of ids) assert.ok(at(person(id), layout.spots.desks))
})

test('arrivals are spaced out, not all at once', () => {
  const { stage, hire, run } = setup()
  for (let i = 0; i < 5; i++) hire(`w${i}`)
  run(0.2)
  const early = stage.snapshot().workers.filter(w => w.kind === 'worker').length
  run(5)
  const late = stage.snapshot().workers.filter(w => w.kind === 'worker').length

  assert.ok(early < 5)
  assert.equal(late, 5)
})

test('handing in puts the work on the manager\'s tray; the worker then waits in the lounge', () => {
  const { stage, hire, doStep, settle, person } = setup()
  hire('w1', { path: 'a.js' })
  doStep('w1', 'write', { path: 'a.js', adds: 1, dels: 0 })
  doStep('w1', 'handIn')
  settle()

  assert.equal(stage.snapshot().stack, 1)
  assert.ok(at(person('w1'), layout.spots.seats))
})

test('the manager waits for everyone to hand in, then takes the stack up to the CEO and comes back', () => {
  const { stage, hire, doStep, settle, run, person } = setup()
  for (const id of ['w1', 'w2']) {
    hire(id, { path: `${id}.js` })
    doStep(id, 'write', { path: `${id}.js`, adds: 40, dels: 0 })
    doStep(id, 'handIn')
  }
  stage.apply({ cmd: 'review', sessionId: 's', workers: ['w1', 'w2'] }, 0)
  stage.apply({ cmd: 'submit', sessionId: 's', workers: ['w1', 'w2'] }, 0)

  run(3)
  const manager = () => person('manager')
  assert.deepEqual([manager().x, manager().y], [layout.spots.managerSeat.x, layout.spots.managerSeat.y]) // still waiting at the desk
  assert.equal(stage.snapshot().ceo.papers, 0)

  let upstairs = false
  for (let i = 0; i < 6000 && !stage.isIdle(); i++) {
    run(0.1)
    if (manager().y < layout.groundTop) upstairs = true
  }
  settle()

  assert.ok(upstairs)
  assert.equal(stage.snapshot().ceo.papers, 2)
  assert.equal(stage.snapshot().stack, 0)
  assert.deepEqual([manager().x, manager().y], [layout.spots.managerSeat.x, layout.spots.managerSeat.y])
})

test('a worker told to leave walks out and is gone', () => {
  const { stage, hire, doStep, settle } = setup()
  hire('w1')
  doStep('w1', 'fetch', { path: 'a.js' })
  stage.apply({ cmd: 'fire', worker: 'w1' }, 0)
  settle()

  assert.equal(stage.snapshot().workers.some(w => w.id === 'w1'), false)
})

test('a failed command shakes and shows a cross; a passing one shows a tick', () => {
  const { hire, doStep, run, person } = setup()
  hire('w1')
  doStep('w1', 'test')
  run(20)
  assert.ok(at(person('w1'), layout.spots.lab)) // it waits at the machine until told how it went
  assert.equal(person('w1').pose, 'machine')

  doStep('w1', 'fail')
  run(0.5)
  const bad = person('w1')
  assert.equal(bad.pose, 'shake')
  assert.equal(bad.bubble.kind, 'bad')

  doStep('w1', 'test')
  doStep('w1', 'pass')
  run(0.1)
  for (let i = 0; i < 100 && person('w1').bubble?.kind !== 'ok'; i++) run(0.1)
  assert.equal(person('w1').bubble.kind, 'ok')
})

test('a permission asked sends a worker to the CEO\'s door to wait until it is answered', () => {
  const { stage, hire, doStep, run, person } = setup()
  hire('w1')
  doStep('w1', 'fetch', { path: 'a.js' })
  stage.apply({ cmd: 'ask', sessionId: 's', tool: 'Bash', summary: 'Ran: rm x' }, 0)
  run(40)

  assert.deepEqual([Math.round(person('w1').x), Math.round(person('w1').y)], [layout.spots.ceoDoor.x, layout.spots.ceoDoor.y])
  assert.equal(person('w1').bubble.text, '?')

  stage.apply({ cmd: 'answered', sessionId: 's' }, 0)
  run(40)
  assert.equal(person('w1').bubble, null)
  assert.ok(at(person('w1'), layout.spots.seats))
})

test('a permission answered before the worker got there is skipped', () => {
  const { stage, hire, doStep, settle, person } = setup()
  hire('w1')
  doStep('w1', 'fetch', { path: 'a.js' })
  stage.apply({ cmd: 'ask', sessionId: 's', tool: 'Bash' }, 0)
  stage.apply({ cmd: 'answered', sessionId: 's' }, 0)
  settle()

  assert.ok(at(person('w1'), layout.spots.files)) // never went upstairs
})

test('with nobody working, the manager is the one who asks', () => {
  const { stage, run, person } = setup()
  stage.apply({ cmd: 'ask', sessionId: 's', tool: 'Bash' }, 0)
  run(60)

  assert.equal(person('manager').bubble.text, '?')
})

test('a prompt puts a note above the CEO for a moment', () => {
  const { stage, run } = setup()
  stage.apply({ cmd: 'prompt', sessionId: 's' }, 0)
  run(0.5)
  assert.ok(stage.snapshot().ceo.bubble)

  run(5)
  assert.equal(stage.snapshot().ceo.bubble, null)
})

test('instant speed: everything is done within a moment, with no walking', () => {
  const { stage, hire, doStep, run } = setup({ getMult: () => 0 })
  hire('w1', { path: 'a.js' })
  doStep('w1', 'fetch', { path: 'a.js' })
  doStep('w1', 'study')
  doStep('w1', 'write', { path: 'a.js', adds: 50, dels: 0 })
  doStep('w1', 'handIn')
  run(0.5, 16)

  assert.equal(stage.isIdle(), true)
  assert.equal(stage.snapshot().stack, 1)
})

test('a window that was hidden for ten minutes catches up in one tick', () => {
  const { stage, hire, doStep } = setup()
  hire('w1', { path: 'a.js' })
  doStep('w1', 'fetch', { path: 'a.js' })
  doStep('w1', 'write', { path: 'a.js', adds: 10, dels: 0 })
  doStep('w1', 'handIn')
  stage.tick(10 * 60 * 1000)

  assert.equal(stage.isIdle(), true)
  assert.equal(stage.snapshot().stack, 1)
})

test('a crowd works faster than a trickle: a long line of work speeds up', () => {
  const crowd = setup()
  const few = setup()
  for (let i = 0; i < 40; i++) {
    crowd.hire(`w${i}`, { path: `${i}.js` })
    crowd.doStep(`w${i}`, 'write', { path: `${i}.js`, adds: 40, dels: 0 })
  }
  few.hire('w0', { path: '0.js' })
  few.doStep('w0', 'write', { path: '0.js', adds: 40, dels: 0 })
  let secondsCrowd = 0
  let secondsFew = 0
  while (!crowd.stage.isIdle() && secondsCrowd < 1000) (crowd.run(1), secondsCrowd++)
  while (!few.stage.isIdle() && secondsFew < 1000) (few.run(1), secondsFew++)

  assert.ok(secondsCrowd < secondsFew * 40, `${secondsCrowd}s for 40 vs ${secondsFew}s for one`)
})

test('commands for a worker that was never hired are ignored', () => {
  const { stage, doStep } = setup()

  assert.doesNotThrow(() => doStep('ghost', 'write', { path: 'a.js' }))
  assert.equal(stage.isIdle(), true)
})

test('paused: nothing moves, and it carries on from where it was when resumed', () => {
  const { stage, hire, doStep, run, person } = setup()
  hire('w1', { path: 'a.js' })
  doStep('w1', 'fetch', { path: 'a.js' })
  run(2)
  stage.setPaused(true)
  const before = { x: person('w1').x, y: person('w1').y }
  run(30)

  assert.deepEqual({ x: person('w1').x, y: person('w1').y }, before)
  stage.setPaused(false)
  run(30)
  assert.ok(at(person('w1'), layout.spots.files))
})

test('commands that arrive while paused wait for the resume', () => {
  const { stage, hire, doStep, run, settle, person } = setup()
  stage.setPaused(true)
  hire('w1', { path: 'a.js' })
  doStep('w1', 'fetch', { path: 'a.js' })
  run(10)
  assert.equal(stage.snapshot().workers.some(w => w.id === 'w1'), false)

  stage.setPaused(false)
  settle()
  assert.ok(at(person('w1'), layout.spots.files))
})

test('skip finishes everything that is going on, now', () => {
  const { stage, hire, doStep, person } = setup()
  for (const id of ['w1', 'w2', 'w3']) {
    hire(id, { path: `${id}.js` })
    doStep(id, 'fetch', { path: `${id}.js` })
    doStep(id, 'study')
    doStep(id, 'write', { path: `${id}.js`, adds: 100, dels: 0 })
    doStep(id, 'handIn')
  }
  stage.skip()

  assert.equal(stage.isIdle(), true)
  assert.equal(stage.snapshot().stack, 3)
  assert.ok(at(person('w1'), layout.spots.seats))
})

test('skip does not send a worker upstairs who is waiting on a permission', () => {
  const { stage, hire, doStep, person } = setup()
  hire('w1', { path: 'a.js' })
  doStep('w1', 'fetch', { path: 'a.js' })
  stage.apply({ cmd: 'ask', sessionId: 's', tool: 'Bash' }, 0)
  stage.skip()

  assert.equal(person('w1').bubble.text, '?')
  assert.equal(stage.isIdle(), false)
})

test('workers who share a desk do not stand on one spot', () => {
  const { stage, hire, doStep, settle } = setup()
  const count = layout.spots.desks.length + 6
  for (let i = 0; i < count; i++) {
    hire(`w${i}`)
    doStep(`w${i}`, 'write', { path: `${i}.js`, adds: 1, dels: 0 })
  }
  settle()
  const spots = stage.snapshot().workers.filter(w => w.kind === 'worker').map(w => `${w.x.toFixed(2)},${w.y.toFixed(2)}`)

  assert.equal(new Set(spots).size, count)
})

test('an API error: the manager shows what went wrong, in red', () => {
  const { stage, run, person } = setup()
  stage.apply({ cmd: 'fail', sessionId: 's', label: 'Rate limit' }, 0)
  run(1)

  assert.equal(person('manager').label, 'Rate limit')
  assert.equal(person('manager').bubble.kind, 'bad')
})

test('a compaction sends the manager to the file room until it is over, then back', () => {
  const { stage, run, person } = setup()
  stage.apply({ cmd: 'compact', sessionId: 's' }, 0)
  run(30)

  assert.ok(at(person('manager'), layout.spots.files))
  assert.equal(person('manager').label, 'Compacting memory')

  stage.apply({ cmd: 'compacted', sessionId: 's' }, 0)
  run(30)
  assert.deepEqual([person('manager').x, person('manager').y], [layout.spots.managerSeat.x, layout.spots.managerSeat.y])
  assert.equal(person('manager').label, '')
})

test('a compaction that was over before the manager got there is skipped', () => {
  const { stage, settle, person } = setup()
  stage.apply({ cmd: 'compact', sessionId: 's' }, 0)
  stage.apply({ cmd: 'compacted', sessionId: 's' }, 0)
  settle()

  assert.equal(stage.isIdle(), true)
  assert.deepEqual([person('manager').x, person('manager').y], [layout.spots.managerSeat.x, layout.spots.managerSeat.y])
})

test('a refused tool: the last worker shakes their head, "Blocked"', () => {
  const { stage, hire, doStep, run, person, now } = setup()
  hire('w1')
  doStep('w1', 'arrive')
  run(20)
  stage.apply({ cmd: 'denied', sessionId: 's', tool: 'Bash' }, now())
  for (let i = 0; i < 20 && person('w1').label !== 'Blocked'; i++) run(0.1) // after a moment to take it in

  assert.equal(person('w1').label, 'Blocked')
  assert.equal(person('w1').bubble.kind, 'bad')
})

test('an MCP call goes out by the front door and waits; unavailable shakes the head', () => {
  const { hire, doStep, run, person, settle } = setup()
  hire('w1')
  doStep('w1', 'call', { server: 'github' })
  run(30)

  assert.deepEqual([Math.round(person('w1').x), Math.round(person('w1').y)], [layout.spots.entrance.x, layout.spots.entrance.y])
  assert.equal(person('w1').label, 'Calling github')

  doStep('w1', 'unavailable')
  for (let i = 0; i < 100 && person('w1').label !== 'Tool unavailable'; i++) run(0.1)
  assert.equal(person('w1').bubble.kind, 'bad')
  settle()
})

test('a note shows over the CEO for a moment, or over the manager', () => {
  const { stage, run, person } = setup()
  stage.apply({ cmd: 'note', who: 'ceo', text: 'Resumed', kind: 'info' }, 0)
  run(0.5)
  assert.equal(stage.snapshot().ceo.bubble.text, 'Resumed')

  stage.apply({ cmd: 'note', sessionId: 's', who: 'manager', text: 'Model: opus', kind: 'info' }, 0)
  for (let i = 0; i < 40 && person('manager').label !== 'Model: opus'; i++) run(0.1)
  assert.equal(person('manager').label, 'Model: opus')
})

test('/clear waits for everyone who was in the office to go home, then sweeps the tray', () => {
  const { stage, hire, doStep, run, settle, now } = setup()
  hire('w1', { path: 'a.js' })
  doStep('w1', 'write', { path: 'a.js', adds: 3, dels: 0 })
  doStep('w1', 'handIn')
  stage.apply({ cmd: 'clear', sessionId: 's' }, now())
  stage.apply({ cmd: 'fire', worker: 'w1' }, now())
  run(0.1)
  settle()

  assert.equal(stage.snapshot().stack, 0)
  assert.equal(stage.isIdle(), true)
})

// a small floor of our own, so a test can say exactly who is where
const corridor = (rows, spots) => {
  const spot = { x: 0, y: 0 }
  return {
    grid: rows,
    spots: { entrance: spot, managerSeat: spot, handIn: spot, managers: [{ seat: spot, tray: spot, handIn: spot }], ceoSeat: spot, ceoDelivery: spot, ceoDoor: spot, desks: [spot], seats: [spot], files: [spot], lab: [spot], ...spots },
  }
}

test('everyone is a little different, and always the same', () => {
  const a = personality('w1')

  assert.deepEqual(personality('w1'), a)
  assert.ok(a.speed >= 0.85 && a.speed <= 1.2)
  assert.ok(a.react >= 0.15 && a.react <= 0.55)
  assert.ok(a.settle >= 0.2 && a.settle <= 0.45)
  assert.ok(new Set(Array.from({ length: 30 }, (_, i) => personality(`w${i}`).speed)).size > 10)
})

test('a new job after a quiet moment is taken in first: the worker does not set off at once', () => {
  const { hire, doStep, run, person } = setup()
  hire('w1')
  run(1) // in, and standing at the door
  doStep('w1', 'fetch', { path: 'a.js' })
  run(personality('w1').react * 0.8)

  assert.deepEqual([person('w1').x, person('w1').y], [layout.spots.entrance.x, layout.spots.entrance.y])
  run(1)
  assert.notDeepEqual([person('w1').x, person('w1').y], [layout.spots.entrance.x, layout.spots.entrance.y])
})

test('after walking over, a worker settles for a moment before the job begins', () => {
  const { hire, doStep, run, person } = setup()
  hire('w1')
  doStep('w1', 'fetch', { path: 'a.js' })
  const seen = []
  for (let i = 0; i < 300; i++) {
    run(0.1)
    if (at(person('w1'), layout.spots.files) && seen.at(-1) !== person('w1').pose) seen.push(person('w1').pose)
  }

  assert.ok(seen.includes('grab'))
  assert.ok(seen.indexOf('idle') < seen.indexOf('grab'), seen.join(' '))
})

test('walking starts slowly and never goes faster than that person\'s own top speed', () => {
  const { hire, doStep, run, person } = setup()
  hire('w1')
  doStep('w1', 'fetch', { path: 'a.js' })
  const steps = []
  let last = [person('w1').x, person('w1').y]
  for (let i = 0; i < 300; i++) {
    run(0.1)
    const now = [person('w1').x, person('w1').y]
    const moved = Math.hypot(now[0] - last[0], now[1] - last[1])
    if (moved > 0) steps.push(moved)
    last = now
  }

  assert.ok(steps[0] < 0.25, `first step ${steps[0]}`)
  assert.ok(Math.max(...steps) <= 4 * personality('w1').speed * 1.5 * 0.1 + 0.001) // on the first trip, which is faster
})

test('the first trip from the gate is quicker than the long way at walking pace: it takes under 12 seconds', () => {
  const { hire, doStep, run, person } = setup()
  hire('w1')
  run(1)
  doStep('w1', 'write', { path: 'a.js', adds: 1 })
  const desk = layout.spots.desks[0]
  let seconds = 0
  while (!(Math.round(person('w1').x) === desk.x && Math.round(person('w1').y) === desk.y) && seconds < 60) {
    run(0.1)
    seconds += 0.1
  }

  assert.ok(seconds < 12, `the first trip took ${seconds} seconds`)
})

test('a crowd handing in at once stands round the tray, each on a cell of their own, not all on one', () => {
  const { hire, doStep, run, person } = setup()
  const ids = ['w1', 'w2', 'w3', 'w4', 'w5']
  for (const id of ids) {
    hire(id)
    doStep(id, 'handIn')
  }
  const where = new Map()
  for (let i = 0; i < 600; i++) {
    run(0.1)
    for (const id of ids) if (person(id)?.pose === 'give' && !where.has(id)) where.set(id, `${Math.round(person(id).x)},${Math.round(person(id).y)}`)
  }
  const tray = layout.spots.handIn

  assert.equal(where.size, 5)
  assert.equal(new Set(where.values()).size, 5, [...where.values()].join(' '))
  for (const cell of where.values()) {
    const [x, y] = cell.split(',').map(Number)
    assert.ok(Math.abs(x - tray.x) + Math.abs(y - tray.y) <= 2, `${cell} is far from the tray`)
  }
})

test('ticked once a frame (sixty a second) a walker glides: small steps, none bigger than their speed allows, no standing still mid-walk', () => {
  const { hire, doStep, run, person } = setup()
  hire('w1')
  doStep('w1', 'fetch', { path: 'a.js' })
  run(1, 16)
  let last = [person('w1').x, person('w1').y]
  let still = 0
  let longestStill = 0
  let biggest = 0
  for (let i = 0; i < 600; i++) {
    run(0.016, 16)
    const now = [person('w1').x, person('w1').y]
    const moved = Math.hypot(now[0] - last[0], now[1] - last[1])
    if (person('w1').pose === 'walk') {
      biggest = Math.max(biggest, moved)
      still = moved === 0 ? still + 1 : 0
      longestStill = Math.max(longestStill, still)
    }
    last = now
  }

  assert.ok(biggest <= 4 * personality('w1').speed * 1.5 * 0.016 + 0.001, `a step of ${biggest}`)
  assert.ok(longestStill <= 1, `stood still for ${longestStill} frames while walking`)
})

test('someone standing in the way is gone round, not walked through', () => {
  const floor = corridor(['.......', '.......', '.......'], { entrance: { x: 0, y: 1 }, files: [{ x: 3, y: 1 }], seats: [{ x: 6, y: 1 }] })
  const { stage, run, now } = setup({ layout: floor })
  const who = id => stage.snapshot().workers.find(w => w.id === id)
  const hireAt = id => stage.apply({ cmd: 'hire', worker: { id, name: id, color: '#fff', kind: 'worker', sessionId: 's' } }, now())

  hireAt('a')
  stage.apply({ cmd: 'do', worker: 'a', step: 'search' }, now())
  run(15) // a stands in the middle of the way, waiting
  hireAt('b')
  stage.apply({ cmd: 'do', worker: 'b', step: 'arrive' }, now())
  let closest = Infinity
  for (let i = 0; i < 300 && !(who('b') && who('b').x === 6 && who('b').y === 1); i++) {
    run(0.1)
    if (who('b')) closest = Math.min(closest, Math.hypot(who('b').x - who('a').x, who('b').y - who('a').y))
  }

  assert.deepEqual([who('b').x, who('b').y], [6, 1]) // got there
  assert.ok(closest >= 0.9, `came within ${closest}`) // without going through a
})

test('two workers walking at each other: one gives way and the other walks straight on, so they do not dodge the same way for good', () => {
  const floor = corridor(['.......', '.......', '.......'], { entrance: { x: 0, y: 1 }, files: [{ x: 6, y: 1 }], seats: [{ x: 0, y: 1 }] })
  const { stage, run, now } = setup({ layout: floor })
  const who = id => stage.snapshot().workers.find(w => w.id === id)
  const hireAt = id => stage.apply({ cmd: 'hire', worker: { id, name: id, color: '#fff', kind: 'worker', sessionId: 's' } }, now())

  hireAt('b')
  stage.apply({ cmd: 'do', worker: 'b', step: 'search' }, now())
  run(15) // b waits at the far end
  stage.apply({ cmd: 'do', worker: 'b', step: 'arrive' }, now()) // and starts back to the door...
  hireAt('a')
  stage.apply({ cmd: 'do', worker: 'a', step: 'search' }, now()) // as a sets off for where b was
  let closest = Infinity
  let done = null
  for (let i = 0; i < 400 && done === null; i++) {
    run(0.1)
    if (who('a') && who('b')) closest = Math.min(closest, Math.hypot(who('a').x - who('b').x, who('a').y - who('b').y))
    if (who('a').x === 6 && who('b').x === 0) done = i / 10
  }

  assert.ok(done !== null && done < 12, `took ${done} seconds`)
  assert.ok(closest >= 0.9, `came within ${closest}: walked through each other`)
})

test('with no way round, a worker waits, and after a few seconds walks through rather than stand there for good', () => {
  const floor = corridor(['.......'], { entrance: { x: 0, y: 0 }, files: [{ x: 3, y: 0 }], seats: [{ x: 6, y: 0 }] })
  const { stage, run, now } = setup({ layout: floor })
  const who = id => stage.snapshot().workers.find(w => w.id === id)
  const hireAt = id => stage.apply({ cmd: 'hire', worker: { id, name: id, color: '#fff', kind: 'worker', sessionId: 's' } }, now())

  hireAt('a')
  stage.apply({ cmd: 'do', worker: 'a', step: 'search' }, now())
  run(15)
  hireAt('b')
  stage.apply({ cmd: 'do', worker: 'b', step: 'arrive' }, now())
  run(3) // b has come up to a and is held up behind
  assert.ok(who('b').x <= 2.01, `at ${who('b').x}`)

  run(15)
  assert.deepEqual([who('b').x, who('b').y], [6, 0])
})

test('a passed test or a found result is a little hop of joy', () => {
  const { hire, doStep, run, person } = setup()
  hire('w1')
  doStep('w1', 'pass')
  const poses = new Set()
  for (let i = 0; i < 30; i++) {
    run(0.1)
    poses.add(person('w1').pose)
  }

  assert.ok(poses.has('cheer'))
})

test('a failure shows a warning where it happened; success shows nothing of the kind', () => {
  const { hire, doStep, run, stage } = setup()
  hire('w1')
  doStep('w1', 'pass')
  run(3)
  assert.equal(stage.takeEffects().some(e => e.kind === 'warning'), false)

  doStep('w1', 'fail')
  run(3)
  const warnings = stage.takeEffects().filter(e => e.kind === 'warning')
  assert.equal(warnings.length, 1)
  assert.equal(typeof warnings[0].x, 'number')
})

test('a hand-in shows a ring at the tray, the CEO getting the work shows confetti, and taking the effects empties the list', () => {
  const { stage, hire, doStep, run, now } = setup()
  hire('w1', { path: 'a.js' })
  doStep('w1', 'write', { path: 'a.js', adds: 3, dels: 0 })
  doStep('w1', 'handIn')
  stage.apply({ cmd: 'review', sessionId: 's', workers: ['w1'] }, now())
  stage.apply({ cmd: 'submit', sessionId: 's', workers: ['w1'] }, now())
  run(80)
  const seen = stage.takeEffects()

  assert.ok(seen.some(e => e.kind === 'ring' && e.tone === 'ok'))
  assert.ok(seen.some(e => e.kind === 'confetti'))
  assert.deepEqual(stage.takeEffects(), [])
})

test('a prompt shows a ring at the CEO', () => {
  const { stage, now } = setup()
  stage.apply({ cmd: 'prompt', sessionId: 's' }, now())

  assert.ok(stage.takeEffects().some(e => e.kind === 'ring' && e.tone === 'info'))
})

test('at instant speed there are no effects: nothing is in view', () => {
  const { stage, hire, doStep, run } = setup({ getMult: () => 0 })
  hire('w1')
  doStep('w1', 'fail')
  run(1)

  assert.deepEqual(stage.takeEffects(), [])
})

test('a worker faces the way they walk: right, left, up or down, by the larger part of each step', () => {
  const floor = corridor(['.......', '.......', '.......'], { entrance: { x: 0, y: 2 }, seats: [{ x: 6, y: 2 }], files: [{ x: 0, y: 0 }] })
  const { stage, run, now } = setup({ layout: floor })
  const who = () => stage.snapshot().workers.find(w => w.id === 'a')
  const dirsOver = seconds => {
    const seen = new Set()
    for (let i = 0; i < seconds * 10; i++) {
      run(0.1)
      if (who().pose === 'walk') seen.add(who().dir)
    }
    return seen
  }
  stage.apply({ cmd: 'hire', worker: { id: 'a', name: 'a', color: '#fff', kind: 'worker', sessionId: 's' } }, now())

  stage.apply({ cmd: 'do', worker: 'a', step: 'arrive' }, now()) // along the bottom to the right
  assert.deepEqual([...dirsOver(8)], ['right'])
  stage.apply({ cmd: 'do', worker: 'a', step: 'fetch', path: 'a.js' }, now()) // back left, then up
  assert.deepEqual([...dirsOver(12)].sort(), ['left', 'up'])
})

test('sitting at a seat or a desk, a worker faces the way the seat faces', () => {
  const { hire, doStep, run, person } = setup()
  hire('w1', { path: 'a.js' })
  doStep('w1', 'fetch', { path: 'a.js' }) // up to the shelves: they face away
  run(30)
  doStep('w1', 'study')
  for (let i = 0; i < 300 && person('w1').pose !== 'read'; i++) run(0.1)

  assert.equal(person('w1').pose, 'read')
  assert.equal(person('w1').dir, layout.spots.seats.find(s => s.x === person('w1').x && s.y === person('w1').y).face)
})

test('a seat that says nothing about its way faces the room', () => {
  const { hire, doStep, run, person } = setup({ layout: corridor(['.....'], { seats: [{ x: 3, y: 0 }] }) })
  hire('w1')
  doStep('w1', 'study')
  for (let i = 0; i < 300 && person('w1').pose !== 'read'; i++) run(0.1)

  assert.equal(person('w1').pose, 'read')
  assert.equal(person('w1').dir, 'down')
})

test('a seat that faces left or right turns the person that way, so the side view is flipped to match', () => {
  for (const [face, facing] of [['left', -1], ['right', 1]]) {
    const { hire, doStep, run, person } = setup({ layout: corridor(['.....'], { seats: [{ x: 3, y: 0, face }] }) })
    hire('w1')
    doStep('w1', 'study')
    for (let i = 0; i < 300 && person('w1').pose !== 'read'; i++) run(0.1)

    assert.equal(person('w1').dir, face)
    assert.equal(person('w1').facing, facing)
  }
})

test('the snapshot says which chat each worker belongs to, the manager too', () => {
  const { stage, hire, run } = setup()
  hire('w1', { sessionId: 'chat-a' })
  run(1)
  const workers = stage.snapshot().workers

  assert.equal(workers.find(w => w.id === 'w1').sessionId, 'chat-a')
  assert.equal(workers.find(w => w.kind === 'manager').sessionId, 's')
})

test('someone with nothing to do keeps busy: they type at their desk, and now and then go on a break, a trip or a visit outside, say what they are doing, and come back', () => {
  const { hire, doStep, run, person } = setup({ breaks: true })
  hire('w1')
  doStep('w1', 'write', { path: 'a.js', adds: 1 })
  for (let i = 0; i < 300 && !person('w1').label?.startsWith('Writing'); i++) run(0.1) // to the desk, to write
  const desk = { x: Math.round(person('w1').x), y: Math.round(person('w1').y) }
  assert.ok(at(person('w1'), layout.spots.desks))
  const labels = new Set()
  let away = false
  let typed = false
  let back = false
  for (let i = 0; i < 6000 && !(back && typed); i++) {
    run(0.1)
    const p = person('w1')
    if (p.label && !p.label.startsWith('Writing')) labels.add(p.label)
    if (p.pose === 'type' && !p.label) typed = true // at the desk with nothing to write: just working
    const home = Math.round(p.x) === desk.x && Math.round(p.y) === desk.y
    if (!home) away = true
    else if (away && labels.size > 0) back = true
  }
  assert.ok(typed, 'typed at the desk')
  assert.ok(away, 'left the desk')
  const known = new Set([...layout.spots.breaks, ...layout.spots.outside].map(b => b.label).concat(['Filing', 'Checking servers', 'Testing']))
  assert.ok([...labels].every(label => known.has(label)), `a break, a trip or a visit outside: ${[...labels]}`)
  assert.ok(labels.size > 0, 'said what they were doing')
  assert.ok(back, 'and came back')
})

test('work that arrives on a break ends it: the worker turns to the job, and the Office still counts as idle while someone is on a break', () => {
  const { stage, hire, doStep, run, person } = setup({ breaks: true })
  hire('w1')
  doStep('w1', 'write', { path: 'a.js', adds: 1 })
  run(15)
  let left = false
  for (let i = 0; i < 1500 && !left; i++) {
    run(0.1)
    left = person('w1').pose === 'walk'
  }
  assert.ok(left, 'set off on a break')
  assert.equal(stage.isIdle(), true)
  doStep('w1', 'fetch', { path: 'b.js' })
  run(40)
  assert.ok(at(person('w1'), layout.spots.files) || person('w1').carry === 'book', 'went for the file')
})

test('breaks are for workers: the manager does not wander off, and none start at instant speed', () => {
  const { stage, run, person, hire, doStep } = setup({ breaks: true, getMult: () => 0 })
  hire('w1')
  doStep('w1', 'write', { path: 'a.js', adds: 1 })
  run(120)
  assert.ok(at(person('w1'), layout.spots.desks))
  const manager = stage.snapshot().workers.find(w => w.id === 'manager')
  assert.deepEqual([manager.x, manager.y], [layout.spots.managerSeat.x, layout.spots.managerSeat.y])
})

test('a huddle sends helpers to the meeting room table: each sits in a chair of their own, facing the table, until the tool is over', () => {
  const { stage, hire, doStep, run, person } = setup()
  for (const id of ['w1', 'w2', 'w3']) {
    hire(id)
    doStep(id, 'huddle', { label: 'Updating the todo list' })
  }
  run(60)
  const places = ['w1', 'w2', 'w3'].map(id => `${Math.round(person(id).x)},${Math.round(person(id).y)}`)

  assert.equal(new Set(places).size, 3)
  for (const id of ['w1', 'w2', 'w3']) {
    const spot = layout.spots.huddle.find(h => h.x === Math.round(person(id).x) && h.y === Math.round(person(id).y))
    assert.ok(spot, `${id} is in a meeting room chair`)
    assert.equal(person(id).pose, 'sit')
    assert.equal(person(id).label, 'Updating the todo list')
    assert.equal(person(id).dir, spot.face) // facing the table
  }
  doStep('w1', 'planned')
  run(1)
  assert.equal(person('w1').pose, 'cheer')
  assert.equal(stage.isIdle(), false)
})
