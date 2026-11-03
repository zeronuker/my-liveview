// npm run burst: seven new files from two chats within a second, as if several
// things were being worked on at once, so both panes fill and the rest wait.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = Number(process.env.PORT) || 4747
const TOKEN = fs.readFileSync(path.join(root, '.token'), 'utf8').trim()
const dir = path.join(root, 'demo', 'burst')
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const chats = {
  one: { session_id: 'burst-chat-one', cwd: path.join(root, 'demo') },
  two: { session_id: 'burst-chat-two', cwd: path.join(root, 'demo', 'other-project') },
}
const send = (who, kind, id, input) =>
  fetch(`http://127.0.0.1:${PORT}/event`, {
    method: 'POST',
    headers: { 'x-liveview-token': TOKEN, 'content-type': 'application/json' },
    body: JSON.stringify({ ...chats[who], hook_event_name: kind, tool_name: 'Write', tool_use_id: id, tool_input: input }),
  })

fs.rmSync(dir, { recursive: true, force: true })
fs.mkdirSync(dir, { recursive: true })
const content = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join('\n') + '\n'

for (const [who, name] of [['one', 'a'], ['one', 'b'], ['two', 'x'], ['one', 'c'], ['two', 'y'], ['one', 'd'], ['one', 'e']]) {
  const file = path.join(dir, `burst-${name}.txt`)
  const id = `burst-${name}-${Date.now()}`
  const input = { file_path: file, content }
  await send(who, 'PreToolUse', id, input)
  fs.writeFileSync(file, content)
  await send(who, 'PostToolUse', id, input)
  await sleep(100)
}
console.log('sent a burst of seven files from two chats')
