import assert from 'node:assert/strict'
import { test } from 'node:test'

import { typingPlan } from '../public/typing.js'

// a fixed run of "random" numbers, so a test sees the same slips every time
const seeded = () => {
  let s = 7
  return () => {
    s = (s * 16807) % 2147483647
    return s / 2147483647
  }
}

// what each added line shows once every step has played
const finalTexts = (steps, count) => {
  const texts = Array(count).fill(null)
  for (const step of steps) if ('add' in step) texts[step.add] = step.text
  return texts
}

const blocks = [
  { dels: 2, adds: ['const limit = 25', 'const rows = 500'] },
  { dels: 0, adds: ['', 'export const total = limit + rows'] },
]

test('every added line ends as its whole text, slips and all', () => {
  for (const rand of [seeded(), () => 0]) {
    const { steps } = typingPlan(blocks, { rand })
    assert.deepEqual(finalTexts(steps, 4), blocks.flatMap(b => b.adds))
  }
})

test('steps never go back in time', () => {
  const { steps, total } = typingPlan(blocks, { rand: seeded() })
  for (let i = 1; i < steps.length; i++) assert.ok(steps[i].at >= steps[i - 1].at)
  assert.ok(steps.at(-1).at <= total)
})

test('a slip shows a wrong letter, then the line is fixed', () => {
  const { steps } = typingPlan([{ dels: 0, adds: ['abc'] }], { rand: () => 0 })
  const shown = steps.map(step => step.text)

  assert.ok(shown.some(text => !'abc'.startsWith(text)))
  assert.equal(shown.at(-1), 'abc')
})

test('removed lines are selected, then the selection is cleared before typing', () => {
  const { steps } = typingPlan(blocks, { rand: seeded() })
  const selects = steps.filter(step => 'select' in step)

  assert.deepEqual(selects.map(step => step.select), [[0, 2], null])
  assert.ok(steps.indexOf(selects[1]) < steps.findIndex(step => 'add' in step))
})

test('a change that only removes lines only selects', () => {
  const { steps } = typingPlan([{ dels: 3, adds: [] }])

  assert.ok(steps.every(step => 'select' in step))
})

test('a long edit is squeezed to the cap, a short one is not', () => {
  const long = [{ dels: 0, adds: Array(60).fill('x'.repeat(80)) }]
  const squeezed = typingPlan(long, { rand: seeded(), capMs: 15000 })
  assert.ok(squeezed.total <= 15000)
  assert.deepEqual(finalTexts(squeezed.steps, 60), long[0].adds)

  const short = typingPlan([{ dels: 0, adds: ['hi'] }], { rand: seeded(), capMs: 15000 })
  assert.ok(short.total < 1000)
})

test('nothing to write is an empty plan', () => {
  assert.deepEqual(typingPlan([]), { steps: [], total: 0 })
})
