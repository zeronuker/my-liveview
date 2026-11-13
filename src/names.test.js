import assert from 'node:assert/strict'
import { test } from 'node:test'

import { shownNames } from '../public/names.js'

const tag = (x, y, rank = 2, width = 40) => ({ x, y, rank, width, size: 10 })

test('names that do not touch are all shown', () => {
  assert.deepEqual([...shownNames([tag(0, 0), tag(100, 0), tag(0, 30)])].sort(), [0, 1, 2])
})

test('of two names that would overprint, only the more wanted one is shown', () => {
  assert.deepEqual([...shownNames([tag(0, 0, 2), tag(10, 2, 0)])], [1]) // the picked chat's name wins
  assert.deepEqual([...shownNames([tag(0, 0, 1), tag(10, 2, 2)])], [0])
})

test('a name that is in the way of a hidden one does not hide the next: each is judged against the names shown', () => {
  // 0 and 1 overlap, 1 and 2 overlap, 0 and 2 do not: 0 is shown, 1 is out, so 2 is shown
  assert.deepEqual([...shownNames([tag(0, 0, 0), tag(30, 0, 1), tag(60, 0, 2)])].sort(), [0, 2])
})

test('equally wanted names go the way of the one higher up the plan, and there is no name with no width', () => {
  assert.deepEqual([...shownNames([tag(0, 6), tag(5, 0)])], [1])
  assert.deepEqual([...shownNames([tag(0, 0, 0, 0), tag(0, 0)])], [1])
  assert.deepEqual([...shownNames([])], [])
})
