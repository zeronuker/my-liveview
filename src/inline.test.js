import assert from 'node:assert/strict'
import { test } from 'node:test'

import { inlineDiff, withInlineDiff } from '../public/inline.js'

const changed = parts => parts.filter(p => p.isChanged).map(p => p.text)

test('a changed word is the only part brightened, on both lines', () => {
  const diff = inlineDiff('const LIMIT = 50', 'const LIMIT = 75')

  assert.deepEqual(changed(diff.before), ['50'])
  assert.deepEqual(changed(diff.after), ['75'])
  assert.equal(diff.before.map(p => p.text).join(''), 'const LIMIT = 50')
  assert.equal(diff.after.map(p => p.text).join(''), 'const LIMIT = 75')
})

test('a word added in the middle shows as the change, nothing on the old line', () => {
  const diff = inlineDiff('if (ok) run()', 'if (ok && ready) run()')

  assert.deepEqual(changed(diff.before), [])
  assert.deepEqual(changed(diff.after), [' && ready'])
})

test('a line with almost nothing in common is a rewrite, so no part is brightened', () => {
  assert.equal(inlineDiff('alpha beta gamma delta', 'one two three four five six'), null)
})

test('the pieces always join back into each line', () => {
  for (const [a, b] of [['a b c', 'a x c'], ['  foo(1)', '  foo(1, 2)'], ['x', 'xy'], ['', 'new']]) {
    const diff = inlineDiff(a, b)
    if (!diff) continue
    assert.equal(diff.before.map(p => p.text).join(''), a)
    assert.equal(diff.after.map(p => p.text).join(''), b)
  }
})

test('withInlineDiff pairs the first removed line with the first added, and so on', () => {
  const rows = [
    { kind: 'ctx', n: 1, text: 'keep' },
    { kind: 'del', n: 2, text: 'let a = 1' },
    { kind: 'del', n: 3, text: 'let b = 2' },
    { kind: 'add', n: 2, text: 'let a = 9' },
    { kind: 'add', n: 3, text: 'let b = 8' },
    { kind: 'add', n: 4, text: 'extra line' },
  ]
  const out = withInlineDiff(rows)

  assert.deepEqual(changed(out[1].parts), ['1'])
  assert.deepEqual(changed(out[3].parts), ['9'])
  assert.deepEqual(changed(out[2].parts), ['2'])
  assert.deepEqual(changed(out[4].parts), ['8'])
  assert.equal(out[5].parts, undefined) // nothing to pair with
  assert.equal(out[0].parts, undefined)
})

test('withInlineDiff leaves the rows it was given alone', () => {
  const rows = [{ kind: 'del', n: 1, text: 'a 1' }, { kind: 'add', n: 1, text: 'a 2' }]
  const copy = structuredClone(rows)
  withInlineDiff(rows)

  assert.deepEqual(rows, copy)
})
