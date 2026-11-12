import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createDirector, NAMES } from '../public/director.js'

const S = 'chat1'
const tool = (id, name, path) => ({ type: 'tool', id, sessionId: S, tool: name, path })
const done = (id, ok = true) => ({ type: 'done', id, ok })
const edit = (id, path, isNew = false) => ({ type: 'edit', id, sessionId: S, path, adds: 2, dels: 1, isNew })

// every command the director gives for these events, in order
const run = (events, options) => {
  const director = createDirector({ random: () => 0, ...options })
  return events.flatMap(event => director.feed(event))
}
const steps = commands => commands.filter(c => c.cmd === 'do').map(c => c.step)
const hired = commands => commands.filter(c => c.cmd === 'hire')

test('a file that is read and then edited has one worker: fetch, study, write, hand in', () => {
  const commands = run([tool('t1', 'Read', 'a.js'), done('t1'), tool('t2', 'Edit', 'a.js'), edit('t2', 'a.js'), done('t2')])

  assert.equal(hired(commands).length, 1)
  assert.deepEqual(steps(commands), ['fetch', 'study', 'write', 'handIn'])
})

test('an edit to a file nobody read first still gets fetched and studied', () => {
  const commands = run([tool('t1', 'Edit', 'a.js'), edit('t1', 'a.js'), done('t1')])

  assert.deepEqual(steps(commands), ['fetch', 'study', 'write', 'handIn'])
})

test('a new file is written from scratch: no fetching, no studying', () => {
  const commands = run([tool('t1', 'Write', 'new.js'), edit('t1', 'new.js', true), done('t1')])

  assert.deepEqual(steps(commands), ['write', 'handIn'])
})

test('a finished edit that was never announced is still written before it is handed in', () => {
  const commands = run([tool('t1', 'Write', 'new.js'), done('t1')])

  assert.deepEqual(steps(commands), ['write', 'handIn'])
})

test('every file gets its own worker, however many there are', () => {
  const events = Array.from({ length: 50 }, (_, i) => tool(`t${i}`, 'Edit', `f${i}.js`))
  const workers = hired(run(events)).map(c => c.worker.id)

  assert.equal(workers.length, 50)
  assert.equal(new Set(workers).size, 50)
})

test('an edit that is not applied drops the papers instead of handing them in', () => {
  const commands = run([tool('t1', 'Edit', 'a.js'), done('t1', false)])

  assert.deepEqual(steps(commands), ['fetch', 'study', 'reject'])
})

test('a command goes to the test lab and the worker leaves: passed or failed', () => {
  assert.deepEqual(steps(run([tool('t1', 'Bash'), done('t1')])), ['test', 'pass'])
  assert.deepEqual(steps(run([tool('t1', 'Bash'), done('t1', false)])), ['test', 'fail'])
  assert.equal(run([tool('t1', 'Bash'), done('t1')]).at(-1).cmd, 'fire')
})

test('a search scans the shelves, reports back and the worker leaves', () => {
  const commands = run([tool('t1', 'Grep'), done('t1')])

  assert.deepEqual(steps(commands), ['search', 'report'])
  assert.equal(commands.at(-1).cmd, 'fire')
})

test('a tool the office has no scene for does nothing', () => {
  assert.deepEqual(run([tool('t1', 'TodoWrite'), done('t1')]), [])
})

test('a subagent arrives as its own worker, hands in its report and leaves', () => {
  const commands = run([
    { type: 'agent-start', sessionId: S, agentId: 'a1', agentType: 'Explore' },
    { type: 'agent-stop', sessionId: S, agentId: 'a1', agentType: 'Explore' },
  ])

  assert.equal(hired(commands)[0].worker.kind, 'subagent')
  assert.equal(hired(commands)[0].worker.agentType, 'Explore')
  assert.deepEqual(steps(commands), ['arrive', 'report'])
  assert.equal(commands.at(-1).cmd, 'fire')
})

test('a subagent that was never seen starting changes nothing', () => {
  assert.deepEqual(run([{ type: 'agent-stop', sessionId: S, agentId: 'ghost' }]), [])
})

test('a permission asked is answered by the next thing that happens', () => {
  const director = createDirector({ random: () => 0 })

  assert.equal(director.feed({ type: 'permission', sessionId: S, tool: 'Bash', summary: 'Ran: rm x' })[0].cmd, 'ask')
  assert.equal(director.feed(tool('t1', 'Bash'))[0].cmd, 'answered')
  assert.equal(director.feed(done('t1')).some(c => c.cmd === 'answered'), false)
})

test('the end of a turn: the manager reviews what was handed in and takes it upstairs; everyone leaves', () => {
  const commands = run([
    tool('t1', 'Edit', 'a.js'), edit('t1', 'a.js'), done('t1'),
    tool('t2', 'Edit', 'b.js'), edit('t2', 'b.js'), done('t2'),
    tool('t3', 'Read', 'c.js'), done('t3'),
    { type: 'turn-end', sessionId: S },
  ])
  const end = commands.slice(commands.findIndex(c => c.cmd === 'review'))

  assert.deepEqual(end.map(c => c.cmd), ['review', 'submit', 'fire', 'fire', 'fire'])
  assert.equal(end[0].workers.length, 2) // c.js was only read, so it is not handed in
  assert.deepEqual(end[1].workers, end[0].workers)
})

test('a turn that ended with nothing handed in has no review', () => {
  const commands = run([tool('t1', 'Read', 'a.js'), done('t1'), { type: 'turn-end', sessionId: S }])

  assert.equal(commands.some(c => c.cmd === 'review' || c.cmd === 'submit'), false)
  assert.equal(commands.at(-1).cmd, 'fire')
})

test('a chat does not hand in, or send home, another chat\'s workers', () => {
  const other = { ...edit('t2', 'x.js'), sessionId: 'chat2' }
  const commands = run([
    tool('t1', 'Edit', 'a.js'), edit('t1', 'a.js'), done('t1'),
    { ...tool('t2', 'Edit', 'x.js'), sessionId: 'chat2' }, other, { type: 'done', id: 't2', ok: true },
    { type: 'turn-end', sessionId: S },
  ])

  assert.equal(commands.filter(c => c.cmd === 'fire').length, 1)
  assert.equal(commands.find(c => c.cmd === 'submit').workers.length, 1)
})

test('names are a mix of English and Malay, no two alike while there are enough', () => {
  const events = Array.from({ length: NAMES.length }, (_, i) => tool(`t${i}`, 'Edit', `f${i}.js`))
  const names = hired(run(events)).map(c => c.worker.name)

  assert.equal(new Set(names).size, NAMES.length)
  assert.ok(names.includes('Aisyah') && names.includes('Daniel'))
})

test('more workers than names still works: names repeat', () => {
  const events = Array.from({ length: NAMES.length + 5 }, (_, i) => tool(`t${i}`, 'Edit', `f${i}.js`))

  assert.equal(hired(run(events)).length, NAMES.length + 5)
})

test('every worker has a colour', () => {
  const [{ worker }] = hired(run([tool('t1', 'Edit', 'a.js')]))

  assert.match(worker.color, /^#[0-9a-f]{6}$/)
})

test('a prompt is announced, and events of no interest do nothing', () => {
  assert.deepEqual(run([{ type: 'prompt', sessionId: S }]), [{ cmd: 'prompt', sessionId: S }])
  assert.deepEqual(run([{ type: 'title', sessionId: S, title: 'x' }, { type: 'status', sessionId: S }, { type: 'ready' }]), [])
})
