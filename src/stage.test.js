import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildLayout } from '../public/layout.js'
import { createStage } from '../public/stage.js'

const layout = buildLayout()
const at = (p, list) => list.some(s => s.x === Math.round(p.x) && s.y === Math.round(p.y))

// a stage with a clock the test moves by hand, in milliseconds
const setup = (options = {}) => {
  let t = 0
  const stage = createStage({ layout, ...options })
  stage.tick(t)
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
  run(10)
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
