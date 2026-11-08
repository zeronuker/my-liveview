import assert from 'node:assert/strict'
import { test } from 'node:test'

import { makeRows } from './diff.js'
import { linesOf, showText, wholeRows } from '../public/whole.js'

const kinds = rows => rows.map(r => r.kind).join(' ')
const keptLines = rows => rows.filter(r => r.kind !== 'del').map(r => r.text)

test('a middle edit shows every line, the change where it happened', () => {
  const before = Array.from({ length: 200 }, (_, i) => `l${i + 1}`).join('\n')
  const after = before.replace('l100\nl101', 'l100 NEW\nextra\nl101')
  const windowRows = makeRows(before, after)
  const whole = wholeRows(windowRows, after)

  assert.equal(windowRows[0].kind, 'gap') // the window hides the top
  assert.equal(whole.length, 200 + 1 + 1) // every line of the new file, plus the removed one
  assert.deepEqual(keptLines(whole), linesOf(after))
  assert.equal(kinds(whole.slice(98, 103)), 'ctx del add add ctx')
  assert.equal(whole[0].n, 1)
  assert.equal(whole.at(-1).n, 201)
})

test('a new file is every line added', () => {
  const after = 'one\ntwo\nthree\n'
  const whole = wholeRows(makeRows('', after), after)

  assert.equal(kinds(whole), 'add add add')
  assert.deepEqual(keptLines(whole), ['one', 'two', 'three'])
})

test('a pure deletion shows the removed lines and the rest of the file', () => {
  const before = 'a\nb\nc\nd\ne'
  const after = 'a\ne'
  const whole = wholeRows(makeRows(before, after), after)

  assert.equal(kinds(whole), 'ctx del del del ctx')
  assert.deepEqual(keptLines(whole), ['a', 'e'])
  assert.equal(whole.at(-1).n, 2)
})

test('a file that no longer matches the edit gives null, so the changed part stays', () => {
  const before = 'a\nb\nc'
  const after = 'a\nB\nc'
  const rows = makeRows(before, after)

  assert.equal(wholeRows(rows, 'a\nsomething else\nc'), null)
  assert.equal(wholeRows(rows, 'a'), null)
})

test('an edit that was cut short is not rebuilt', () => {
  const before = Array.from({ length: 3000 }, (_, i) => `old ${i}`).join('\n')
  const after = Array.from({ length: 3000 }, (_, i) => `new ${i}`).join('\n')

  assert.equal(wholeRows(makeRows(before, after), after), null)
})

test('an edit that changes nothing has no whole view', () => {
  assert.equal(wholeRows(makeRows('same', 'same'), 'same'), null)
})

test('a line is shown without its carriage return and with two-space tabs', () => {
  assert.equal(showText('\tif (x) {\r'), '  if (x) {')
  const after = 'a\r\n\tb\r\n'
  const whole = wholeRows(makeRows('', after), after)

  assert.deepEqual(keptLines(whole), ['a', '  b'])
})
