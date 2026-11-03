// What the sidebar's file rows are called. Plain data in, plain data out, so
// it can be tested; app.js turns the result into rows.
const lastPart = path => path.split(/[\\/]/).filter(Boolean).pop() ?? path

// The parts of a path below the chat's folder; the whole path when it lies
// elsewhere. Windows paths: either slash, and the case is not told apart.
export const relParts = (path, cwd) => {
  const p = path.replace(/\\/g, '/')
  const c = cwd.replace(/\\/g, '/').replace(/\/+$/, '')
  const isInside = c !== '' && p.toLowerCase().startsWith(`${c.toLowerCase()}/`)
  return (isInside ? p.slice(c.length + 1) : p).split('/').filter(Boolean)
}

// How each file in a chat's list is named: just its name, or its path below
// the chat's folder when two of them share a name.
export const fileLabels = (paths, cwd) => {
  const names = paths.map(lastPart)
  return new Map(
    paths.map((path, i) => [path, names.filter(name => name === names[i]).length > 1 ? relParts(path, cwd).join('/') : names[i]]),
  )
}
