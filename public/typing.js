// How an edit is written when it is staged like a person typing: select what
// goes, backspace it away, then type what replaces it a character at a time,
// now and then slipping on a key, and last bring the removed lines back so the
// finished diff shows what was taken out. Plain data in, plain data out, so the
// pace can be tested; pane.js does the drawing.
//
// `blocks` is [{ dels, adds }]: the texts of the removed lines a change takes
// out and of the lines that replace them. Returns { steps, total }; a step is
//   { at, select }            highlight the removed lines [from, to), or null
//   { at, del, text, gone }   what removed line number `del` shows now; `gone`
//                             when it has been erased and takes no room
//   { at, add, text }         what the added line number `add` shows now
// with `at` in ms at the normal pace. The last step of every added line is its
// whole text, every removed line ends whole again, and the plan fits in `capMs`.
const KEY_MS = 40 // a key every 40 ms: 300 words a minute
const SLIP = 0.03 // the chance a letter is first hit wrong

export const typingPlan = (blocks, { rand = Math.random, capMs = 5 * 60 * 1000 } = {}) => {
  const steps = []
  let at = 0
  const push = (wait, step) => steps.push({ at: (at += wait), ...step })
  const key = () => KEY_MS * (0.6 + rand() * 0.9)

  let del = 0
  let add = 0
  for (const block of blocks) {
    if (steps.length > 0) at += 700
    const first = del
    if (block.dels.length > 0) {
      push(500, { select: [first, first + block.dels.length] })
      push(1000, { select: null })
      for (let i = block.dels.length - 1; i >= 0; i--) {
        const text = block.dels[i]
        for (let len = text.length - 1; len >= 0; len--) push(key() * 0.6, { del: first + i, text: text.slice(0, len), gone: false })
        push(80, { del: first + i, text: '', gone: true })
      }
      del += block.dels.length
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
    block.dels.forEach((text, i) => push(i === 0 ? 800 : 0, { del: first + i, text, gone: false }))
  }

  const scale = at > capMs ? capMs / at : 1
  for (const step of steps) step.at *= scale
  return { steps, total: Math.min(at * scale, capMs) } // min: float rounding can land a hair over
}
