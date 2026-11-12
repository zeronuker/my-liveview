import assert from 'node:assert/strict'
import { test } from 'node:test'

import { play, toActions } from './mock.js'

const opts = { dir: '/p/demo', tick: 300 }
const kinds = actions => actions.map(a => a.do === 'hook' ? a.body.hook_event_name : a.do)

test('a write is: the tool starts, the file appears, the tool ends', () => {
  const actions = toActions('t', [['write', 'a.js', 3]], opts)

  assert.deepEqual(kinds(actions), ['PreToolUse', 'file', 'wait', 'PostToolUse'])
  assert.equal(actions[0].body.tool_name, 'Write')
  assert.equal(actions[1].content.split('\n').filter(Boolean).length, 3)
  assert.equal(actions[0].body.tool_input.file_path, actions[1].path)
})

test('an edit that works starts from a file that exists; one that does not apply is a failure', () => {
  const good = toActions('t', [['edit', 'a.js']], opts)
  assert.deepEqual(kinds(good), ['file', 'PreToolUse', 'file', 'wait', 'PostToolUse'])
  assert.ok(good[0].content.includes(good[1].body.tool_input.old_string))
  assert.ok(good[2].content.includes(good[1].body.tool_input.new_string))

  const bad = toActions('t', [['editFails', 'a.js']], opts)
  assert.equal(kinds(bad).at(-1), 'PostToolUseFailure')
  assert.equal(bad.some(a => a.do === 'file' && a.content.includes(bad.find(b => b.do === 'hook').body.tool_input.old_string)), false)
})

test('a command, a search and a read are one tool each; a failing command ends as a failure', () => {
  const actions = toActions('t', [['read', 'a.js'], ['grep', 'x'], ['glob', '*.js'], ['bash', 'fail', 'npm test']], opts)
  const tools = actions.filter(a => a.do === 'hook' && a.body.hook_event_name === 'PreToolUse').map(a => a.body.tool_name)

  assert.deepEqual(tools, ['Read', 'Grep', 'Glob', 'Bash'])
  assert.equal(kinds(actions).at(-1), 'PostToolUseFailure')
})

test('the other steps are the hooks they say', () => {
  const actions = toActions('t', [['prompt', 'hi'], ['agentStart', 'a1', 'Explore'], ['agentStop', 'a1', 'Explore'], ['ask', 1000], ['stop']], opts)

  assert.deepEqual(kinds(actions), ['UserPromptSubmit', 'SubagentStart', 'SubagentStop', 'PermissionRequest', 'wait', 'Stop'])
  assert.equal(actions[1].body.agent_id, 'a1')
  assert.equal(actions[4].ms, 1000)
})

test('every tool has its own id, and a chat is named after the scenario and the chat', () => {
  const actions = toActions('t', [['read', 'a.js'], ['chat', 'two'], ['read', 'b.js']], opts)
  const pre = actions.filter(a => a.do === 'hook' && a.body.hook_event_name === 'PreToolUse')

  assert.notEqual(pre[0].body.tool_use_id, pre[1].body.tool_use_id)
  assert.equal(pre[0].body.session_id, 'mock-t-one')
  assert.equal(pre[1].body.session_id, 'mock-t-two')
})

test('pace fast leaves no time between a tool starting and ending', () => {
  const actions = toActions('t', [['pace', 'fast'], ['read', 'a.js'], ['pace', 'normal'], ['read', 'b.js']], opts)

  assert.equal(actions.filter(a => a.do === 'wait').length, 1)
})

test('a step that does not exist is an error, not a silent skip', () => {
  assert.throws(() => toActions('t', [['dance']], opts), /dance/)
})

test('play does each action in order, with waits scaled', async () => {
  const log = []
  const actions = [{ do: 'file', path: 'a', content: 'x' }, { do: 'wait', ms: 1000 }, { do: 'hook', body: { n: 1 } }]
  await play(actions, {
    scale: 0,
    write: (path, content) => log.push(['file', path, content]),
    send: async body => (log.push(['hook', body.n]), true),
    sleep: async ms => log.push(['sleep', ms]),
  })

  assert.deepEqual(log, [['file', 'a', 'x'], ['sleep', 0], ['hook', 1]])
})

test('play stops, saying so, when the server refuses an event', async () => {
  await assert.rejects(play([{ do: 'hook', body: {} }], { send: async () => false, write() {}, sleep: async () => {} }), /refused/)
})
