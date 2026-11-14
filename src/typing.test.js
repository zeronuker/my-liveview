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

// two removed lines, three that replace them: a rewrite, not a small edit
const rewrite = [{ dels: ['const limit = 75', 'const rows = []'], adds: ['export function total() {', '  return 1', '}'] }]
const isRemoval = step => 'select' in step || ('del' in step && step.at > 0)

test('the old code goes last: nothing is removed until every line is written', () => {
  for (const rand of [() => 0, () => 0.99]) {
    const { steps } = typingPlan(rewrite, { rand })
    const lastAdd = steps.findLastIndex(step => 'add' in step)
    const firstRemoval = steps.findIndex(isRemoval)

    assert.ok(firstRemoval > lastAdd)
  }
})

test('with several changes, all the writing comes before any removal', () => {
  const two = [...rewrite, { dels: ['gone()'], adds: [] }, { dels: [], adds: ['added()'] }]
  const { steps } = typingPlan(two, { rand: () => 0.99 })

  assert.ok(steps.findIndex(isRemoval) > steps.findLastIndex(step => 'add' in step))
})

test('removed lines end gone for good: none comes back', () => {
  for (const rand of [() => 0, () => 0.99]) {
    const { steps } = typingPlan(rewrite, { rand })
    for (const line of [0, 1]) assert.equal(steps.findLast(step => step.del === line).gone, true)
  }
})

test('the old code is backspaced one letter at a time, or selected and removed at once: a coin toss', () => {
  const backspaced = typingPlan(rewrite, { rand: () => 0 }).steps
  assert.ok(!backspaced.some(step => 'select' in step))
  assert.ok(backspaced.filter(step => 'del' in step && !step.gone).length > 10)

  const selected = typingPlan(rewrite, { rand: () => 0.99 }).steps
  assert.deepEqual(selected.filter(step => 'select' in step).map(step => step.select), [[0, 2], null])
  assert.ok(selected.filter(isRemoval).filter(step => 'del' in step).every(step => step.gone && step.text === ''))
  // the selection is cleared in the same moment the lines go
  const clear = selected.find(step => step.select === null)
  assert.ok(selected.filter(step => step.at === clear.at && 'del' in step).length === 2)
})

test('the way a block is removed is chosen once per block', () => {
  const picks = [0.9, 0.1] // first block: select; second block: backspace
  const rand = () => picks.shift() ?? 0
  const { steps } = typingPlan([{ dels: ['a'], adds: [] }, { dels: ['b'], adds: [] }], { rand })

  assert.deepEqual(steps.filter(step => 'select' in step).map(step => step.select), [[0, 1], null])
  assert.ok(steps.some(step => step.del === 1 && step.gone === false)) // the second was backspaced
  assert.ok(!steps.some(step => step.del === 0 && step.gone === false)) // the first was not
})

test('side by side keeps the removed lines: nothing is selected, erased or hidden', () => {
  const { steps } = typingPlan(rewrite, { rand: () => 0.99, keepRemoved: true })

  assert.ok(!steps.some(step => 'select' in step || 'del' in step))
  assert.deepEqual(finalTexts(steps, 3), rewrite[0].adds)
})

test('a small change is made where the line stands: select the words, one backspace, type', () => {
  const small = [{ dels: ['const LIMIT = 50'], adds: ['const LIMIT = 75'] }]
  const { steps } = typingPlan(small, { rand: () => 0.5 })
  const adds = steps.filter(step => 'add' in step)

  // the line starts as the old one, and its removed twin is not needed
  assert.deepEqual(steps.slice(0, 2), [
    { at: 0, add: 0, text: 'const LIMIT = 50', chg: null },
    { at: 0, del: 0, text: 'const LIMIT = 50', gone: true },
  ])
  assert.deepEqual(adds[1].sel, [14, 16]) // the 50
  assert.equal(adds[2].text, 'const LIMIT = ') // one backspace removes it all
  assert.equal(adds[2].caret, 14)
  assert.deepEqual(adds.slice(3).map(step => [step.text, step.chg, step.caret]), [
    ['const LIMIT = 7', [14, 15], 15],
    ['const LIMIT = 75', [14, 16], 16],
  ])
  assert.ok(!steps.some(isRemoval)) // and nothing is taken out afterwards
})

test('a small change with side by side leaves the removed line alone', () => {
  const { steps } = typingPlan([{ dels: ['a = 1'], adds: ['a = 2'] }], { keepRemoved: true })

  assert.ok(!steps.some(step => 'del' in step))
  assert.equal(steps.findLast(step => 'add' in step).text, 'a = 2')
})

test('a change that only removes lines types nothing, and they go by the coin toss', () => {
  const { steps } = typingPlan([{ dels: ['old'], adds: [] }], { rand: () => 0.99 })

  assert.ok(steps.every(step => 'select' in step || 'del' in step))
  assert.deepEqual(steps.at(-1), { at: steps.at(-1).at, del: 0, text: '', gone: true })
})

test('the last removed line is backspaced first, one character at a time', () => {
  const { steps } = typingPlan([{ dels: ['ab', 'xyz'], adds: [] }], { rand: () => 0 })
  const erase = steps.filter(step => 'del' in step && !step.gone).map(step => `${step.del}:${step.text}`)

  assert.deepEqual(erase.slice(0, 5), ['1:xy', '1:x', '1:', '0:a', '0:'])
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
