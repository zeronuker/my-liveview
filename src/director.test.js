import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createDirector } from '../public/director.js'
import { NAMES } from '../public/names.js'

const S = 'chat1'
const tool = (id, name, path) => ({ type: 'tool', id, sessionId: S, tool: name, path })
const done = (id, ok = true) => ({ type: 'done', id, ok })
const edit = (id, path, isNew = false) => ({ type: 'edit', id, sessionId: S, path, adds: 2, dels: 1, isNew })

// every command the director gives for these events, in order, leaving out the ones that bring the chat's team in and
// say what the chat is doing (they have tests of their own, further down)
const run = (events, options) => {
  const director = createDirector({ random: () => 0, ...options })
  return events.flatMap(event => director.feed(event)).filter(c => c.cmd !== 'team' && c.cmd !== 'phase')
}
// a director whose chat's team is already in
const warm = () => {
  const director = createDirector({ random: () => 0 })
  director.feed({ type: 'prompt', sessionId: S })
  return director
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
  assert.deepEqual(run([tool('t1', 'NotebookEdit'), done('t1')]), [])
})

test('the todo list and plan mode send a helper to the meeting room table, who says the plan is ready and leaves', () => {
  for (const name of ['TodoWrite', 'EnterPlanMode', 'ExitPlanMode']) {
    const commands = run([tool('t1', name), done('t1')])
    assert.deepEqual(steps(commands), ['huddle', 'planned'], name)
    assert.equal(commands.at(-1).cmd, 'fire')
  }
  assert.deepEqual(steps(run([tool('t1', 'TodoWrite'), done('t1', false)])), ['huddle', 'fail'])
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
  const director = warm()

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

// --- the team: each chat has a manager and a team who live in the office ---

const teamOf = (events, options) => {
  const director = createDirector({ random: () => 0, ...options })
  return events.flatMap(event => director.feed(event)).filter(c => c.cmd === 'team')
}

test('the first event from a chat brings its team in, once: a manager, 5 to 8 workers, and as many again in reserve', () => {
  const [first, ...rest] = teamOf([{ type: 'prompt', sessionId: S }, tool('t1', 'Read', 'a.js'), done('t1')])

  assert.equal(rest.length, 0)
  assert.equal(first.sessionId, S)
  assert.equal(first.manager.kind, 'manager')
  assert.equal(first.workers.length, 5) // a random of 0 is the smallest team
  assert.equal(first.reserve.length, 5)
  assert.ok(first.workers.every(w => w.kind === 'worker' && w.sessionId === S))
  assert.equal(teamOf([{ type: 'prompt', sessionId: S }], { random: () => 0.99 })[0].workers.length, 8)
})

test('the first event of any kind starts the team, even one nobody draws', () => {
  assert.equal(teamOf([{ type: 'title', sessionId: S, title: 'x' }]).length, 1)
  assert.equal(teamOf([{ type: 'ready' }]).length, 0) // no chat
})

test('every chat has a team of its own', () => {
  const teams = teamOf([{ type: 'prompt', sessionId: 'a' }, { type: 'prompt', sessionId: 'b' }])

  assert.deepEqual(teams.map(t => t.sessionId), ['a', 'b'])
  assert.notEqual(teams[0].manager.id, teams[1].manager.id)
})

test('names come from Malay, English, Indian and Chinese: a Chinese name is two words, the others one; nobody in a team shares a name', () => {
  const words = name => name.split(' ').length
  assert.ok(NAMES.includes('Aisyah') && NAMES.includes('Daniel') && NAMES.includes('Priya') && NAMES.includes('Wen Shen') && NAMES.includes('Wai Kit') && NAMES.includes('Kim Wui'))
  assert.ok(NAMES.every(name => words(name) <= 2))
  assert.ok(NAMES.filter(name => words(name) === 2).length >= 20)
  assert.equal(new Set(NAMES).size, NAMES.length)

  const [team] = teamOf([{ type: 'prompt', sessionId: S }], { random: () => 0.99 })
  const names = [...team.workers, ...team.reserve].map(w => w.name)
  assert.equal(new Set(names).size, 16)
})

test('a chat that has been quiet for good sends its lanes home and then its team, and the names are free for the next chat', () => {
  const director = createDirector({ random: () => 0 })
  const [{ workers }] = director.feed({ type: 'prompt', sessionId: 'a' }).filter(c => c.cmd === 'team')
  director.feed({ ...tool('t1', 'Read', 'a.js'), sessionId: 'a' })
  const out = director.feed({ type: 'team-leave', sessionId: 'a' })

  assert.deepEqual(out.map(c => c.cmd), ['fire', 'leave'])
  assert.deepEqual(director.feed({ type: 'team-leave', sessionId: 'a' }), []) // nothing left to send
  const [second] = director.feed({ type: 'prompt', sessionId: 'b' }).filter(c => c.cmd === 'team')
  assert.deepEqual(second.workers.map(w => w.name).sort(), workers.map(w => w.name).sort()) // with a random of 0 the first free names are taken again
})

test('a chat that is heard from again after its team left gets a new team', () => {
  const director = createDirector({ random: () => 0 })
  director.feed({ type: 'prompt', sessionId: 'a' })
  director.feed({ type: 'team-leave', sessionId: 'a' })

  assert.equal(director.feed({ type: 'prompt', sessionId: 'a' })[0].cmd, 'team')
})

test('a session that ends sends the team home; /clear does not', () => {
  assert.ok(run([{ type: 'prompt', sessionId: S }, life('end', 'other')]).some(c => c.cmd === 'leave'))
  assert.equal(run([{ type: 'prompt', sessionId: S }, life('end', 'clear')]).some(c => c.cmd === 'leave'), false)
})

test('the end of a turn sends the lanes home but keeps the team', () => {
  const commands = run([tool('t1', 'Read', 'a.js'), done('t1'), { type: 'turn-end', sessionId: S }])

  assert.equal(commands.some(c => c.cmd === 'leave'), false)
})

test('every worker has a colour', () => {
  const [{ worker }] = hired(run([tool('t1', 'Edit', 'a.js')]))

  assert.match(worker.color, /^#[0-9a-f]{6}$/)
})

test('a prompt is announced, and events of no interest do nothing', () => {
  assert.deepEqual(run([{ type: 'prompt', sessionId: S }]), [{ cmd: 'prompt', sessionId: S }])
  assert.deepEqual(run([{ type: 'title', sessionId: S, title: 'x' }, { type: 'status', sessionId: S }, { type: 'ready' }]), [])
})

test('a turn is quiet when people are in the office, nothing is running and no permission is waiting', () => {
  const director = warm()
  assert.equal(director.isQuiet(S), false) // an empty office is not waiting on anything

  for (const e of [tool('t1', 'Edit', 'a.js'), edit('t1', 'a.js'), done('t1')]) director.feed(e)
  assert.equal(director.isQuiet(S), true)
  assert.equal(director.isQuiet('chat2'), false)

  director.feed({ type: 'turn-end', sessionId: S })
  assert.equal(director.isQuiet(S), false)
})

test('a tool still running, a subagent still working or a permission still waiting is not quiet', () => {
  const running = warm()
  running.feed(tool('t1', 'Bash'))
  assert.equal(running.isQuiet(S), false)

  const helper = warm()
  helper.feed({ type: 'agent-start', sessionId: S, agentId: 'a1', agentType: 'Explore' })
  assert.equal(helper.isQuiet(S), false)

  const asked = warm()
  for (const e of [tool('t1', 'Read', 'a.js'), done('t1'), { type: 'permission', sessionId: S, tool: 'Bash' }]) asked.feed(e)
  assert.equal(asked.isQuiet(S), false)
  asked.feed({ type: 'prompt', sessionId: S }) // answered
  assert.equal(asked.isQuiet(S), true)
})

test('an MCP tool is an errand outside: call, then report; a failure is unavailable', () => {
  const ok = run([tool('m1', 'mcp__github__search_repositories'), done('m1')])
  assert.deepEqual(steps(ok), ['call', 'report'])
  assert.equal(ok.find(c => c.step === 'call').server, 'github')
  assert.equal(ok.at(-1).cmd, 'fire')

  const failed = run([tool('m1', 'mcp__github__search_repositories'), done('m1', false)])
  assert.deepEqual(steps(failed), ['call', 'unavailable'])
})

test('an API error ends the turn with the reason, and what was handed in is not submitted', () => {
  const commands = run([tool('t1', 'Write', 'a.js'), edit('t1', 'a.js', true), done('t1'), { type: 'turn-fail', sessionId: S, reason: 'rate_limit' }])

  assert.equal(commands.find(c => c.cmd === 'fail').label, 'Rate limit')
  assert.equal(commands.some(c => c.cmd === 'submit' || c.cmd === 'review'), false)
  assert.equal(commands.filter(c => c.cmd === 'fire').length, 1)
})

test('an API error of a kind nobody planned for is just an API error', () => {
  const commands = run([{ type: 'turn-fail', sessionId: S, reason: 'something_new' }])

  assert.equal(commands[0].label, 'API error')
})

test('a compaction starts and ends; anything else that happens ends it too; it is not a quiet turn', () => {
  const director = warm()
  director.feed(tool('t1', 'Read', 'a.js'))
  director.feed(done('t1'))
  assert.deepEqual(director.feed({ type: 'compact', sessionId: S, phase: 'start' }), [{ cmd: 'compact', sessionId: S }])
  assert.equal(director.isQuiet(S), false)
  assert.deepEqual(director.feed({ type: 'compact', sessionId: S, phase: 'end' }), [{ cmd: 'compacted', sessionId: S }])
  assert.deepEqual(director.feed({ type: 'compact', sessionId: S, phase: 'end' }), []) // nothing was going on

  director.feed({ type: 'compact', sessionId: S, phase: 'start' })
  assert.ok(director.feed(tool('t2', 'Read', 'b.js')).some(c => c.cmd === 'compacted'))
})

test('a refused tool is said once, for the chat it happened in', () => {
  const commands = run([{ type: 'denied', sessionId: S, tool: 'Bash' }])

  assert.deepEqual(commands, [{ cmd: 'denied', sessionId: S, tool: 'Bash' }])
})

const life = (what, detail = '') => ({ type: 'life', what, detail, sessionId: S })

test('a session that starts or resumes is said over the CEO; a start after compaction is not', () => {
  assert.equal(run([life('start', 'startup')])[0].text, 'New session')
  assert.equal(run([life('start', 'resume')])[0].text, 'Resumed')
  assert.deepEqual(run([life('start', 'compact')]), [])
})

test('a session that ends sends everyone home and is said; /clear is said once, as a fresh start', () => {
  const ended = run([tool('t1', 'Read', 'a.js'), life('end', 'other')])
  assert.ok(ended.some(c => c.cmd === 'note' && c.text === 'Session ended'))
  assert.ok(ended.some(c => c.cmd === 'fire'))

  const cleared = run([tool('t1', 'Read', 'a.js'), life('end', 'clear'), life('start', 'clear')])
  assert.deepEqual(cleared.filter(c => c.cmd === 'note').map(c => c.text), ['Fresh start'])
  assert.ok(cleared.some(c => c.cmd === 'clear'))
})

test('a model, a folder and an added folder are said by the manager, with their names when they came', () => {
  const texts = commands => commands.filter(c => c.cmd === 'note').map(c => `${c.who}: ${c.text}`)

  assert.deepEqual(texts(run([life('model', 'opus'), life('cwd', 'api'), life('folder', 'shared')])), ['manager: Model: opus', 'manager: Now in api', 'manager: Added shared'])
  assert.deepEqual(texts(run([life('model'), life('cwd'), life('folder')])), ['manager: Model changed', 'manager: Folder changed', 'manager: Folder added'])
})

test('memos that follow each other are one memo; something else in between makes the next a new one', () => {
  const memos = commands => commands.filter(c => c.cmd === 'memo').length

  assert.equal(memos(run([life('memo'), life('memo'), life('memo')])), 1)
  assert.equal(memos(run([life('memo'), { type: 'prompt', sessionId: S }, life('memo')])), 2)
})

test('web tools are errands out the door with their own words; a failed one is unavailable', () => {
  const search = run([tool('w1', 'WebSearch'), done('w1')])
  assert.deepEqual(steps(search), ['call', 'report'])
  assert.equal(search.find(c => c.step === 'call').label, 'Searching the web')

  assert.equal(run([tool('w1', 'WebFetch')])[1].label, 'Reading a web page')
  assert.deepEqual(steps(run([tool('w1', 'WebFetch'), done('w1', false)])), ['call', 'unavailable'])
})

test('the code check is a trip to the shelves, with its own words', () => {
  const commands = run([tool('l1', 'LSP'), done('l1')])

  assert.deepEqual(steps(commands), ['search', 'report'])
  assert.equal(commands.find(c => c.step === 'search').label, 'Checking the code')
})

test("a question from Claude waits at the CEO's door until the tool is over", () => {
  const director = warm()
  const asked = director.feed(tool('q1', 'AskUserQuestion'))

  assert.deepEqual(asked, [{ cmd: 'ask', sessionId: S, tool: 'AskUserQuestion', label: 'Has a question' }])
  assert.equal(director.isQuiet(S), false)
  assert.deepEqual(director.feed(done('q1')), [{ cmd: 'answered', sessionId: S }])
})

test('a message to a helper, a batch, a task, a waiting notice and a command are notes', () => {
  const texts = commands => commands.filter(c => c.cmd === 'note').map(c => `${c.who}: ${c.text}`)

  assert.deepEqual(texts(run([tool('s1', 'SendMessage')])), ['manager: Message sent'])
  assert.deepEqual(
    texts(run([life('batch'), life('task-new'), life('task-done'), life('teammate'), life('idle'), life('command', 'review'), life('command')])),
    ['manager: Batch finished', 'manager: New task', 'manager: Task done', 'manager: Teammate idle', 'manager: Waiting for you', 'ceo: /review', 'ceo: Command'],
  )
})

// --- phases: what the chat is doing, so the office can match it ---

const phasesOf = events => {
  const director = createDirector({ random: () => 0 })
  return events.flatMap(event => director.feed(event)).filter(c => c.cmd === 'phase').map(c => c.phase)
}

test('a prompt is a chat; the first tool is work; the end of the turn is waiting for the person', () => {
  assert.deepEqual(phasesOf([{ type: 'prompt', sessionId: S }]), []) // a new chat starts as a chat
  assert.deepEqual(phasesOf([{ type: 'prompt', sessionId: S }, tool('t1', 'Read', 'a.js'), done('t1'), tool('t2', 'Grep'), done('t2'), { type: 'turn-end', sessionId: S }, { type: 'prompt', sessionId: S }]), ['working', 'waiting', 'chat'])
})

test('a chat that starts with a tool, or ends in an error or a long wait, has the phase to match', () => {
  assert.deepEqual(phasesOf([tool('t1', 'Bash')]), ['working'])
  assert.deepEqual(phasesOf([tool('t1', 'Bash'), { type: 'turn-fail', sessionId: S, reason: 'rate_limit' }]), ['working', 'waiting'])
  assert.deepEqual(phasesOf([tool('t1', 'Bash'), life('idle')]), ['working', 'waiting'])
})

test('plan mode is planning from EnterPlanMode until ExitPlanMode is done, work inside it included', () => {
  const events = [tool('p1', 'EnterPlanMode'), done('p1'), tool('t1', 'Read', 'a.js'), done('t1'), tool('p2', 'ExitPlanMode'), done('p2'), tool('t2', 'Edit', 'a.js'), edit('t2', 'a.js'), done('t2')]

  assert.deepEqual(phasesOf(events), ['planning', 'working'])
})

test('a question from Claude is not work, and a phase is only said when it changes', () => {
  assert.deepEqual(phasesOf([tool('q1', 'AskUserQuestion'), done('q1')]), [])
  assert.deepEqual(phasesOf([tool('t1', 'Read', 'a.js'), tool('t2', 'Read', 'b.js'), tool('t3', 'Bash')]), ['working'])
})

test('a chat that has left has no phase, and a new one starts as a chat again', () => {
  const director = createDirector({ random: () => 0 })
  director.feed(tool('t1', 'Bash'))
  director.feed({ type: 'team-leave', sessionId: S })

  assert.deepEqual(director.feed({ type: 'prompt', sessionId: S }).filter(c => c.cmd === 'phase'), [])
})

test('a commit or push that went through is celebrated for the chat; one that failed, and a plain command, are not', () => {
  const git = (id, kind) => ({ ...tool(id, 'Bash'), git: kind })
  const celebrations = events => run(events).filter(c => c.cmd === 'celebrate')

  assert.deepEqual(celebrations([git('t1', 'commit'), done('t1')]), [{ cmd: 'celebrate', sessionId: S, what: 'commit' }])
  assert.deepEqual(celebrations([git('t1', 'push'), done('t1')]), [{ cmd: 'celebrate', sessionId: S, what: 'push' }])
  assert.deepEqual(celebrations([git('t1', 'push'), done('t1', false)]), [])
  assert.deepEqual(celebrations([tool('t1', 'Bash'), done('t1')]), [])
  assert.deepEqual(celebrations([git('t1', 'commit')]), []) // not until it is done
})

test('the director can say what a chat is doing and whether it is waiting on a permission, for the chat\'s card', () => {
  const director = createDirector({ random: () => 0 })
  assert.equal(director.phaseOf(S), null)
  director.feed(tool('t1', 'Bash'))
  assert.equal(director.phaseOf(S), 'working')
  assert.equal(director.isAsking(S), false)
  director.feed({ type: 'permission', sessionId: S, tool: 'Bash' })
  assert.equal(director.isAsking(S), true)
  director.feed({ type: 'turn-end', sessionId: S })
  assert.equal(director.phaseOf(S), 'waiting')
})
