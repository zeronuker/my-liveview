import assert from 'node:assert/strict'
import { test } from 'node:test'

import { fileLabels, relParts } from '../public/tree.js'

test('relParts: the parts below the chat folder, either slash, any case', () => {
  assert.deepEqual(relParts('C:\\Proj\\src\\a.js', 'C:\\Proj'), ['src', 'a.js'])
  assert.deepEqual(relParts('c:/proj/src/a.js', 'C:\\PROJ\\'), ['src', 'a.js'])
  assert.deepEqual(relParts('C:\\Proj\\a.js', 'C:\\Proj'), ['a.js'])
})

test('relParts: a path outside the folder keeps all its parts', () => {
  assert.deepEqual(relParts('D:\\other\\a.js', 'C:\\Proj'), ['D:', 'other', 'a.js'])
  assert.deepEqual(relParts('C:\\Project2\\a.js', 'C:\\Proj'), ['C:', 'Project2', 'a.js'])
  assert.deepEqual(relParts('C:\\Proj\\a.js', ''), ['C:', 'Proj', 'a.js'])
})

test('fileLabels: a file is called by its name when the name is its own', () => {
  const labels = fileLabels(['C:\\p\\src\\a.js', 'C:\\p\\b.css'], 'C:\\p')

  assert.equal(labels.get('C:\\p\\src\\a.js'), 'a.js')
  assert.equal(labels.get('C:\\p\\b.css'), 'b.css')
})

test('fileLabels: two files with one name are told apart by their paths', () => {
  const labels = fileLabels(['C:\\p\\src\\index.js', 'C:\\p\\lib\\index.js', 'C:\\p\\x.js'], 'C:\\p')

  assert.equal(labels.get('C:\\p\\src\\index.js'), 'src/index.js')
  assert.equal(labels.get('C:\\p\\lib\\index.js'), 'lib/index.js')
  assert.equal(labels.get('C:\\p\\x.js'), 'x.js')
})
