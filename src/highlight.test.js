import assert from 'node:assert/strict'
import { test } from 'node:test'

import { highlight, langOf, segments } from '../public/highlight.js'

const classes = parts => parts.filter(p => p.cls).map(p => [p.text, p.cls])

test('js: keywords, strings, numbers and comments get a class', () => {
  const parts = highlight("const a = 'x' + 42 // note", 'js')

  assert.deepEqual(classes(parts), [
    ['const', 'kw'],
    ["'x'", 'str'],
    ['42', 'num'],
    ['// note', 'com'],
  ])
})

test('js: a function or method called is colored by its name', () => {
  assert.deepEqual(classes(highlight('const x = fetchData(1) + db.write(x)', 'js')), [
    ['const', 'kw'],
    ['fetchData', 'fn'],
    ['1', 'num'],
    ['write', 'fn'],
  ])
})

test('js: a keyword followed by a bracket is still a keyword, not a call', () => {
  assert.deepEqual(classes(highlight('if (a) return typeof(b)', 'js')), [
    ['if', 'kw'],
    ['return', 'kw'],
    ['typeof', 'kw'],
  ])
})

test('js: true, false and null are colored like numbers', () => {
  assert.deepEqual(classes(highlight('ok = true || null', 'js')), [
    ['true', 'num'],
    ['null', 'num'],
  ])
})

test('js: a word that merely contains a keyword is left plain', () => {
  assert.deepEqual(classes(highlight('constant = interface1', 'js')), [])
})

test('js: a // inside a string stays part of the string', () => {
  assert.deepEqual(classes(highlight('const u = "http://x.dev"', 'js')), [
    ['const', 'kw'],
    ['"http://x.dev"', 'str'],
  ])
})

test('json: a key is told apart from a string value', () => {
  assert.deepEqual(classes(highlight('"a": "b", "n": 3, "ok": true', 'json')), [
    ['"a"', 'key'],
    ['"b"', 'str'],
    ['"n"', 'key'],
    ['3', 'num'],
    ['"ok"', 'key'],
    ['true', 'num'],
  ])
})

test('html: tags, attributes and their values', () => {
  assert.deepEqual(classes(highlight('<a href="x">hi</a>', 'html')), [
    ['<a', 'kw'],
    ['href', 'key'],
    ['"x"', 'str'],
    ['>', 'kw'],
    ['</a', 'kw'],
    ['>', 'kw'],
  ])
})

test('css: at-rules, properties and numbers', () => {
  assert.deepEqual(classes(highlight('  margin: 8px; /* gap */', 'css')), [
    ['margin', 'key'],
    ['8px', 'num'],
    ['/* gap */', 'com'],
  ])
})

test('an unknown language comes back as one plain piece', () => {
  assert.deepEqual(highlight('anything at all', null), [{ text: 'anything at all' }])
})

test('the pieces always join back into the original line', () => {
  const lines = ["const a = 'x' // y", '"k": [1, 2.5, null]', '<p class="a">t</p>', '@media (x) { a: #fff }', '']
  for (const lang of ['js', 'json', 'css', 'html', null])
    for (const line of lines)
      assert.equal(highlight(line, lang).map(p => p.text).join(''), line)
})

test('langOf maps extensions, and knows none for the rest', () => {
  assert.equal(langOf('C:\\a\\App.TSX'), 'js')
  assert.equal(langOf('/x/package.json'), 'json')
  assert.equal(langOf('index.htm'), 'html')
  assert.equal(langOf('notes.txt'), null)
  assert.equal(langOf('Makefile'), null)
})

test('segments cut the pieces where a changed range or a selection starts and ends', () => {
  const pieces = segments('  return add(a, 20)', 'js', { chg: [[9, 12]], sel: [[2, 8]] })

  assert.deepEqual(pieces.filter(p => p.sel).map(p => p.text), ['return'])
  assert.deepEqual(pieces.filter(p => p.chg).map(p => [p.text, p.cls]), [['add', 'fn']])
  assert.equal(pieces.map(p => p.text).join(''), '  return add(a, 20)')
  assert.deepEqual(pieces.find(p => p.text === 'return'), { text: 'return', cls: 'kw', sel: true })
})

test('segments cut a colored word when a range ends inside it', () => {
  const pieces = segments('const LIMIT', 'js', { chg: [[6, 9]] })

  assert.deepEqual(pieces.map(p => p.text), ['const', ' ', 'LIM', 'IT'])
  assert.deepEqual(pieces.filter(p => p.chg).map(p => p.text), ['LIM'])
})

test('segments put the caret between pieces, and at either end of a line', () => {
  const at = (text, caret) => segments(text, 'js', { caret }).map(p => (p.caret ? '|' : p.text)).join('')

  assert.equal(at('a = 1', 0), '|a = 1')
  assert.equal(at('a = 1', 4), 'a = |1')
  assert.equal(at('a = 1', 5), 'a = 1|')
  assert.equal(at('', 0), '|')
  assert.equal(at('a = 1', undefined), 'a = 1')
})
