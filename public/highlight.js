// Colors one line of code for the live view with highlight.js (vendored, any of
// its common languages). It works a line at a time, so a comment or string that
// runs over several lines is not followed (the view shows a window of a file,
// not all of it).
import hljs from './vendor/highlight.min.js'

// highlight.js's token names, grouped into the few colors the view has
const CLASSES = {
  kw: ['keyword', 'built_in', 'type', 'name', 'selector-tag', 'meta', 'doctag', 'section'],
  str: ['string', 'regexp', 'char'],
  num: ['number', 'literal', 'symbol', 'bullet'], // true, false and null are colored like numbers: fixed values
  com: ['comment', 'quote'],
  key: ['attr', 'attribute', 'property'],
  fn: ['title'],
}
const CLS_OF = Object.fromEntries(Object.entries(CLASSES).flatMap(([cls, names]) => names.map(name => [`hljs-${name}`, cls])))

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#x27;': "'" }
const decode = text => text.replace(/&(?:amp|lt|gt|quot|#x27);/g, e => ENTITIES[e])

// The language a file is colored as, or null for plain text (also for a file
// with no extension).
export const langOf = path => {
  const name = path.split(/[\/]/).pop()
  const dot = name.lastIndexOf('.')
  if (dot < 0) return null
  const ext = name.slice(dot + 1).toLowerCase()
  const lang = ext === 'htm' ? 'html' : ext
  const found = hljs.getLanguage(lang)
  return found && found.name !== 'Plain text' ? lang : null
}

// Splits a line into [{ text, cls? }]; the texts joined are the line itself.
export const highlight = (text, lang) => {
  if (!text) return []
  if (!lang) return [{ text }]
  let html
  try {
    html = hljs.highlight(text, { language: lang, ignoreIllegals: true }).value
  } catch {
    return [{ text }]
  }
  // the library's output is only <span class="hljs-x"> ... </span> and escaped
  // text; a span with no color of its own keeps the one around it
  const parts = []
  const stack = []
  for (const [, open, chunk] of html.matchAll(/<span class="([^"]*)">|<\/span>|([^<]+)/g)) {
    if (open !== undefined) stack.push(open.split(' ').map(c => CLS_OF[c]).find(Boolean) ?? stack.at(-1))
    else if (chunk === undefined) stack.pop()
    else {
      const cls = stack.at(-1)
      parts.push(cls ? { text: decode(chunk), cls } : { text: decode(chunk) })
    }
  }
  return parts
}


// The pieces of a line to draw: its highlight pieces, cut where a marked range
// starts or ends. `chg` and `sel` are lists of [from, to) character ranges (the
// changed words; what is selected); `caret` is a character index. Each piece
// is { text, cls?, chg?, sel? }, and the caret is a { caret: true } piece.
export const segments = (text, lang, { chg = [], sel = [], caret } = {}) => {
  const ranges = { chg, sel }
  const cuts = [...chg, ...sel].flat()
  const out = []
  const placeCaret = at => {
    if (caret === at) out.push({ caret: true })
  }
  let at = 0
  for (const part of highlight(text, lang)) {
    const end = at + part.text.length
    const edges = [at, ...cuts.filter(c => c > at && c < end).sort((a, b) => a - b), end]
    for (let i = 0; i < edges.length - 1; i++) {
      const [from, to] = [edges[i], edges[i + 1]]
      placeCaret(from)
      const piece = { text: part.text.slice(from - at, to - at) }
      if (part.cls) piece.cls = part.cls
      for (const [name, list] of Object.entries(ranges))
        if (list.some(([a, b]) => from >= a && to <= b)) piece[name] = true
      out.push(piece)
    }
    at = end
  }
  if (text === '') placeCaret(0)
  else placeCaret(at)
  return out
}
