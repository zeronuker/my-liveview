import assert from 'node:assert/strict'
import { test } from 'node:test'

import { FADE_MS, REST, glowLevel, touchOf } from '../public/glow.js'

test('touchOf: a read or an edit of a file below the chat folder, either slash, any case', () => {
  const tool = (name, path) => ({ type: 'tool', tool: name, path })
  assert.deepEqual(touchOf(tool('Read', 'C:\\Proj\\src\\a.js'), 'C:\\Proj'), { path: 'src/a.js', kind: 'read' })
  assert.deepEqual(touchOf(tool('Edit', 'c:/proj/a.js'), 'C:\\PROJ\\'), { path: 'a.js', kind: 'edit' })
  assert.deepEqual(touchOf(tool('Write', 'C:\\Proj\\b.js'), 'C:\\Proj'), { path: 'b.js', kind: 'edit' })
})

test('touchOf: nothing for other tools, other events, a file outside the folder, or no folder', () => {
  const tool = { type: 'tool', tool: 'Read', path: 'C:\\Proj\\a.js' }
  assert.equal(touchOf({ ...tool, tool: 'Bash' }, 'C:\\Proj'), null)
  assert.equal(touchOf({ ...tool, type: 'edit' }, 'C:\\Proj'), null)
  assert.equal(touchOf({ ...tool, path: undefined }, 'C:\\Proj'), null)
  assert.equal(touchOf(tool, 'C:\\Other'), null)
  assert.equal(touchOf(tool, 'C:\\Pro'), null) // a folder that only starts with the same letters
  assert.equal(touchOf(tool, ''), null)
})

test('glowLevel: full at the touch, settling to a lit rest and staying there', () => {
  assert.equal(glowLevel(0), 1)
  assert.ok(glowLevel(FADE_MS / 2) < 1 && glowLevel(FADE_MS / 2) > REST)
  assert.equal(glowLevel(FADE_MS), REST)
  assert.equal(glowLevel(FADE_MS * 10), REST)
})
