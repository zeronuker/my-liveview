// Showing a whole file for one edit, not just the changed part. Plain code, no
// library; the server uses showText too, so both show a line the same way.

// How a line of code is shown: no carriage return, tabs as two spaces.
export const showText = text => text.replace(/\r$/, '').replace(/\t/g, '  ')

// A file's lines as the diff counts them: a final newline ends the last line.
export const linesOf = text => (text === '' ? [] : text.replace(/\n$/, '').split('\n'))

// Every line of the file as it stands after the edit, the changed place shown
// as the edit shows it: the removed lines, then the added ones. Null when the
// text does not fit the edit (the file has moved on since, or the edit was
// cut short), so the caller can keep showing just the changed part.
export const wholeRows = (rows, text) => {
  const changed = rows.filter(row => row.kind === 'add' || row.kind === 'del')
  if (changed.length === 0 || rows.some(row => row.kind === 'gap' && row.text.includes('not shown'))) return null
  const dels = changed.filter(row => row.kind === 'del')
  const adds = changed.filter(row => row.kind === 'add')
  const lines = linesOf(text)
  const first = changed[0].n // the line the change starts at
  const last = first - 1 + adds.length // the last line the added ones take
  if (lines.length < last || adds.some((row, i) => showText(lines[first - 1 + i]) !== row.text)) return null

  const rest = (from, to) =>
    Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => ({
      kind: 'ctx',
      n: from + i,
      text: showText(lines[from + i - 1]),
    }))
  return [...rest(1, first - 1), ...dels, ...adds, ...rest(last + 1, lines.length)]
}
