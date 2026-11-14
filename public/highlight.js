// Colors one line of code for the live view. It works a line at a time, so a
// comment or string that runs over several lines is not followed (the view
// shows a window of a file, not all of it). Plain code, no library.
const RULES = {
  js: {
    re: /(\/\/.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|\b(const|let|var|function|return|if|else|for|while|do|import|export|from|default|async|await|new|class|extends|try|catch|finally|throw|switch|case|break|continue|typeof|instanceof|of|in|this)\b|\b(true|false|null|undefined)\b|\b(\d+(?:\.\d+)?)\b|\b([A-Za-z_$][\w$]*)(?=\()/g,
    classes: ['com', 'str', 'kw', 'num', 'num', 'fn'], // true, false and null are colored like numbers: fixed values
  },
  json: {
    re: /("(?:[^"\\]|\\.)*"(?=\s*:))|("(?:[^"\\]|\\.)*")|\b(true|false|null)\b|(-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)/g,
    classes: ['key', 'str', 'num', 'num'],
  },
  css: {
    re: /(\/\*.*?\*\/)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(@[\w-]+)|([\w-]+(?=\s*:))|(#[0-9a-fA-F]{3,8}\b|-?\b\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw|ms|s|deg)?)/g,
    classes: ['com', 'str', 'kw', 'key', 'num'],
  },
  html: {
    re: /(<!--.*?-->)|("[^"]*"|'[^']*')|(<\/?[A-Za-z][\w-]*|\/?>)|([\w:-]+(?==))/g,
    classes: ['com', 'str', 'kw', 'key'],
  },
}

const LANGS = {
  js: 'js', mjs: 'js', cjs: 'js', jsx: 'js', ts: 'js', tsx: 'js',
  json: 'json', css: 'css', html: 'html', htm: 'html',
}

// The language a file is colored as, or null for plain text.
export const langOf = path => LANGS[path.split('.').pop().toLowerCase()] ?? null

// Splits a line into [{ text, cls? }]; the texts joined are the line itself.
export const highlight = (text, lang) => {
  const rule = RULES[lang]
  if (!rule) return [{ text }]

  const parts = []
  let last = 0
  for (const match of text.matchAll(rule.re)) {
    if (match.index > last) parts.push({ text: text.slice(last, match.index) })
    const group = match.findIndex((value, i) => i > 0 && value !== undefined)
    parts.push({ text: match[0], cls: rule.classes[group - 1] })
    last = match.index + match[0].length
  }
  if (last < text.length) parts.push({ text: text.slice(last) })
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
