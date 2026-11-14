// How an edit is written when it is staged like a person typing. Everything new
// is written first, and taking old code out is the very last step. Plain data
// in, plain data out, so the pace can be tested; pane.js does the drawing.
//
// `blocks` is [{ dels, adds }]: the texts of the removed lines a change takes
// out and of the lines that replace them. What a change is (see blockKind):
//   new / replace  the added lines are typed a character at a time, now and
//                  then slipping on a key
//   minor          the line is edited where it stands: the changed words are
//                  selected, deleted with one backspace and typed again
//   del / replace  the removed lines go last, after every block is written
//
// Returns { steps, total }; a step is
//   { at, select }               highlight the removed lines [from, to), or null
//   { at, del, text, gone }      what removed line number `del` shows now; `gone`
//                                when it has gone and takes no room
//   { at, add, text, sel?, chg?, caret? }
//                                what the added line number `add` shows now.
//                                `sel` and `chg` are [from, to) ranges of the
//                                text (selected; the changed words, null for
//                                none) and `caret` is where the cursor is;
//                                a step without `chg` leaves that to the page
// with `at` in ms at the normal pace. The last step of every added line is its
// whole text, and the plan fits in `capMs`. With `keepRemoved` (the side by side
// view, where the old code is the left column) the removed lines are never
// touched, so none of them is selected, erased or hidden.
import { blockKind, editOf } from './inline.js'

const KEY_MS = 40 // a key every 40 ms: 300 words a minute
const SLIP = 0.03 // the chance a letter is first hit wrong

export const typingPlan = (blocks, { rand = Math.random, capMs = 5 * 60 * 1000, keepRemoved = false } = {}) => {
  const steps = []
  let at = 0
  const push = (wait, step) => steps.push({ at: (at += wait), ...step })
  const key = () => KEY_MS * (0.6 + rand() * 0.9)

  const kinds = blocks.map(block => blockKind(block.dels, block.adds))
  const firsts = [] // the number of the first removed and first added line of each block
  let del = 0
  let add = 0
  for (const block of blocks) {
    firsts.push({ del, add })
    del += block.dels.length
    add += block.adds.length
  }

  // a line that is edited where it stands starts as the old line, and its removed twin is not needed
  blocks.forEach((block, b) => {
    if (kinds[b] !== 'minor') return
    block.dels.forEach((text, i) => {
      steps.push({ at: 0, add: firsts[b].add + i, text, chg: null })
      if (!keepRemoved) steps.push({ at: 0, del: firsts[b].del + i, text, gone: true })
    })
  })

  const typeLine = (row, text) => {
    if (text === '') push(350, { add: row, text })
    for (let i = 0; i < text.length; i++) {
      const wait = i === 0 ? 350 : key()
      const isSlip = /[a-z]/i.test(text[i]) && rand() < SLIP
      if (isSlip) {
        push(wait, { add: row, text: text.slice(0, i) + String.fromCharCode(97 + Math.floor(rand() * 26)) })
        push(300 + rand() * 200, { add: row, text: text.slice(0, i) })
      }
      push(isSlip ? key() : wait, { add: row, text: text.slice(0, i + 1) })
    }
  }

  const editInPlace = (row, before, after) => {
    const { head, tail, oldMid, newMid } = editOf(before, after)
    const from = head.length
    if (oldMid) {
      push(500, { add: row, text: before, sel: [from, from + oldMid.length], chg: null })
      push(800, { add: row, text: head + tail, caret: from, chg: null }) // one backspace
    } else push(500, { add: row, text: before, caret: from, chg: null })
    for (let i = 1; i <= newMid.length; i++)
      push(i === 1 ? 300 : key(), { add: row, text: head + newMid.slice(0, i) + tail, caret: from + i, chg: [from, from + i] })
  }

  // first the new code, block by block
  blocks.forEach((block, b) => {
    if (kinds[b] === 'del') return
    if (at > 0) at += 700
    if (kinds[b] === 'minor') block.adds.forEach((text, i) => editInPlace(firsts[b].add + i, block.dels[i], text))
    else block.adds.forEach((text, i) => typeLine(firsts[b].add + i, text))
  })

  // and last, the old code, each block either backspaced or selected and removed at once
  blocks.forEach((block, b) => {
    if (keepRemoved || block.dels.length === 0 || kinds[b] === 'minor') return
    if (at > 0) at += 700
    const first = firsts[b].del
    if (rand() < 0.5) {
      for (let i = block.dels.length - 1; i >= 0; i--) {
        const text = block.dels[i]
        for (let len = text.length - 1; len >= 0; len--) push(key() * 0.6, { del: first + i, text: text.slice(0, len), gone: false })
        push(80, { del: first + i, text: '', gone: true })
      }
    } else {
      push(500, { select: [first, first + block.dels.length] })
      push(900, { select: null })
      block.dels.forEach((_, i) => push(0, { del: first + i, text: '', gone: true }))
    }
  })

  const scale = at > capMs ? capMs / at : 1
  for (const step of steps) step.at *= scale
  return { steps, total: Math.min(at * scale, capMs) } // min: float rounding can land a hair over
}
