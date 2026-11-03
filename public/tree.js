// What the sidebar's two trees are made of. Plain data in, plain data out, so
// it can be tested; app.js turns the result into rows.
const lastPart = path => path.split(/[\\/]/).filter(Boolean).pop() ?? path
const byName = (a, b) => a.name.localeCompare(b.name)

// The parts of a path below the chat's folder; the whole path when it lies
// elsewhere. Windows paths: either slash, and the case is not told apart.
export const relParts = (path, cwd) => {
  const p = path.replace(/\\/g, '/')
  const c = cwd.replace(/\\/g, '/').replace(/\/+$/, '')
  const isInside = c !== '' && p.toLowerCase().startsWith(`${c.toLowerCase()}/`)
  return (isInside ? p.slice(c.length + 1) : p).split('/').filter(Boolean)
}

// Chats grouped under the folder they work in, in the order first seen.
export const groupChats = chats => {
  const groups = new Map()
  for (const chat of chats) {
    const group = groups.get(chat.cwd) ?? { cwd: chat.cwd, name: lastPart(chat.cwd), chats: [] }
    groups.set(chat.cwd, group)
    group.chats.push(chat)
  }
  return [...groups.values()]
}

// Files as folders inside folders, one top folder per project. Folders come
// first, then files, each sorted by name, so a row never moves under the
// pointer when something new arrives. `entries` carry a `cwd` and a `path`.
export const fileTree = entries => {
  const projects = new Map()
  for (const entry of entries) {
    const project = projects.get(entry.cwd) ?? { cwd: entry.cwd, name: lastPart(entry.cwd), dirs: new Map(), files: [] }
    projects.set(entry.cwd, project)
    let dir = project
    for (const part of relParts(entry.path, entry.cwd).slice(0, -1)) {
      if (!dir.dirs.has(part)) dir.dirs.set(part, { name: part, dirs: new Map(), files: [] })
      dir = dir.dirs.get(part)
    }
    dir.files.push({ ...entry, name: lastPart(entry.path) })
  }
  // a folder holding only one folder and no files joins it: Users/Amir/.claude
  const compact = dir => {
    let merged = dir
    while (merged.dirs.length === 1 && merged.files.length === 0) {
      const [only] = merged.dirs
      merged = { ...only, name: `${merged.name}/${only.name}` }
    }
    return merged
  }
  const finish = (dir, isProject) => {
    const built = {
      ...dir,
      dirs: [...dir.dirs.values()].map(sub => finish(sub, false)).sort(byName),
      files: dir.files.sort(byName),
    }
    return isProject ? built : compact(built)
  }
  return [...projects.values()].map(project => finish(project, true)).sort(byName)
}
