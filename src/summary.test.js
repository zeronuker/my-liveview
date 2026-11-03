import assert from 'node:assert/strict'
import { test } from 'node:test'

import { summarize, titleOf } from './summary.js'

test('a chat is named by its first line, tidied', () => {
  assert.equal(titleOf('  fix   the login\tbug \nthen the rest'), 'fix the login bug')
  assert.equal(titleOf('\n\n  second line counts\nthird'), 'second line counts')
})

test('a long first message is cut to 50 characters', () => {
  const title = titleOf('x'.repeat(120))

  assert.equal(title.length, 50)
  assert.ok(title.endsWith('…'))
})

test('a slash command or an empty message gives no name', () => {
  assert.equal(titleOf('/liveview on'), null)
  assert.equal(titleOf('   \n  '), null)
  assert.equal(titleOf(undefined), null)
})

test('known tools get a short readable line', () => {
  assert.equal(summarize('Read', { file_path: 'C:\\a\\b.js' }), 'Read C:\\a\\b.js')
  assert.equal(summarize('Grep', { pattern: 'foo', path: 'src' }), 'Search for foo in src')
  assert.equal(summarize('Grep', { pattern: 'foo' }), 'Search for foo')
})

test('a command shows only its first line', () => {
  assert.equal(summarize('Bash', { command: 'npm test\necho secret' }), 'Ran: npm test')
})

test('a long summary is cut to 200 characters', () => {
  const line = summarize('Bash', { command: 'x'.repeat(500) })

  assert.equal(line.length, 200)
  assert.ok(line.endsWith('…'))
})

test('an unknown tool shows its name and never its inputs', () => {
  assert.equal(summarize('mcp__thing__go', { token: 'abc' }), 'mcp__thing__go')
})
