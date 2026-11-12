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
//   { cmd: 'fail', sessionId, label }  the API ended the turn with an error
//   { cmd: 'compact' | 'compacted', sessionId }  memory is being compacted, and is done
//   { cmd: 'denied', sessionId, tool } a tool was refused in auto mode
//   { cmd: 'note', who: 'ceo' | 'manager', text, kind }  a few words over one of them
//   { cmd: 'memo', sessionId }         the manager reads a memo (instructions or settings loaded)
//   { cmd: 'clear', sessionId }        /clear: the manager's tray is emptied
// An MCP tool is an errand outside the office: steps call (with `server`) and unavailable.

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

// an MCP tool is called mcp__<server>__<tool>: an errand outside the office
const MCP_TOOL = /^mcp__(.+?)__/
const MCP_ERRAND = { start: 'call', ok: 'report', fail: 'unavailable' }

// what the manager says when the API ends a turn with an error
const FAILURES = {
  rate_limit: 'Rate limit',
  overloaded: 'Servers busy',
  server_error: 'API error',
  max_output_tokens: 'Output too long',
  authentication_failed: 'Sign-in problem',
  oauth_org_not_allowed: 'Sign-in problem',
  cloud_credential_error: 'Sign-in problem',
  billing_error: 'Billing problem',
  account_on_hold: 'Billing problem',
}

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
  const compacting = new Set() // sessions whose memory is being compacted
  const memoed = new Set() // sessions where the manager was just given a memo

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

  // any later event means a permission that was asked has been answered, and
  // that a compaction that began is over
  const answered = (sessionId, out) => {
    if (asking.delete(sessionId)) out.push({ cmd: 'answered', sessionId })
    if (compacting.delete(sessionId)) out.push({ cmd: 'compacted', sessionId })
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
    const server = e.tool.match(MCP_TOOL)?.[1]
    const errand = ERRANDS[e.tool] ?? (server && MCP_ERRAND)
    if (errand) {
      const worker = hire(e.sessionId, 'worker')
      calls.set(e.id, { worker, errand })
      return [{ cmd: 'hire', worker }, act(worker, errand.start, { server })]
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

  // the turn is over, one way or another: everyone goes home
  const sendHome = sessionId => {
    const out = []
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

  // Claude finished: the manager checks what was handed in and takes it upstairs
  const onTurnEnd = sessionId => {
    const delivered = (handedIn.get(sessionId) ?? []).map(worker => worker.id)
    const out = delivered.length > 0 ? [{ cmd: 'review', sessionId, workers: delivered }, { cmd: 'submit', sessionId, workers: delivered }] : []
    return [...out, ...sendHome(sessionId)]
  }

  // the life of the session: a note over the CEO or the manager
  const note = (who, text, kind = 'info') => ({ cmd: 'note', who, text, kind })
  const onLife = e => {
    const out = []
    const { sessionId, detail } = e
    switch (e.what) {
      case 'start':
        if (detail === 'compact') return [] // compaction has its own scene
        if (detail === 'clear') out.push({ cmd: 'clear', sessionId })
        return [...out, note('ceo', { resume: 'Resumed', clear: 'Fresh start' }[detail] ?? 'New session')]
      case 'end':
        answered(sessionId, out)
        // /clear ends the session and starts another at once: only the second is announced
        return [...out, ...(detail === 'clear' ? [] : [note('ceo', 'Session ended')]), ...sendHome(sessionId)]
      case 'model':
        return [note('manager', detail ? `Model: ${detail}` : 'Model changed')]
      case 'cwd':
        return [note('manager', detail ? `Now in ${detail}` : 'Folder changed')]
      case 'folder':
        return [note('manager', detail ? `Added ${detail}` : 'Folder added')]
      case 'memo':
        // several in a row are one memo
        if (memoed.has(sessionId)) return []
        memoed.add(sessionId)
        return [{ cmd: 'memo', sessionId }]
      default:
        return []
    }
  }

  const feed = e => {
    const out = []
    if (!(e.type === 'life' && e.what === 'memo')) memoed.delete(e.sessionId)
    switch (e.type) {
      case 'life':
        return onLife(e)
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
      case 'turn-fail':
        // an API error ends the turn: the manager says so, nothing goes upstairs
        answered(e.sessionId, out)
        return [...out, { cmd: 'fail', sessionId: e.sessionId, label: FAILURES[e.reason] ?? 'API error' }, ...sendHome(e.sessionId)]
      case 'compact':
        if (e.phase === 'start') {
          compacting.add(e.sessionId)
          return [{ cmd: 'compact', sessionId: e.sessionId }]
        }
        return compacting.delete(e.sessionId) ? [{ cmd: 'compacted', sessionId: e.sessionId }] : []
      case 'denied':
        answered(e.sessionId, out)
        return [...out, { cmd: 'denied', sessionId: e.sessionId, tool: e.tool }]
      default:
        return []
    }
  }

  // Has the turn gone quiet? People are in the office, but nothing is running,
  // no helper is working and no permission is waiting. Stop does not fire when
  // Claude is interrupted, so the Office uses this to end such a turn itself.
  const isQuiet = sessionId =>
    (staff.get(sessionId)?.size ?? 0) > 0 &&
    !asking.has(sessionId) &&
    !compacting.has(sessionId) &&
    ![...calls.values()].some(call => call.worker.sessionId === sessionId) &&
    ![...agents.values()].some(worker => worker.sessionId === sessionId)

  return { feed, isQuiet }
}
