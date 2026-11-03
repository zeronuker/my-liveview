const CONTEXT = 40 // unchanged lines kept above and below a change
const MAX_ROWS = 300

const show = s => s.replace(/\r$/, '').replace(/\t/g, '  ')

// The file as it will be once the tool has run; null when the tool will refuse.
export const applyEdit = (before, tool, input) => {
  if (tool === 'Write') return input.content
  if (tool !== 'Edit' || !before.includes(input.old_string)) return null

  return input.replace_all
    ? before.split(input.old_string).join(input.new_string)
    : before.replace(input.old_string, () => input.new_string)
}

// ponytail: trims the common head and tail, so one changed block per edit; a
// replace_all with far-apart hits shows the lines between them as changed too.
export const makeRows = (before, after) => {
  // a file's last newline ends its last line, it does not start another
  const lines = text => (text === '' ? [] : text.replace(/\n$/, '').split('\n'))
  const a = lines(before)
  const b = lines(after)
  let top = 0
  while (top < a.length && top < b.length && a[top] === b[top]) top++
  let bot = 0
  while (
    bot < a.length - top &&
    bot < b.length - top &&
    a[a.length - 1 - bot] === b[b.length - 1 - bot]
  )
    bot++

  const rows = []
  const from = Math.max(0, top - CONTEXT)
  if (from > 0) rows.push({ kind: 'gap', text: `... ${from} lines above` })
  for (let i = from; i < top; i++)
    rows.push({ kind: 'ctx', n: i + 1, text: show(b[i]) })
  for (let i = top; i < a.length - bot; i++)
    rows.push({ kind: 'del', n: i + 1, text: show(a[i]) })
  for (let i = top; i < b.length - bot; i++)
    rows.push({ kind: 'add', n: i + 1, text: show(b[i]) })
  const tail = b.length - bot
  const end = Math.min(b.length, tail + CONTEXT)
  for (let i = tail; i < end; i++)
    rows.push({ kind: 'ctx', n: i + 1, text: show(b[i]) })
  if (end < b.length)
    rows.push({ kind: 'gap', text: `... ${b.length - end} lines below` })

  if (rows.length > MAX_ROWS) {
    rows.length = MAX_ROWS
    rows.push({ kind: 'gap', text: '... more lines not shown' })
  }
  return rows
}
