import assert from 'node:assert/strict'
import { test } from 'node:test'

import { highlight, langOf } from '../public/highlight.js'

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
    ['true', 'kw'],
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
