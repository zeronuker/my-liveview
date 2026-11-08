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
  { dels: ['const limit = 75', 'const rows = []'], adds: ['const limit = 25', 'const rows = 500'] },
  { dels: [], adds: ['', 'export const total = limit + rows'] },
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
  const { steps } = typingPlan([{ dels: [], adds: ['abc'] }], { rand: () => 0 })
  const shown = steps.map(step => step.text)

  assert.ok(shown.some(text => !'abc'.startsWith(text)))
  assert.equal(shown.at(-1), 'abc')
})

test('removed lines are selected, the selection is cleared, then they are erased before any typing', () => {
  const { steps } = typingPlan(blocks, { rand: seeded() })
  const selects = steps.filter(step => 'select' in step)

  assert.deepEqual(selects.map(step => step.select), [[0, 2], null])
  const firstAdd = steps.findIndex(step => 'add' in step)
  assert.ok(steps.indexOf(selects[1]) < steps.findIndex(step => 'del' in step))
  // by the time typing starts, both removed lines are gone
  const gone = new Set(steps.slice(0, firstAdd).filter(step => step.gone).map(step => step.del))
  assert.deepEqual([...gone].sort(), [0, 1])
})

test('the last removed line is backspaced first, one character at a time', () => {
  const { steps } = typingPlan([{ dels: ['ab', 'xyz'], adds: [] }], { rand: () => 0 })
  const erase = steps.filter(step => 'del' in step && !step.gone).map(step => `${step.del}:${step.text}`)

  assert.deepEqual(erase.slice(0, 5), ['1:xy', '1:x', '1:', '0:a', '0:'])
})

test('every removed line comes back whole after the typing', () => {
  const { steps } = typingPlan(blocks, { rand: seeded() })
  const lastAdd = steps.findLastIndex(step => 'add' in step && blocks[0].adds.includes(step.text))
  const back = steps.slice(lastAdd).filter(step => 'del' in step)

  assert.deepEqual(back.map(step => [step.del, step.text, step.gone]), [
    [0, 'const limit = 75', false],
    [1, 'const rows = []', false],
  ])
})

test('a change that only removes lines selects, erases and brings them back, nothing typed', () => {
  const { steps } = typingPlan([{ dels: ['old'], adds: [] }])

  assert.ok(steps.every(step => 'select' in step || 'del' in step))
  assert.deepEqual(steps.at(-1), { at: steps.at(-1).at, del: 0, text: 'old', gone: false })
})

test('a long edit is squeezed to the cap, a short one is not', () => {
  const long = [{ dels: [], adds: Array(400).fill('x'.repeat(80)) }]
  const squeezed = typingPlan(long, { rand: seeded() })
  assert.equal(squeezed.total, 5 * 60 * 1000)
  assert.deepEqual(finalTexts(squeezed.steps, 400), long[0].adds)

  const short = typingPlan([{ dels: [], adds: ['hi'] }], { rand: seeded() })
  assert.ok(short.total < 1000)
})

test('nothing to write is an empty plan', () => {
  assert.deepEqual(typingPlan([]), { steps: [], total: 0 })
})
