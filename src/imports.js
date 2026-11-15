// Which repo files each file imports, for the Map's links. Plain text in, plain data out.
// Only imports of files in the repo are followed: JS/TS (import, export from, require, import()),
// CSS (@import), HTML (src= and href=), Python (import a.b, from .a import b) and Kotlin/Java
// (import a.b.Name, found as a/b/Name.kt or .java anywhere in the repo).
// Other languages have no links; their files still show, grouped by folder.

const JS = /\.(m?js|cjs|jsx|tsx?|vue|svelte)$/
const CSS = /\.(css|scss|less)$/
const HTML = /\.html?$/
const PY = /\.py$/
const JVM = /\.(kt|kts|java)$/
const TRY = ['', '.js', '.ts', '.tsx', '.jsx', '.mjs', '.cjs', '.vue', '.svelte', '.css', '.scss', '/index.js', '/index.ts', '/index.tsx']

const all = (text, re) => [...text.matchAll(re)].map(m => m[1])

// the import specifiers written in a file, as written
export const importsOf = (path, text) => {
  if (JS.test(path)) return all(text, /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]([^'"\n]+)['"]/g)
  if (CSS.test(path)) return all(text, /@import\s+(?:url\()?\s*['"]([^'"\n]+)['"]/g)
  if (HTML.test(path)) return all(text, /\b(?:src|href)\s*=\s*['"]([^'"\n#?]+)/g)
  if (PY.test(path)) {
    const out = []
    for (const [, from, names] of text.matchAll(/^[ \t]*from[ \t]+([.\w]+)[ \t]+import[ \t]+([\w \t,()]+)/gm)) {
      out.push(from)
      if (/^\.+$/.test(from)) for (const name of names.split(/[\s,()]+/).filter(Boolean)) out.push(from + name) // from . import a
    }
    for (const [, names] of text.matchAll(/^[ \t]*import[ \t]+([\w., \t]+)$/gm)) out.push(...names.split(',').map(s => s.trim().split(/\s+/)[0]).filter(Boolean))
    return out.map(m => `py:${m}`)
  }
  if (JVM.test(path)) {
    // what it imports, and what it declares at the top level, so `import a.b.helper` finds the file that declares helper
    const imports = all(text, /^[ \t]*import[ \t]+(?:static[ \t]+)?([\w.]+)/gm).map(m => `jvm:${m}`)
    const declares = all(text, /^(?:(?:public|internal|private|data|sealed|enum|abstract|open|inline|value|annotation|const)[ \t]+)*(?:fun|val|var|class|object|interface|typealias)[ \t]+(?:<[^>]*>[ \t]*)?(?:[\w.]+\.)?(\w+)/gm)
    return [...imports, ...declares.map(m => `decl:${m}`)]
  }
  return []
}

// a/b/../c -> a/c; null if it climbs out of the repo
const normal = path => {
  const out = []
  for (const part of path.split('/')) {
    if (part === '..') {
      if (!out.length) return null
      out.pop()
    } else if (part && part !== '.') out.push(part)
  }
  return out.join('/')
}

const dirOf = path => path.slice(0, path.lastIndexOf('/') + 1)

// the repo file a specifier names, or null
const resolve = (spec, from, known, tails) => {
  if (spec.startsWith('decl:')) return null
  if (spec.startsWith('jvm:')) {
    const name = spec.slice(4).replace(/\./g, '/')
    const owner = name.slice(0, name.lastIndexOf('/')) // import a.B.member: the file of B
    return tails.get(`${name}.kt`) ?? tails.get(`${name}.java`) ?? tails.get(name) ?? tails.get(`${owner}.kt`) ?? tails.get(`${owner}.java`) ?? null
  }
  if (spec.startsWith('py:')) {
    const mod = spec.slice(3)
    const dots = mod.match(/^\.*/)[0].length
    let base = dirOf(from)
    for (let i = 1; i < dots; i++) base = dirOf(base.slice(0, -1))
    const rel = mod.slice(dots).replace(/\./g, '/')
    const bases = dots ? [base] : ['', dirOf(from)]
    for (const b of bases) for (const tail of ['.py', '/__init__.py']) if (rel && known.has(b + rel + tail)) return b + rel + tail
    return null
  }
  if (/^[a-z]+:|^\/\//i.test(spec)) return null // a URL
  const starts = spec.startsWith('/') ? [dirOf(from), ''] : spec.startsWith('.') || HTML.test(from) || CSS.test(from) ? [dirOf(from)] : []
  for (const start of starts) {
    const path = normal(start + spec)
    if (path === null) continue
    for (const tail of TRY) if (known.has(path + tail)) return path + tail
    const bare = path.replace(/\.[cm]?js$/, '') // TS imports written as .js
    for (const tail of ['.ts', '.tsx']) if (known.has(bare + tail)) return bare + tail
  }
  return null
}

// Map(path -> specifiers) and every path in the repo -> Map(path -> the repo files it imports)
export const resolveImports = (specs, paths) => {
  const known = new Set(paths)
  // Kotlin/Java: com/a/B.kt, and com/a/helper for what a file in com/a declares -> that file
  const tails = new Map()
  const addTails = (parts, path) => {
    for (let i = 0; i < parts.length; i++) if (!tails.has(parts.slice(i).join('/'))) tails.set(parts.slice(i).join('/'), path)
  }
  for (const path of paths) if (/\.(kt|java)$/.test(path)) addTails(path.split('/'), path)
  for (const [path, list] of specs) {
    const dir = path.split('/').slice(0, -1)
    for (const spec of list) if (spec.startsWith('decl:')) addTails([...dir, spec.slice(5)], path)
  }
  const out = new Map()
  for (const [from, list] of specs) {
    const found = new Set()
    for (const spec of list) {
      const to = resolve(spec, from, known, tails)
      if (to && to !== from) found.add(to)
    }
    if (found.size) out.set(from, [...found])
  }
  return out
}
