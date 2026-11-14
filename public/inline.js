// Which words of a removed line and the line that replaced it actually
// changed, so the page can brighten just those. Plain code, no library.
const tokens = text => text.match(/\w+|\s+|[^\w\s]/g) ?? []

// Where two lines differ: what both start with (head) and both end with (tail)
// is shared, the part between is the change. Null when the lines share almost
// nothing: that is a rewrite, and brightening all of it says nothing.
// ponytail: one changed stretch per line (the first difference to the last);
// two far-apart changes in one line brighten everything between them too.
export const editOf = (before, after) => {
  const a = tokens(before)
  const b = tokens(after)
  let top = 0
  while (top < a.length && top < b.length && a[top] === b[top]) top++
  let bot = 0
  while (bot < a.length - top && bot < b.length - top && a[a.length - 1 - bot] === b[b.length - 1 - bot]) bot++

  const head = a.slice(0, top).join('')
  const tail = a.slice(a.length - bot).join('')
  if (head.length + tail.length < before.length * 0.3 && head.length + tail.length < after.length * 0.3) return null
  return { head, tail, oldMid: a.slice(top, a.length - bot).join(''), newMid: b.slice(top, b.length - bot).join('') }
}

export const inlineDiff = (before, after) => {
  const edit = editOf(before, after)
  if (!edit) return null
  const pieces = middle =>
    [
      { text: edit.head, isChanged: false },
      { text: middle, isChanged: true },
      { text: edit.tail, isChanged: false },
    ].filter(piece => piece.text !== '')
  return { before: pieces(edit.oldMid), after: pieces(edit.newMid) }
}

// What a change is, from the lines it takes out and the lines it puts in:
// 'del' takes code out and puts nothing back, 'new' only adds, 'minor' changes
// a few words in each line (same number of lines, each pair alike), and
// 'replace' is anything else.
export const blockKind = (dels, adds) => {
  if (adds.length === 0) return 'del'
  if (dels.length === 0) return 'new'
  return dels.length === adds.length && dels.every((text, i) => editOf(text, adds[i])) ? 'minor' : 'replace'
}

// The [from, to) character ranges of a line's changed words, from its `parts`.
export const changedRanges = parts => {
  const ranges = []
  let at = 0
  for (const part of parts ?? []) {
    if (part.isChanged) ranges.push([at, at + part.text.length])
    at += part.text.length
  }
  return ranges
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
