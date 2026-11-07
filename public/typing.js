// How an edit is written when it is staged like a person typing: select what
// goes, then type what replaces it a character at a time, now and then slipping
// on a key. Plain data in, plain data out, so the pace can be tested; pane.js
// does the drawing.
//
// `blocks` is [{ dels, adds }]: how many removed lines a change takes out, and
// the texts of the lines that replace them. Returns { steps, total }; a step is
//   { at, select }    highlight the removed lines [from, to), or null for none
//   { at, add, text } what the added line number `add` shows from now on
// with `at` in ms at the normal pace. The last step of every added line is its
// whole text, and the whole plan fits in `capMs` however much is typed.
const KEY_MS = 70 // about a key every 70 ms
const SLIP = 0.03 // the chance a letter is first hit wrong

export const typingPlan = (blocks, { rand = Math.random, capMs = 15000 } = {}) => {
  const steps = []
  let at = 0
  const push = (wait, step) => steps.push({ at: (at += wait), ...step })
  const key = () => KEY_MS * (0.6 + rand() * 0.9)

  let del = 0
  let add = 0
  for (const block of blocks) {
    if (steps.length > 0) at += 700
    if (block.dels > 0) {
      push(500, { select: [del, del + block.dels] })
      push(1000, { select: null })
      del += block.dels
    }
    for (const text of block.adds) {
      const row = add++
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
  }

  const scale = at > capMs ? capMs / at : 1
  for (const step of steps) step.at *= scale
  return { steps, total: Math.min(at * scale, capMs) } // min: float rounding can land a hair over
}
