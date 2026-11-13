import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildStudio } from '../public/studio.js'
import { createStage } from '../public/stage.js'
import { levelAt } from '../public/studio.js'

// Teams: each chat has a manager and a team who live in the office. A lane of work (the director's `hire`) goes to
// one of the team; more people come in when they are all busy.

const layout = buildStudio()
const at = (p, list) => list.some(s => s.x === Math.round(p.x) && s.y === Math.round(p.y))

const withTeam = (size = 5, reserve = 5, options = {}) => {
  let t = 0
  const stage = createStage({ layout, ...options })
  stage.tick(t)
  const run = (seconds, stepMs = 100) => {
    for (let spent = 0; spent < seconds * 1000; spent += stepMs) stage.tick((t += stepMs))
  }
  const info = (id, extra = {}) => ({ id, name: id, color: '#fff', kind: 'worker', sessionId: 's', ...extra })
  const team = sessionId =>
    stage.apply(
      {
        cmd: 'team',
        sessionId,
        manager: info(`m-${sessionId}`, { name: 'Manager', kind: 'manager', sessionId }),
        workers: Array.from({ length: size }, (_, i) => info(`${sessionId}-r${i}`, { sessionId })),
        reserve: Array.from({ length: reserve }, (_, i) => info(`${sessionId}-x${i}`, { sessionId })),
      },
      t,
    )
  const hire = (id, extra = {}) => stage.apply({ cmd: 'hire', worker: info(id, extra) }, t)
  const doStep = (worker, step, extra = {}) => stage.apply({ cmd: 'do', worker, step, ...extra }, t)
  const fire = worker => stage.apply({ cmd: 'fire', worker }, t)
  const phase = (sessionId, name) => stage.apply({ cmd: 'phase', sessionId, phase: name }, t)
  const people = () => stage.snapshot().workers
  const settle = (limit = 600) => {
    for (let spent = 0; spent < limit && !stage.isIdle(); spent++) run(1)
  }
  return { stage, run, team, hire, doStep, fire, phase, people, settle }
}

test("a chat's team is in the office at once: the manager and every worker at a desk of their own, nobody walking in", () => {
  const { team, people } = withTeam(6)
  team('s')
  const all = people()
  const workers = all.filter(w => w.kind === 'worker')

  assert.equal(all.filter(w => w.kind === 'manager').length, 1)
  assert.equal(workers.length, 6)
  assert.equal(new Set(workers.map(w => `${w.x},${w.y}`)).size, 6)
  for (const w of workers) assert.ok(at(w, layout.spots.desks))
  assert.ok(at(all.find(w => w.kind === 'manager'), layout.spots.managers.map(m => m.seat)))
})

test('a lane of work goes to someone on the team: no new person walks in, and they write at their own desk', () => {
  const { team, hire, doStep, run, people } = withTeam(5)
  team('s')
  const before = new Set(people().map(w => w.id))
  hire('w1')
  doStep('w1', 'write', { path: 'a.js', adds: 3, dels: 0 })
  let writer
  for (let i = 0; i < 300 && !writer; i++) {
    run(0.1)
    writer = people().find(w => w.label?.startsWith('Writing'))
  }

  assert.ok(writer, 'someone is writing')
  assert.ok(at(writer, layout.spots.desks))
  assert.equal(people().length, before.size)
  assert.ok(people().every(w => before.has(w.id)))
})

test('two lanes at once go to two different people', () => {
  const { team, hire, doStep, run, people } = withTeam(5)
  team('s')
  for (const id of ['a', 'b']) {
    hire(id)
    doStep(id, 'search')
  }
  run(30)

  assert.equal(people().filter(w => w.label === 'Searching').length, 2)
})

test('when all the team is busy more people come in, up to twice the team, and then a lane gets someone new', () => {
  const { team, hire, doStep, run, people } = withTeam(3, 3)
  team('s')
  for (let i = 0; i < 8; i++) {
    hire(`l${i}`)
    doStep(`l${i}`, 'search')
  }
  run(40)

  assert.equal(people().filter(w => w.kind === 'worker').length, 8) // the 3, 3 more brought in, and 2 new ones for the rest
  assert.equal(people().filter(w => w.label === 'Searching').length, 8)
})

test('someone brought in for a busy spell goes home after a while with nothing to do, and can be brought in again', () => {
  const { team, hire, doStep, fire, run, people } = withTeam(2, 2)
  team('s')
  for (const id of ['a', 'b', 'c']) {
    hire(id)
    doStep(id, 'search')
  }
  run(10)
  assert.equal(people().filter(w => w.kind === 'worker').length, 3)
  for (const id of ['a', 'b', 'c']) fire(id)
  run(10)
  assert.equal(people().filter(w => w.kind === 'worker').length, 3) // not at once
  run(90)
  assert.equal(people().filter(w => w.kind === 'worker').length, 2) // the extra has gone

  for (const id of ['d', 'e', 'f']) {
    hire(id)
    doStep(id, 'search')
  }
  run(10)
  assert.equal(people().filter(w => w.kind === 'worker').length, 3) // and comes in again
})

test('when a lane ends the person is free again, and stays in the office', () => {
  const { team, hire, doStep, fire, run, people, settle } = withTeam(5)
  team('s')
  hire('a')
  doStep('a', 'search')
  run(5)
  fire('a')
  settle()
  run(5)

  assert.equal(people().filter(w => w.kind === 'worker').length, 5)
})

test('free people keep busy: they type at their desks without a label, and the Office still counts as idle', () => {
  const { stage, team, run, people } = withTeam(5)
  team('s')
  const typing = new Set()
  for (let i = 0; i < 400; i++) {
    run(0.1)
    for (const w of people()) if (w.pose === 'type' && !w.label) typing.add(w.id)
  }

  assert.ok(typing.size >= 3, `${typing.size} typed`)
  assert.equal(stage.isIdle(), true)
})

test('each chat has a manager and a tray of its own, and work goes to the tray of the chat it came from', () => {
  const { stage, team, hire, doStep, settle, people } = withTeam(3)
  team('s')
  team('t')
  hire('a', { sessionId: 't' })
  doStep('a', 'write', { path: 'a.js', adds: 1, dels: 0 })
  doStep('a', 'handIn')
  settle()
  const { trays } = stage.snapshot()

  assert.equal(people().filter(w => w.kind === 'manager').length, 2)
  assert.equal(trays.length, 2)
  assert.deepEqual(trays.map(tray => tray.count).sort(), [0, 1])
  const second = layout.spots.managers[1].tray
  assert.equal(trays.find(tray => tray.x === second.x && tray.y === second.y).count, 1)
})

test('when a chat leaves, its whole team and manager walk out, and the other chat is not touched', () => {
  const { stage, team, run, people } = withTeam(4)
  team('s')
  team('t')
  stage.apply({ cmd: 'leave', sessionId: 's' }, 0)
  run(120)

  assert.equal(people().some(w => w.sessionId === 's'), false)
  assert.equal(people().filter(w => w.sessionId === 't' && w.kind === 'worker').length, 4)
  assert.equal(people().filter(w => w.sessionId === 't' && w.kind === 'manager').length, 1)
})

test('a helper is a new person who walks in, not one of the team', () => {
  const { team, hire, doStep, run, people } = withTeam(4)
  team('s')
  hire('h1', { kind: 'subagent' })
  doStep('h1', 'arrive')
  run(0.1)

  assert.equal(people().filter(w => w.kind === 'worker').length, 4)
  run(60)
  assert.ok(people().some(w => w.id === 'h1'))
})

// --- phases: what the chat is doing, and the CEO ---

const chairs = layout.spots.huddle
const outsideLabels = new Set(layout.spots.outside.map(o => o.label))

test('the CEO is one person, told apart from the workers: at his desk at first, with the stage saying where he is', () => {
  const { stage, team, people } = withTeam(5)
  team('s')
  const { ceo } = stage.snapshot()

  assert.equal(ceo.name, 'CEO')
  assert.deepEqual([ceo.x, ceo.y], [layout.spots.ceoSeat.x, layout.spots.ceoSeat.y])
  assert.equal(people().some(w => w.id === 'ceo'), false)
})

test('plan mode brings the manager, up to four of the team and the CEO to the meeting table, and it ends when plan mode does', () => {
  const { stage, team, phase, run, people } = withTeam(6)
  team('s')
  phase('s', 'planning')
  run(60)
  const seated = [...people().filter(w => at(w, chairs)), stage.snapshot().ceo].filter(w => at(w, chairs))

  assert.equal(seated.length, 6) // the manager, four workers and the CEO
  assert.ok(seated.some(w => w.kind === 'manager' && w.name === 'Manager'))
  assert.ok(seated.some(w => w.name === 'CEO'))
  assert.ok(seated.every(w => w.pose === 'sit' && w.label === 'Planning'))
  assert.equal(new Set(seated.map(w => `${w.x},${w.y}`)).size, 6)

  phase('s', 'working')
  run(90)
  const ceo = stage.snapshot().ceo
  assert.deepEqual([ceo.x, ceo.y], [layout.spots.ceoSeat.x, layout.spots.ceoSeat.y]) // he goes back to his desk
  const manager = people().find(w => w.kind === 'manager')
  assert.deepEqual([manager.x, manager.y], [layout.spots.managers[0].seat.x, layout.spots.managers[0].seat.y])
  assert.equal(people().filter(w => at(w, chairs)).length, 0)
})

test('someone in a meeting who is given a lane of work leaves it for the work', () => {
  const { team, phase, hire, doStep, run, people } = withTeam(5)
  team('s')
  phase('s', 'planning')
  run(60)
  for (let i = 0; i < 5; i++) {
    hire(`l${i}`)
    doStep(`l${i}`, 'search')
  }
  run(40)

  assert.equal(people().filter(w => w.label === 'Searching').length, 5)
})

test('the CEO gets up on his own from time to time: he walks round or calls a short meeting, and goes back to his desk', () => {
  const { stage, team, run } = withTeam(6)
  team('s')
  let away = 0
  let meeting = false
  for (let i = 0; i < 1500; i++) {
    run(1)
    const { ceo } = stage.snapshot()
    if (!(ceo.x === layout.spots.ceoSeat.x && ceo.y === layout.spots.ceoSeat.y)) away++
    if (ceo.label === 'Meeting') meeting = true
  }

  assert.ok(away > 60, `${away} seconds away from his desk`)
  assert.ok(meeting, 'called a meeting')
})

test('with nobody in the office the CEO stays at his desk', () => {
  const { stage, run } = withTeam(5)
  run(600)
  const { ceo } = stage.snapshot()

  assert.deepEqual([ceo.x, ceo.y], [layout.spots.ceoSeat.x, layout.spots.ceoSeat.y])
})

test('while the chat is working people make trips to the file room, the server room and the test lab; while it waits for the person more of them go out of the building', () => {
  const sample = name => {
    const { team, phase, run, people } = withTeam(8)
    team('s')
    phase('s', name)
    const labels = new Map()
    for (let i = 0; i < 3000; i++) {
      run(0.2)
      for (const w of people()) if (w.kind === 'worker' && w.label) labels.set(w.label, (labels.get(w.label) ?? 0) + 1)
    }
    return labels
  }
  const trips = labels => ['Filing', 'Checking servers', 'Testing'].reduce((total, label) => total + (labels.get(label) ?? 0), 0)
  const out = labels => [...labels].filter(([label]) => outsideLabels.has(label)).reduce((total, [, count]) => total + count, 0)
  const working = sample('working')
  const waiting = sample('waiting')

  for (const label of ['Filing', 'Checking servers', 'Testing']) assert.ok(working.get(label) > 0, `${label} while working`)
  assert.ok(trips(working) > trips(waiting) * 2, `${trips(working)} trip moments working, ${trips(waiting)} waiting`)
  assert.ok(out(waiting) > out(working) * 2, `${out(waiting)} moments outside waiting, ${out(working)} working`)
})

// --- a commit or a push ---

test('a commit makes the free people cheer, the CEO say so and confetti fall; people who are working carry on', () => {
  const { stage, team, hire, doStep, run, people } = withTeam(5)
  team('s')
  hire('busy')
  doStep('busy', 'search')
  run(0.3)
  stage.apply({ cmd: 'celebrate', sessionId: 's', what: 'commit' }, 0)
  run(0.5)

  const cheering = people().filter(w => w.pose === 'cheer')
  assert.ok(cheering.length >= 4, `${cheering.length} cheering`)
  assert.ok(cheering.every(w => w.label === 'Committed!' && w.bubble?.kind === 'ok'))
  assert.equal(people().find(w => w.label === 'Searching')?.pose === 'cheer', false)
  assert.equal(stage.snapshot().ceo.bubble.text, 'Committed!')
  assert.ok(stage.takeEffects().some(e => e.kind === 'confetti'))
})

test('a push is bigger: more confetti, and a different word', () => {
  const count = what => {
    const { stage, team, run } = withTeam(6)
    team('s')
    stage.apply({ cmd: 'celebrate', sessionId: 's', what }, 0)
    run(0.5)
    return { confetti: stage.takeEffects().filter(e => e.kind === 'confetti').length, word: stage.snapshot().ceo.bubble.text }
  }

  assert.equal(count('push').word, 'Pushed!')
  assert.ok(count('push').confetti > count('commit').confetti)
})

test("a celebration is for one chat's team only, and the team goes back to its own things afterwards", () => {
  const { stage, team, run, people } = withTeam(4)
  team('s')
  team('t')
  stage.apply({ cmd: 'celebrate', sessionId: 's', what: 'commit' }, 0)
  run(0.5)

  assert.equal(people().filter(w => w.pose === 'cheer' && w.sessionId === 't').length, 0)
  run(10)
  assert.equal(people().filter(w => w.pose === 'cheer').length, 0)
})

// --- routes ---

test('people keep to the middle of the stairs, not the sides beside the handrails, on the way to a desk and upstairs with the work', () => {
  const sides = new Set()
  for (const room of layout.rooms.filter(r => r.level === 'stairs'))
    for (let y = room.y; y < room.y + room.h; y++) for (const x of [room.x, room.x + room.w - 1]) sides.add(`${x},${y}`)
  const { stage, team, hire, doStep, run, people } = withTeam(5)
  team('s')
  for (const id of ['a', 'b', 'c', 'd']) {
    hire(id, { kind: 'subagent' }) // new people, who walk in from the gate
    doStep(id, 'arrive')
  }
  stage.apply({ cmd: 'review', sessionId: 's', workers: [] }, 0)
  stage.apply({ cmd: 'submit', sessionId: 's', workers: [] }, 0)
  let onStairs = 0
  for (let i = 0; i < 2400; i++) {
    run(0.1)
    for (const w of [...people(), stage.snapshot().ceo]) {
      const cell = `${Math.round(w.x)},${Math.round(w.y)}`
      if (levelAt(layout, Math.round(w.x), Math.round(w.y)) !== 'stairs') continue
      onStairs++
      assert.equal(sides.has(cell), false, `${w.name} on the side of a stair at ${cell}`)
    }
  }
  assert.ok(onStairs > 50, `${onStairs} moments on the stairs`)
})

test('two workers going the same way take different routes', () => {
  const routes = new Set()
  for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) {
    const { hire, doStep, run, people } = withTeam(0, 0)
    hire(id, { kind: 'subagent' })
    doStep(id, 'arrive')
    const cells = []
    for (let i = 0; i < 1500; i++) {
      run(0.1)
      const w = people().find(p => p.id === id)
      if (w) cells.push(`${Math.round(w.x)},${Math.round(w.y)}`)
    }
    routes.add([...new Set(cells)].join('|'))
  }

  assert.ok(routes.size >= 3, `${routes.size} different routes in 6`)
})

test('the stage says how many of a chat\'s team are on work and how many there are, not counting the manager', () => {
  const { stage, team, hire, doStep, run } = withTeam(5)
  team('s')
  assert.deepEqual(stage.teamOf('s'), { busy: 0, size: 5 })
  hire('a')
  doStep('a', 'search')
  hire('b')
  doStep('b', 'search')
  run(0.2)
  assert.deepEqual(stage.teamOf('s'), { busy: 2, size: 5 })
  assert.deepEqual(stage.teamOf('nobody'), { busy: 0, size: 0 })
})
