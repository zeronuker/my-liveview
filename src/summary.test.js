import assert from 'node:assert/strict'
import { test } from 'node:test'

import { summarize } from './summary.js'

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
