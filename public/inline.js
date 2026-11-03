// Which words of a removed line and the line that replaced it actually
// changed, so the page can brighten just those. Plain code, no library.
const tokens = text => text.match(/\w+|\s+|[^\w\s]/g) ?? []

// A changed line is told apart only where it differs: what the two lines both
// start with and both end with is shared, the part between is the change.
// ponytail: one changed stretch per line (the first difference to the last);
// two far-apart changes in one line brighten everything between them too.
export const inlineDiff = (before, after) => {
  const a = tokens(before)
  const b = tokens(after)
  let top = 0
  while (top < a.length && top < b.length && a[top] === b[top]) top++
  let bot = 0
  while (bot < a.length - top && bot < b.length - top && a[a.length - 1 - bot] === b[b.length - 1 - bot]) bot++

  const parts = (list, other) => {
    const head = list.slice(0, top).join('')
    const middle = list.slice(top, list.length - bot).join('')
    const tail = list.slice(list.length - bot).join('')
    return { head, middle, tail, isWhole: head.length + tail.length < other.join('').length * 0.3 }
  }
  const x = parts(a, b)
  const y = parts(b, a)
  // lines that share almost nothing are a rewrite: brightening all of it says nothing
  if (x.isWhole && y.isWhole) return null

  const pieces = ({ head, middle, tail }) =>
    [
      { text: head, isChanged: false },
      { text: middle, isChanged: true },
      { text: tail, isChanged: false },
    ].filter(piece => piece.text !== '')
  return { before: pieces(x), after: pieces(y) }
}

// The rows of an edit with each removed line paired to the added line that
// replaces it (the first with the first, and so on); a pair that differs only
// in places gets `parts` on both rows.
export const withInlineDiff = rows => {
  const out = rows.map(row => ({ ...row }))
  for (let i = 0; i < rows.length; ) {
    if (rows[i].kind !== 'del') {
      i++
      continue
    }
    const dels = []
    while (i < rows.length && rows[i].kind === 'del') dels.push(i++)
    const adds = []
    while (i < rows.length && rows[i].kind === 'add') adds.push(i++)
    for (let k = 0; k < Math.min(dels.length, adds.length); k++) {
      const diff = inlineDiff(rows[dels[k]].text, rows[adds[k]].text)
      if (diff) {
        out[dels[k]].parts = diff.before
        out[adds[k]].parts = diff.after
      }
    }
  }
  return out
}
