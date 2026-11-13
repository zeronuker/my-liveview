import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { createDirector } from '../public/director.js'
import { buildStudio } from '../public/studio.js'
import { createStage } from '../public/stage.js'
import { play, toActions } from './mock.js'
import { SCENARIOS } from './scenarios.js'

// Every scenario is played at a real server on a spare port, the events that come
// out of its stream go through the director and the stage, and the office has to
// end up empty. The last tests say what the scenarios between them must cover.

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = 4797
const base = `http://127.0.0.1:${PORT}`
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const layout = buildStudio()

let server
let tmp
const results = {}

// what the server publishes while a scenario is played
const collect = async (name, token) => {
  const events = []
  let text = ''
  const response = await fetch(`${base}/stream`)
  ;(async () => {
    for await (const chunk of response.body) text += new TextDecoder().decode(chunk)
  })().catch(() => {})
  for (let i = 0; i < 50 && !text.includes('"type":"ready"'); i++) await sleep(20)
  const mark = text.length

  const send = body =>
    fetch(`${base}/event`, { method: 'POST', headers: { 'x-liveview-token': token, 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(res => res.ok)
  const write = (file, content) => {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, content)
  }
  await play(toActions(name, SCENARIOS[name].steps, { dir: path.join(tmp, name) }), { scale: 0, write, send, sleep })

  // done when nothing new has come for a moment
  for (let last = -1; last !== text.length; ) {
    last = text.length
    await sleep(250)
  }
  await response.body.cancel().catch(() => {})
  for (const line of text.slice(mark).split('\n')) if (line.startsWith('data: ')) events.push(JSON.parse(line.slice(6)))
  return events
}

// the Office's side of it: the director and the stage, until everyone has gone home
const stageIt = (name, events) => {
  const director = createDirector()
  const stage = createStage({ layout })
  stage.tick(0)
  const commands = []
  for (const event of events)
    for (const cmd of director.feed(event)) {
      commands.push(cmd)
      stage.apply(cmd, 0)
    }
  const sessions = [...new Set(events.map(e => e.sessionId).filter(Boolean))]
  const wasQuiet = sessions.some(id => director.isQuiet(id))
  if (SCENARIOS[name].ends === 'quiet')
    for (const sessionId of sessions) for (const cmd of director.feed({ type: 'turn-end', sessionId })) stage.apply(cmd, 0)
  stage.skip()
  const { papers, stack } = { papers: stage.snapshot().ceo.papers, stack: stage.snapshot().stack }
  // the chats go quiet for good: every team goes home, and the Office has to be empty
  for (const sessionId of sessions) for (const cmd of director.feed({ type: 'team-leave', sessionId })) {
    commands.push(cmd)
    stage.apply(cmd, 0)
  }
  stage.skip()
  return { commands, wasQuiet, left: stage.snapshot().workers, idle: stage.isIdle(), papers, stack }
}

before(async () => {
  server = spawn(process.execPath, [path.join(root, 'src', 'server.js')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' })
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lv-mock-'))
  for (let i = 0; i < 40; i++) {
    if (await fetch(`${base}/`).then(() => true, () => false)) break
    await sleep(100)
  }
  const token = fs.readFileSync(path.join(root, '.token'), 'utf8').trim()
  for (const name of Object.keys(SCENARIOS)) {
    const events = await collect(name, token)
    results[name] = { events, ...stageIt(name, events) }
  }
})

after(async () => {
  server.kill()
  await once(server, 'exit')
  fs.rmSync(tmp, { recursive: true, force: true })
})

for (const [name, scenario] of Object.entries(SCENARIOS)) {
  test(`scenario ${name}: it plays, and at the end the office is empty`, () => {
    const result = results[name]

    assert.ok(result.events.length > 0, 'the server published events')
    assert.deepEqual(result.left.map(w => w.name), [], 'nobody is left in the office')
    // an interrupted turn is empty only because the Office noticed it was quiet
    if (scenario.ends === 'quiet') assert.equal(result.wasQuiet, true, 'the turn went quiet')
  })
}

test('what is written is handed to the CEO: the writing scenarios end with papers upstairs', () => {
  for (const name of ['full', 'failing-tests', 'burst-30', 'interrupted', 'two-chats']) assert.ok(results[name].papers > 0, name)
  assert.equal(results['reading-only'].papers, 0)
})

test('an API error ends the turn: the manager says why and nothing goes upstairs', () => {
  const { commands, papers } = results['api-error']

  assert.equal(commands.find(c => c.cmd === 'fail').label, 'Rate limit')
  assert.equal(papers, 0)
})

test("a question from Claude is a wait at the CEO's door that ends when it is answered", () => {
  const cmds = results.question.commands

  assert.equal(cmds.find(c => c.cmd === 'ask' && c.label === 'Has a question').tool, 'AskUserQuestion')
  assert.ok(cmds.some(c => c.cmd === 'answered'))
})

test('/clear sweeps away what was on the tray: nothing is left and nothing went upstairs', () => {
  assert.equal(results.clear.stack, 0)
  assert.equal(results.clear.papers, 0)
})

test('a compaction is a trip to the file room, and it ends', () => {
  const cmds = results.compaction.commands.map(c => c.cmd)

  assert.ok(cmds.indexOf('compact') < cmds.indexOf('compacted'))
})

test('the crowd scenario has more workers than there are desks', () => {
  const hired = results['burst-30'].commands.filter(c => c.cmd === 'hire').length

  assert.ok(hired > layout.spots.desks.length, `${hired} workers for ${layout.spots.desks.length} desks`)
})

// What the scenarios must between them cover. A new event, tool, command or
// step belongs in these lists, and in a scenario.
const all = pick => new Set(Object.values(results).flatMap(r => pick(r)))

test('coverage: every kind of event the server sends to the Office is in some scenario', () => {
  const seen = all(r => r.events.map(e => e.type))
  for (const type of ['tool', 'edit', 'done', 'turn-end', 'agent-start', 'agent-stop', 'permission', 'prompt', 'turn-fail', 'compact', 'denied', 'life'])
    assert.ok(seen.has(type), type)
})

test('coverage: every tool the Office has a scene for is in some scenario', () => {
  const seen = all(r => r.events.filter(e => e.type === 'tool').map(e => e.tool))
  for (const tool of ['Read', 'Edit', 'Write', 'Bash', 'Grep', 'Glob']) assert.ok(seen.has(tool), tool)
  assert.ok([...seen].some(tool => tool.startsWith('mcp__')), 'an MCP tool')
  for (const tool of ['WebSearch', 'WebFetch', 'LSP', 'AskUserQuestion', 'SendMessage', 'TodoWrite', 'EnterPlanMode', 'ExitPlanMode']) assert.ok(seen.has(tool), tool)
})

test('coverage: a tool that fails, an edit that does not apply and a test that passes are in some scenario', () => {
  const failed = all(r => r.events.filter(e => e.type === 'done' && !e.ok).map(() => 'failed'))
  assert.ok(failed.has('failed'))
  const steps = all(r => r.commands.filter(c => c.cmd === 'do').map(c => c.step))
  for (const step of ['reject', 'fail', 'pass']) assert.ok(steps.has(step), step)
})

test('coverage: every kind of session life the Office knows is in some scenario', () => {
  const seen = all(r => r.events.filter(e => e.type === 'life').map(e => e.what))
  for (const what of ['start', 'end', 'model', 'cwd', 'folder', 'memo', 'batch', 'task-new', 'task-done', 'teammate', 'command', 'idle']) assert.ok(seen.has(what), what)
})

test('coverage: every command the director gives and every step the stage plays is in some scenario', () => {
  const commands = all(r => r.commands.map(c => c.cmd))
  for (const cmd of ['team', 'leave', 'celebrate', 'hire', 'do', 'fire', 'review', 'submit', 'ask', 'answered', 'prompt', 'fail', 'compact', 'compacted', 'denied', 'note', 'memo', 'clear'])
    assert.ok(commands.has(cmd), cmd)
  const steps = all(r => r.commands.filter(c => c.cmd === 'do').map(c => c.step))
  for (const step of ['arrive', 'fetch', 'study', 'write', 'handIn', 'report', 'reject', 'test', 'search', 'pass', 'fail', 'call', 'unavailable', 'huddle', 'planned'])
    assert.ok(steps.has(step), step)
})

test('the busy office is a dozen chats, with helpers, an API error and work handed to the CEO', () => {
  const { events, commands, papers } = results['busy-office']

  assert.equal(new Set(events.map(e => e.sessionId).filter(Boolean)).size, 12)
  assert.ok(commands.some(c => c.cmd === 'fail'))
  assert.ok(commands.some(c => c.step === 'arrive'))
  assert.ok(papers > 0)
})
