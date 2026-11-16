// The Map's time-lapse: the repo's latest commits played back, so the city or the nebula grows as the repo did.
// Plain data in, plain data out, so it can be tested; map.js plays it.
//
// timeline(files, commits) takes the files as /tree gives them and the commits as /history gives them (oldest
// first: [{ at, files: [[path, added, removed]] }]) and gives { start, end, commits, steps, created, net }.
// stateAt(line, file, t) says whether the file was there at time t, how long it was and when it last changed;
// changesBetween(line, t0, t1) which files changed in between, and whether they were new.

export const timeline = (files, commits) => {
  const steps = new Map() // path -> [{ at, net }]: the file's lines added less removed by each commit, so far
  for (const { at, files: changed } of commits) {
    for (const [path, added, removed] of changed) {
      const list = steps.get(path) ?? steps.set(path, []).get(path)
      list.push({ at, net: (list.at(-1)?.net ?? 0) + added - removed })
    }
  }
  // a file whose lines today are all from these commits was made in them: at its first one
  const created = new Map()
  const net = new Map()
  for (const f of files) {
    const list = steps.get(f.path)
    if (!list) continue
    net.set(f.path, list.at(-1).net)
    if (f.lines - list.at(-1).net <= 0) created.set(f.path, list[0].at)
  }
  return { start: commits[0]?.at ?? 0, end: commits.at(-1)?.at ?? 0, commits, steps, created, net }
}

// { exists, lines, changed } for a file at time t: its lines then are today's less what was added since
export const stateAt = (line, file, t) => {
  const made = line.created.get(file.path)
  if (made !== undefined && t < made) return { exists: false, lines: 0, changed: undefined }
  const list = line.steps.get(file.path) ?? []
  let last = null
  for (const step of list) if (step.at <= t) last = step
  const since = (line.net.get(file.path) ?? 0) - (last?.net ?? 0)
  return { exists: true, lines: Math.max(1, file.lines - since), changed: last?.at }
}

// the files changed by the commits after t0 up to t1: [{ path, kind: 'new' | 'edit' }]
export const changesBetween = (line, t0, t1) => {
  const out = new Map()
  for (const { at, files } of line.commits) {
    if (at <= t0 || at > t1) continue
    for (const [path] of files) if (!out.has(path)) out.set(path, line.created.get(path) === at ? 'new' : 'edit')
  }
  return [...out].map(([path, kind]) => ({ path, kind }))
}
