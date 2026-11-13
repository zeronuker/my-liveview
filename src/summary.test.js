import assert from 'node:assert/strict'
import { test } from 'node:test'

import { gitKind, summarize, titleOf } from './summary.js'

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

test('a shell command is told to be a git commit or push, and nothing else about it', () => {
  const kind = command => gitKind('Bash', { command })

  assert.equal(kind('git commit -m "x"'), 'commit')
  assert.equal(kind('git push'), 'push')
  assert.equal(kind('git push --force-with-lease=main origin main'), 'push')
  assert.equal(kind('git -C ../repo commit -am x'), 'commit')
  assert.equal(kind('git add . && git commit -m x'), 'commit')
  assert.equal(kind('git commit -m x && git push origin main'), 'push') // both: the push is the bigger news
  assert.equal(kind('git status'), null)
  assert.equal(kind('git pushed'), null)
  assert.equal(kind('npm test'), null)
  assert.equal(kind(undefined), null)
  assert.equal(gitKind('Read', { command: 'git push' }), null) // only a shell command
})
