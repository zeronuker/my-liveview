import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { applyEdit, makeRows } from './diff.js'
import { gitKind, summarize, titleOf } from './summary.js'
import { readStatuses } from './sessions.js'
import { readAppTitle } from './titles.js'
import { scanTree } from './tree-scan.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = Number(process.env.PORT) || 4747
const HOST = '127.0.0.1'
const MAX_FILE = 2 * 1024 * 1024
const MAX_BODY = 10 * 1024 * 1024
const KEEP = 500 // events a page that opens late replays
const WHOLE_MAX = 300 * 1024 // the biggest file kept whole, in characters
const WHOLE_KEEP = 30 // how many recent edits keep their whole file
const TITLE_POLL_MS = Number(process.env.TITLE_POLL_MS) || 3000
const STATUS_POLL_MS = Number(process.env.STATUS_POLL_MS) || 1000

// The hooks carry this token: the server reads files from disk on their word.
const tokenFile = path.join(root, '.token')
if (!fs.existsSync(tokenFile))
  fs.writeFileSync(tokenFile, crypto.randomBytes(24).toString('hex'))
const TOKEN = fs.readFileSync(tokenFile, 'utf8').trim()

const events = []
const clients = new Set()
const wholes = new Map() // edit id -> the whole file as the edit left it (memory only)
const transcripts = new Map() // chat -> { path, cwd }: where the app keeps its history
const appTitles = new Map() // chat -> the name the app gave it, last sent
const latestTitles = new Map() // chat -> the title event a newly opened window needs
const statuses = new Map() // chat -> working or idle, as the app last said
const seenCwds = new Set() // the chat folders hooks have named: the only ones /tree will read

// to every open window, but not into the history a new window replays
const broadcast = event => {
  for (const res of clients) res.write(`data: ${JSON.stringify(event)}\n\n`)
}

const publish = event => {
  if (event.cwd) seenCwds.add(event.cwd)
  events.push(event)
  if (events.length > KEEP) events.shift()
  // the app's name beats the first message's; a new window is sent whichever wins
  if (event.type === 'title' && (event.source === 'app' || !latestTitles.has(event.sessionId)))
    latestTitles.set(event.sessionId, event)
  broadcast(event)
}

// Whether each chat is busy or idle, from the app's own record; a change is
// sent on, and a window opened later is told the current state of every chat.
const pollStatuses = () => {
  for (const [sessionId, status] of readStatuses()) {
    if (statuses.get(sessionId) === status) continue
    statuses.set(sessionId, status)
    broadcast({ type: 'status', sessionId, status, at: Date.now() })
  }
}

// The name the Claude app shows for a chat, which it can change at any time.
const checkTitle = sessionId => {
  const chat = transcripts.get(sessionId)
  const title = chat && readAppTitle(chat.path)
  if (!title || appTitles.get(sessionId) === title) return
  appTitles.set(sessionId, title)
  publish({ type: 'title', sessionId, cwd: chat.cwd, title, source: 'app', at: Date.now() })
}

const publishEdit = ({ tool, input, id, sessionId, cwd }) => {
  let before = ''
  let existed = true
  try {
    if (fs.statSync(input.file_path).size > MAX_FILE) {
      // too big to read and compare: the page still lists the edit, with a line saying why
      const rows = [{ kind: 'gap', text: '... this file is over 2 MB, so its edit is not shown' }]
      publish({ type: 'edit', id, sessionId, cwd, path: input.file_path, rows, adds: 0, dels: 0, isNew: false, hasWhole: false, tooBig: true, at: Date.now() })
      return
    }
    before = fs.readFileSync(input.file_path, 'utf8')
  } catch {
    existed = false // a Write may create the file: nothing to compare with
  }
  const after = applyEdit(before, tool, input)
  if (after === null) return // the tool will refuse it

  const rows = makeRows(before, after)
  const adds = rows.filter(r => r.kind === 'add').length
  const dels = rows.filter(r => r.kind === 'del').length
  if (adds + dels === 0) return

  // the page asks for the whole file when it shows this edit: keep the latest few
  const hasWhole = after.length <= WHOLE_MAX
  if (hasWhole) {
    wholes.set(id, after)
    if (wholes.size > WHOLE_KEEP) wholes.delete(wholes.keys().next().value)
  }

  publish({ type: 'edit', id, sessionId, cwd, path: input.file_path, rows, adds, dels, isNew: !existed, hasWhole, at: Date.now() })
}

// the life of a session: what each hook is called in the Office, and what it carries
const LIFE = {
  SessionStart: 'start', SessionEnd: 'end', PostModelSwitch: 'model', CwdChanged: 'cwd',
  DirectoryAdded: 'folder', InstructionsLoaded: 'memo', ConfigChange: 'memo',
  PostToolBatch: 'batch', TaskCreated: 'task-new', TaskCompleted: 'task-done', TeammateIdle: 'teammate', UserPromptExpansion: 'command',
}
const firstText = (...values) => values.find(value => typeof value === 'string' && value) ?? ''
const lastPart = text => text.split(/[\\/]/).filter(Boolean).pop() ?? ''

const titled = new Set() // chats that already have a title

const onHook = p => {
  const { hook_event_name: kind, session_id: sessionId, cwd } = p
  const { tool_name: tool, tool_input: input, tool_use_id: id } = p

  // every hook says where the app keeps the chat's history, and so its name
  if (sessionId && typeof p.transcript_path === 'string') {
    transcripts.set(sessionId, { path: p.transcript_path, cwd })
    checkTitle(sessionId)
  }

  if (kind === 'UserPromptSubmit') {
    // a chat with no app name yet is named by its first message; only that
    // short title is kept
    publish({ type: 'prompt', sessionId, cwd, at: Date.now() }) // that one was sent, not what it said
    const title = titled.has(sessionId) ? null : titleOf(p.prompt)
    if (!title) return
    titled.add(sessionId)
    publish({ type: 'title', sessionId, cwd, title, source: 'message', at: Date.now() })
    return
  }
  // the Office view: a turn ends, a subagent comes and goes, a permission is asked
  const at = Date.now()
  if (kind === 'Stop') return publish({ type: 'turn-end', sessionId, cwd, at })
  if (kind === 'SubagentStart' || kind === 'SubagentStop') {
    const type = kind === 'SubagentStart' ? 'agent-start' : 'agent-stop'
    return publish({ type, sessionId, cwd, agentId: p.agent_id, agentType: p.agent_type, at })
  }
  if (kind === 'PermissionRequest') return publish({ type: 'permission', sessionId, cwd, tool, summary: summarize(tool, input), at })
  // trouble: the turn ended by an API error, memory being compacted, a tool refused in auto mode
  if (kind === 'StopFailure') return publish({ type: 'turn-fail', sessionId, cwd, reason: typeof p.error === 'string' ? p.error : 'unknown', at })
  if (kind === 'PreCompact' || kind === 'PostCompact') return publish({ type: 'compact', sessionId, cwd, phase: kind === 'PreCompact' ? 'start' : 'end', at })
  if (kind === 'PermissionDenied') return publish({ type: 'denied', sessionId, cwd, tool, at })
  // Claude has been left waiting: only that kind of notification, never its words
  if (kind === 'Notification') return p.notification_type === 'idle_prompt' ? publish({ type: 'life', what: 'idle', detail: '', sessionId, cwd, at }) : undefined
  if (LIFE[kind]) {
    // only a short word comes along: how it started or ended, the model, the folder's name
    const detail = {
      start: firstText(p.source),
      end: firstText(p.reason),
      model: firstText(p.model, p.model_name),
      cwd: lastPart(firstText(p.new_cwd)),
      folder: lastPart(firstText(p.directory, p.path)),
      command: firstText(p.command_name),
    }[LIFE[kind]] ?? ''
    return publish({ type: 'life', what: LIFE[kind], detail, sessionId, cwd, at })
  }
  if (!tool) return

  if (kind === 'PreToolUse') {
    // inside a subagent the hook says which one, so the Office can tell its workers apart
    const agent = p.agent_id ? { agentId: p.agent_id, agentType: p.agent_type } : {}
    const path = typeof input?.file_path === 'string' ? { path: input.file_path } : {}
    const git = gitKind(tool, input) // only whether it is a commit or a push, for the Office to celebrate
    publish({ type: 'tool', id, sessionId, cwd, tool, summary: summarize(tool, input), ...path, ...agent, ...(git ? { git } : {}), at })
    if (tool === 'Edit' || tool === 'Write') publishEdit({ tool, input, id, sessionId, cwd })
  } else if (kind === 'PostToolUse' || kind === 'PostToolUseFailure') {
    publish({ type: 'done', id, ok: kind === 'PostToolUse' })
  }
}

const files = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/highlight.js': ['highlight.js', 'text/javascript; charset=utf-8'],
  '/tree.js': ['tree.js', 'text/javascript; charset=utf-8'],
  '/inline.js': ['inline.js', 'text/javascript; charset=utf-8'],
  '/typing.js': ['typing.js', 'text/javascript; charset=utf-8'],
  '/whole.js': ['whole.js', 'text/javascript; charset=utf-8'],
  '/pane.js': ['pane.js', 'text/javascript; charset=utf-8'],
  '/place.js': ['place.js', 'text/javascript; charset=utf-8'],
  '/resize.js': ['resize.js', 'text/javascript; charset=utf-8'],
  '/office.js': ['office.js', 'text/javascript; charset=utf-8'],
  '/director.js': ['director.js', 'text/javascript; charset=utf-8'],
  '/stage.js': ['stage.js', 'text/javascript; charset=utf-8'],
  '/layout.js': ['layout.js', 'text/javascript; charset=utf-8'],
  '/studio.js': ['studio.js', 'text/javascript; charset=utf-8'],
  '/pixel.js': ['pixel.js', 'text/javascript; charset=utf-8'],
  '/garden.js': ['garden.js', 'text/javascript; charset=utf-8'],
  '/pets.js': ['pets.js', 'text/javascript; charset=utf-8'],
  '/names.js': ['names.js', 'text/javascript; charset=utf-8'],
  '/glide.js': ['glide.js', 'text/javascript; charset=utf-8'],
  '/fish.js': ['fish.js', 'text/javascript; charset=utf-8'],
  '/lights.js': ['lights.js', 'text/javascript; charset=utf-8'],
  '/walk.js': ['walk.js', 'text/javascript; charset=utf-8'],
  '/recorder.js': ['recorder.js', 'text/javascript; charset=utf-8'],
  '/sprites.js': ['sprites.js', 'text/javascript; charset=utf-8'],
  '/effects.js': ['effects.js', 'text/javascript; charset=utf-8'],
  '/scenery.js': ['scenery.js', 'text/javascript; charset=utf-8'],
  '/palette.js': ['palette.js', 'text/javascript; charset=utf-8'],
  '/city.js': ['city.js', 'text/javascript; charset=utf-8'],
  '/glow.js': ['glow.js', 'text/javascript; charset=utf-8'],
  '/sphere.js': ['sphere.js', 'text/javascript; charset=utf-8'],
  '/map.js': ['map.js', 'text/javascript; charset=utf-8'],
  '/vendor/three.module.min.js': ['vendor/three.module.min.js', 'text/javascript; charset=utf-8'],
  '/vendor/OrbitControls.js': ['vendor/OrbitControls.js', 'text/javascript; charset=utf-8'],
  '/art-preview.html': ['art-preview.html', 'text/html; charset=utf-8'],
  '/angled-concept.html': ['angled-concept.html', 'text/html; charset=utf-8'],
  '/viewparam.js': ['viewparam.js', 'text/javascript; charset=utf-8'],
  '/iso.js': ['iso.js', 'text/javascript; charset=utf-8'],
  '/iso-art.js': ['iso-art.js', 'text/javascript; charset=utf-8'],
  '/iso-doors.js': ['iso-doors.js', 'text/javascript; charset=utf-8'],
  '/iso-draw.js': ['iso-draw.js', 'text/javascript; charset=utf-8'],
  '/iso-furniture.js': ['iso-furniture.js', 'text/javascript; charset=utf-8'],
  '/iso-garden.js': ['iso-garden.js', 'text/javascript; charset=utf-8'],
  '/iso-scene.js': ['iso-scene.js', 'text/javascript; charset=utf-8'],
  '/sound.js': ['sound.js', 'text/javascript; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
}

const server = http.createServer((req, res) => {
  // a page on another site must not reach this server (DNS rebinding)
  if (req.headers.host !== `${HOST}:${PORT}` && req.headers.host !== `localhost:${PORT}`) {
    res.writeHead(403).end()
    return
  }
  const url = new URL(req.url, 'http://local')
  const { pathname } = url

  if (req.method === 'GET' && pathname === '/whole') {
    // the whole file for one edit, if it is still kept (the latest few, up to 300 KB each)
    const text = wholes.get(url.searchParams.get('id'))
    if (text === undefined) {
      res.writeHead(404).end()
      return
    }
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }).end(text)
    return
  }

  if (req.method === 'GET' && pathname === '/tree') {
    // the files and their lengths in a chat's folder, for the Map; only folders a hook has named
    const cwd = url.searchParams.get('cwd')
    if (!cwd || !seenCwds.has(cwd)) {
      res.writeHead(404).end()
      return
    }
    scanTree(cwd).then(tree => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(tree)))
    return
  }

  if (req.method === 'POST' && pathname === '/event') {
    if (req.headers['x-liveview-token'] !== TOKEN) {
      res.writeHead(401).end()
      return
    }
    let body = ''
    req.on('data', chunk => {
      body += chunk
      if (body.length > MAX_BODY) req.destroy()
    })
    req.on('end', () => {
      try {
        onHook(JSON.parse(body))
      } catch (error) {
        console.error('bad event:', error.message)
      }
      // always answer fast and empty: the hook must never hold Claude up
      res.writeHead(200, { 'content-type': 'application/json' }).end('{}')
    })
    return
  }

  if (req.method === 'POST' && pathname === '/stop') {
    if (req.headers['x-liveview-token'] !== TOKEN) {
      res.writeHead(401).end()
      return
    }
    // tell open windows to close themselves, then exit once it has gone out
    for (const client of clients) client.write('data: {"type":"close"}\n\n')
    res.writeHead(200).end('{}')
    setTimeout(() => process.exit(0), 300)
    return
  }

  if (req.method === 'GET' && pathname === '/stream') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
    res.write(': connected\n\n') // headers only go out with a first write
    for (const event of events) res.write(`data: ${JSON.stringify(event)}\n\n`)
    // every chat's current name, in case its title event has left the history
    for (const title of latestTitles.values()) res.write(`data: ${JSON.stringify(title)}\n\n`)
    for (const [sessionId, status] of statuses) res.write(`data: ${JSON.stringify({ type: 'status', sessionId, status })}\n\n`)
    res.write('data: {"type":"ready"}\n\n') // the history is over: what follows is live
    clients.add(res)
    req.on('close', () => clients.delete(res))
    return
  }

  // the Office's art, one file for each part of the place: /art/<name>.js
  const art = req.method === 'GET' && /^\/art\/([a-z0-9-]+)\.js$/.exec(pathname)
  if (art && fs.existsSync(path.join(root, 'public', 'art', `${art[1]}.js`))) {
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' })
    res.end(fs.readFileSync(path.join(root, 'public', 'art', `${art[1]}.js`)))
    return
  }

  const file = req.method === 'GET' && files[pathname]
  if (!file) {
    res.writeHead(404).end()
    return
  }
  res.writeHead(200, { 'content-type': file[1] })
  res.end(fs.readFileSync(path.join(root, 'public', file[0])))
})

setInterval(() => {
  for (const res of clients) res.write(': keepalive\n\n')
}, 20000).unref()

// a chat renamed in the app is followed within a few seconds
setInterval(() => {
  for (const sessionId of transcripts.keys()) checkTitle(sessionId)
}, TITLE_POLL_MS).unref()

pollStatuses()
setInterval(pollStatuses, STATUS_POLL_MS).unref()

server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? `port ${PORT} is already in use` : error.message)
  process.exit(1)
})
server.listen(PORT, HOST, () => console.log(`live view: http://${HOST}:${PORT}`))
