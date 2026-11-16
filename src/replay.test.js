import assert from 'node:assert/strict'
import { test } from 'node:test'

import { changesBetween, stateAt, timeline } from '../public/replay.js'

const COMMITS = [
  { at: 100, files: [['old.js', 5, 0], ['new.js', 10, 0]] }, // old.js had 20 lines before these commits
  { at: 200, files: [['new.js', 30, 5]] },
  { at: 300, files: [['other.js', 2, 0], ['old.js', 0, 3]] },
]
const FILES = [{ path: 'old.js', lines: 22 }, { path: 'new.js', lines: 35 }, { path: 'untouched.js', lines: 9 }, { path: 'other.js', lines: 2 }]

test('timeline: a file whose lines all came from these commits was made at the first of them', () => {
  const line = timeline(FILES, COMMITS)
  assert.equal(line.start, 100)
  assert.equal(line.end, 300)
  assert.deepEqual([...line.created].sort(), [['new.js', 100], ['other.js', 300]])
})

test('stateAt: before a file was made it is not there; after, its lines are today\'s less what was added since', () => {
  const line = timeline(FILES, COMMITS)
  const at = (path, t) => stateAt(line, FILES.find(f => f.path === path), t)
  assert.equal(at('new.js', 50).exists, false)
  assert.deepEqual(at('new.js', 150), { exists: true, lines: 10, changed: 100 })
  assert.deepEqual(at('new.js', 250), { exists: true, lines: 35, changed: 200 })
  assert.deepEqual(at('old.js', 50), { exists: true, lines: 20, changed: undefined }) // there all along
  assert.deepEqual(at('old.js', 300), { exists: true, lines: 22, changed: 300 })
  assert.deepEqual(at('untouched.js', 50), { exists: true, lines: 9, changed: undefined })
  assert.equal(at('other.js', 299).exists, false)
})

test('changesBetween: the files changed after t0 up to t1, new or edited', () => {
  const line = timeline(FILES, COMMITS)
  assert.deepEqual(changesBetween(line, 0, 100), [{ path: 'old.js', kind: 'edit' }, { path: 'new.js', kind: 'new' }])
  assert.deepEqual(changesBetween(line, 100, 300), [{ path: 'new.js', kind: 'edit' }, { path: 'other.js', kind: 'new' }, { path: 'old.js', kind: 'edit' }])
  assert.deepEqual(changesBetween(line, 300, 400), [])
})

test('timeline: no history is an empty timeline where every file is there all along', () => {
  const line = timeline(FILES, [])
  assert.equal(line.start, 0)
  assert.deepEqual(stateAt(line, FILES[0], 0), { exists: true, lines: 22, changed: undefined })
})
