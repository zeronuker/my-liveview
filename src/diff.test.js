import assert from 'node:assert/strict'
import { test } from 'node:test'

import { applyEdit, makeRows } from './diff.js'

const kinds = rows => rows.map(r => r.kind).join(' ')

test('a replacement shows the old line red and the new lines green', () => {
  const rows = makeRows('a\nb\nc', 'a\nX\nY\nc')

  assert.equal(kinds(rows), 'ctx del add add ctx')
  assert.deepEqual(
    rows.filter(r => r.kind === 'add').map(r => [r.n, r.text]),
    [[2, 'X'], [3, 'Y']],
  )
  assert.deepEqual(rows.find(r => r.kind === 'del'), { kind: 'del', n: 2, text: 'b' })
})

test('a new file is all additions', () => {
  const rows = makeRows('', 'one\ntwo')

  assert.equal(kinds(rows), 'add add')
})

test('a final newline does not make an empty last row', () => {
  const rows = makeRows('', 'one\ntwo\n')

  assert.deepEqual(rows.map(r => r.text), ['one', 'two'])
})

test('an edit that changes nothing has no changed rows', () => {
  const rows = makeRows('same\ntext', 'same\ntext')

  assert.equal(rows.some(r => r.kind === 'add' || r.kind === 'del'), false)
})

test('a change deep in a long file keeps 40 lines of context and a gap note', () => {
  const lines = Array.from({ length: 200 }, (_, i) => `l${i + 1}`)
  const changed = [...lines.slice(0, 100), 'CHANGED', ...lines.slice(101)]
  const rows = makeRows(lines.join('\n'), changed.join('\n'))

  assert.equal(rows[0].text, '... 60 lines above')
  assert.equal(rows.at(-1).text, '... 59 lines below')
  assert.equal(rows.filter(r => r.kind === 'ctx').length, 80)
})

test('applyEdit follows the Edit and Write tools, and refuses a missing match', () => {
  assert.equal(applyEdit('a b a', 'Write', { content: 'new' }), 'new')
  assert.equal(
    applyEdit('a b a', 'Edit', { old_string: 'a', new_string: 'z' }),
    'z b a',
  )
  assert.equal(
    applyEdit('a b a', 'Edit', { old_string: 'a', new_string: 'z', replace_all: true }),
    'z b z',
  )
  assert.equal(applyEdit('a', 'Edit', { old_string: 'q', new_string: 'z' }), null)
  assert.equal(applyEdit('a', 'Edit', { old_string: 'a', new_string: '$&' }), '$&')
})
