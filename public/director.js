// The Office's story. It takes what the server reports (a tool starting, an
// edit, a turn ending...) and says what the office does about it: hire a
// worker, give a worker a step, send one home. Plain data in, plain data out,
// so it can be tested; the Office view plays the commands, in order for each
// worker, and decides how long each takes.
//
// This is a good story, not a live mirror: every file edited or created gets
// its own worker, however many there are, and an edit that took a moment
// still plays out as a full walk and write.
//
// Commands:
//   { cmd: 'hire', worker }            a worker walks in (see hire below)
//   { cmd: 'do', worker, step, ... }   fetch, study, write, handIn, reject, test,
//                                      pass, fail, search, report, arrive
//   { cmd: 'fire', worker }            the worker goes home
//   { cmd: 'review' | 'submit', sessionId, workers }  the manager checks the work
//                                      handed in, then takes it upstairs
//   { cmd: 'ask', sessionId, tool, summary } / { cmd: 'answered', sessionId }
//   { cmd: 'prompt', sessionId }       the person sent a message

// a mix of English and Malay, women and men
export const NAMES = [
  'Alice', 'Aisyah', 'Daniel', 'Farid', 'Chloe', 'Nurul', 'Henry', 'Hafiz',
  'Grace', 'Siti', 'Ben', 'Zul', 'Emily', 'Aminah', 'James', 'Irfan',
  'Sophie', 'Hana', 'Tom', 'Amir', 'Olivia', 'Liyana', 'Frank', 'Haziq',
]

export const COLORS = [
  '#e76f51', '#2a9d8f', '#e9c46a', '#457b9d', '#9b5de5', '#f15bb5',
  '#06d6a0', '#ef476f', '#118ab2', '#f4a261', '#8ac926', '#6a4c93',
]

// what an errand to a shelf or the test lab is called at the start, on success and on failure
const ERRANDS = {
  Bash: { start: 'test', ok: 'pass', fail: 'fail' },
  Grep: { start: 'search', ok: 'report', fail: 'fail' },
  Glob: { start: 'search', ok: 'report', fail: 'fail' },
}
const FILE_TOOLS = new Set(['Read', 'Edit', 'Write'])

export const createDirector = ({ random = Math.random } = {}) => {
  let count = 0
  const names = new Set() // in use right now
  const colors = new Set()
  const files = new Map() // session|path -> the worker on that file
  const calls = new Map() // tool id -> { worker, tool, errand, study }
  const agents = new Map() // agent id -> the subagent's worker
  const staff = new Map() // session -> the workers in that office
  const handedIn = new Map() // session -> workers with work for the manager
  const asking = new Set() // sessions waiting on a permission

  // one of the free ones; when all are taken they repeat
  const pickFree = (list, taken) => {
    const free = list.filter(item => !taken.has(item))
    const from = free.length > 0 ? free : list
    return from[Math.floor(random() * from.length)]
  }

  const hire = (sessionId, kind, extra = {}) => {
    const worker = { id: `w${++count}`, sessionId, kind, name: pickFree(NAMES, names), color: pickFree(COLORS, colors), ...extra }
    names.add(worker.name)
    colors.add(worker.color)
    if (!staff.has(sessionId)) staff.set(sessionId, new Set())
    staff.get(sessionId).add(worker)
    return worker
  }

  // the worker has gone home: the name and colour are free again
  const release = worker => {
    names.delete(worker.name)
    colors.delete(worker.color)
    staff.get(worker.sessionId)?.delete(worker)
  }

  const act = (worker, step, extra) => ({ cmd: 'do', worker: worker.id, step, ...extra })
  const send = worker => ({ cmd: 'fire', worker: worker.id })

  // any later event means a permission that was asked has been answered
  const answered = (sessionId, out) => {
    if (asking.delete(sessionId)) out.push({ cmd: 'answered', sessionId })
  }

  const workerFor = (sessionId, path) => {
    const key = `${sessionId}|${path}`
    const known = files.get(key)
    if (known) return { worker: known, isNew: false }
    const worker = hire(sessionId, 'worker', { path })
    files.set(key, worker)
    return { worker, isNew: true }
  }

  const onTool = e => {
    const errand = ERRANDS[e.tool]
    if (errand) {
      const worker = hire(e.sessionId, 'worker')
      calls.set(e.id, { worker, errand })
      return [{ cmd: 'hire', worker }, act(worker, errand.start)]
    }
    if (!FILE_TOOLS.has(e.tool) || !e.path) return []

    const { worker, isNew } = workerFor(e.sessionId, e.path)
    const out = isNew ? [{ cmd: 'hire', worker }] : []
    // a Write makes the file from scratch; the rest take a book from the shelf first
    const takesBook = isNew && e.tool !== 'Write'
    if (takesBook) out.push(act(worker, 'fetch', { path: e.path }))
    // an edit is studied before it is made; a read is studied once the file has arrived
    if (takesBook && e.tool === 'Edit') out.push(act(worker, 'study', { path: e.path }))
    calls.set(e.id, { worker, tool: e.tool, study: takesBook && e.tool === 'Read' })
    return out
  }

  const onEdit = e => {
    const { worker, isNew } = workerFor(e.sessionId, e.path)
    worker.wrote = true
    return [
      ...(isNew ? [{ cmd: 'hire', worker }] : []),
      act(worker, 'write', { path: e.path, adds: e.adds, dels: e.dels, isNew: e.isNew }),
    ]
  }

  const onDone = e => {
    const call = calls.get(e.id)
    if (!call) return []
    calls.delete(e.id)
    const { worker } = call

    if (call.errand) {
      release(worker)
      return [act(worker, e.ok ? call.errand.ok : call.errand.fail), send(worker)]
    }
    if (!e.ok) return [act(worker, call.tool === 'Read' ? 'fail' : 'reject')]
    if (call.tool === 'Read') return call.study ? [act(worker, 'study')] : []

    // an edit that went through is handed in; one that was never announced is written first
    const list = handedIn.get(worker.sessionId) ?? []
    if (!list.includes(worker)) list.push(worker)
    handedIn.set(worker.sessionId, list)
    return [...(worker.wrote ? [] : [act(worker, 'write', { path: worker.path })]), act(worker, 'handIn')]
  }

  const onTurnEnd = sessionId => {
    const out = []
    const delivered = (handedIn.get(sessionId) ?? []).map(worker => worker.id)
    if (delivered.length > 0)
      out.push({ cmd: 'review', sessionId, workers: delivered }, { cmd: 'submit', sessionId, workers: delivered })
    for (const worker of [...(staff.get(sessionId) ?? [])]) {
      out.push(send(worker))
      release(worker)
    }
    handedIn.delete(sessionId)
    for (const [key, worker] of files) if (worker.sessionId === sessionId) files.delete(key)
    for (const [key, call] of calls) if (call.worker.sessionId === sessionId) calls.delete(key)
    for (const [key, worker] of agents) if (worker.sessionId === sessionId) agents.delete(key)
    return out
  }

  const feed = e => {
    const out = []
    switch (e.type) {
      case 'tool':
        answered(e.sessionId, out)
        return [...out, ...onTool(e)]
      case 'edit':
        return onEdit(e)
      case 'done':
        return onDone(e)
      case 'agent-start': {
        const worker = hire(e.sessionId, 'subagent', { agentId: e.agentId, agentType: e.agentType })
        agents.set(e.agentId, worker)
        return [{ cmd: 'hire', worker }, act(worker, 'arrive')]
      }
      case 'agent-stop': {
        const worker = agents.get(e.agentId)
        if (!worker) return []
        agents.delete(e.agentId)
        release(worker)
        return [act(worker, 'report'), send(worker)]
      }
      case 'permission':
        asking.add(e.sessionId)
        return [{ cmd: 'ask', sessionId: e.sessionId, tool: e.tool, summary: e.summary }]
      case 'prompt':
        answered(e.sessionId, out)
        return [...out, { cmd: 'prompt', sessionId: e.sessionId }]
      case 'turn-end':
        answered(e.sessionId, out)
        return [...out, ...onTurnEnd(e.sessionId)]
      default:
        return []
    }
  }

  return { feed }
}
