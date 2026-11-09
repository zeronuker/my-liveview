import assert from 'node:assert/strict'
import { test } from 'node:test'

import { nextInLine, placeEdit } from '../public/place.js'

const empty = { key: null, isBusy: false, isVisible: true, usedAt: 0 }
const second = { key: null, isBusy: false, isVisible: false, usedAt: 0 }
const shows = (key, usedAt, isBusy = false) => ({ key, isBusy, isVisible: true, usedAt })

test('the first edit goes to the first pane', () => {
  assert.deepEqual(placeEdit([empty, second], 'a'), { pane: 0 })
})

test('a second file that arrives while the first is being written opens the second pane', () => {
  assert.deepEqual(placeEdit([shows('a', 1, true), second], 'b'), { pane: 1 })
})

test('a third file waits in line while both panes are being written', () => {
  const both = [shows('a', 1, true), shows('b', 2, true)]

  assert.deepEqual(placeEdit(both, 'c'), { pane: -1 })
})

test('with four panes, busy files open the next pane and a fifth waits in line', () => {
  const hidden = { key: null, isBusy: false, isVisible: false, usedAt: 0 }

  assert.deepEqual(placeEdit([shows('a', 1, true), shows('b', 2, true), shows('c', 3, true), hidden], 'd'), { pane: 3 })
  assert.deepEqual(placeEdit([shows('a', 1, true), shows('b', 2, true), shows('c', 3, true), shows('d', 4, true)], 'e'), { pane: -1 })
})

test('a file that is already showing is given the pane it is in, even while that is busy', () => {
  const panes = [shows('a', 1, true), shows('b', 2, true)]

  assert.deepEqual(placeEdit(panes, 'b'), { pane: 1, interrupt: true })
  assert.deepEqual(placeEdit([shows('a', 1), shows('b', 2)], 'a'), { pane: 0, interrupt: false })
})

test('a new file replaces the pane that finished longest ago', () => {
  assert.deepEqual(placeEdit([shows('a', 5), shows('b', 3)], 'c'), { pane: 1 })
  assert.deepEqual(placeEdit([shows('a', 2), shows('b', 9)], 'c'), { pane: 0 })
})

test('a finished pane is used before a second one is opened', () => {
  // only one pane is on screen and it has finished: no need for another
  assert.deepEqual(placeEdit([shows('a', 4), second], 'b'), { pane: 0 })
})

test('when one pane finishes, the waiting file takes it', () => {
  const panes = [shows('a', 1, true), shows('b', 2)] // a still writing, b done

  assert.deepEqual(placeEdit(panes, 'c'), { pane: 1 })
})

test('the line is served in order, and a file still being written is left waiting', () => {
  const panes = [shows('a', 1, true), shows('b', 2)] // b is free

  // 'a' is still being written, so it waits; 'c' can go to the free pane
  assert.equal(nextInLine(panes, ['a', 'c']), 1)
  assert.equal(nextInLine([shows('a', 1, true), shows('b', 2, true)], ['c', 'd']), -1)
  assert.equal(nextInLine([shows('a', 1), shows('b', 2)], ['c', 'd']), 0)
  assert.equal(nextInLine([shows('a', 1), shows('b', 2)], []), -1)
})
