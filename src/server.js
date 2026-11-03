import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { applyEdit, makeRows } from './diff.js'
import { summarize } from './summary.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = Number(process.env.PORT) || 4747
const HOST = '127.0.0.1'
const MAX_FILE = 2 * 1024 * 1024
const MAX_BODY = 10 * 1024 * 1024
const KEEP = 500 // events a page that opens late replays

// The hooks carry this token: the server reads files from disk on their word.
const tokenFile = path.join(root, '.token')
if (!fs.existsSync(tokenFile))
  fs.writeFileSync(tokenFile, crypto.randomBytes(24).toString('hex'))
const TOKEN = fs.readFileSync(tokenFile, 'utf8').trim()

const events = []
const clients = new Set()

const publish = event => {
  events.push(event)
  if (events.length > KEEP) events.shift()
  for (const res of clients) res.write(`data: ${JSON.stringify(event)}\n\n`)
}

const publishEdit = ({ tool, input, id, sessionId, cwd }) => {
  let before = ''
  let existed = true
  try {
    if (fs.statSync(input.file_path).size > MAX_FILE) return
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

  publish({ type: 'edit', id, sessionId, cwd, path: input.file_path, rows, adds, dels, isNew: !existed, at: Date.now() })
}

const onHook = p => {
  const { hook_event_name: kind, session_id: sessionId, cwd } = p
  const { tool_name: tool, tool_input: input, tool_use_id: id } = p
  if (!tool) return

  if (kind === 'PreToolUse') {
    publish({ type: 'tool', id, sessionId, cwd, tool, summary: summarize(tool, input), at: Date.now() })
    if (tool === 'Edit' || tool === 'Write') publishEdit({ tool, input, id, sessionId, cwd })
  } else if (kind === 'PostToolUse' || kind === 'PostToolUseFailure') {
    publish({ type: 'done', id, ok: kind === 'PostToolUse' })
  }
}

const files = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
}

const server = http.createServer((req, res) => {
  // a page on another site must not reach this server (DNS rebinding)
  if (req.headers.host !== `${HOST}:${PORT}` && req.headers.host !== `localhost:${PORT}`) {
    res.writeHead(403).end()
    return
  }
  const { pathname } = new URL(req.url, 'http://local')

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

  if (req.method === 'GET' && pathname === '/stream') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
    for (const event of events) res.write(`data: ${JSON.stringify(event)}\n\n`)
    clients.add(res)
    req.on('close', () => clients.delete(res))
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

server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? `port ${PORT} is already in use` : error.message)
  process.exit(1)
})
server.listen(PORT, HOST, () => console.log(`live view: http://${HOST}:${PORT}`))
