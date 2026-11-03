// Plays what Claude Code's hooks would send, so the page can be tried without
// touching any settings: a new 60-line file, then an edit in the middle of it.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = Number(process.env.PORT) || 4747
const TOKEN = fs.readFileSync(path.join(root, '.token'), 'utf8').trim()
const dir = path.join(root, 'demo')
const file = path.join(dir, 'sample.txt')
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const hook = (kind, id, tool, input) =>
  fetch(`http://127.0.0.1:${PORT}/event`, {
    method: 'POST',
    headers: { 'x-liveview-token': TOKEN, 'content-type': 'application/json' },
    body: JSON.stringify({
      hook_event_name: kind,
      session_id: 'demo',
      cwd: dir,
      tool_name: tool,
      tool_use_id: id,
      tool_input: input,
    }),
  })

fs.mkdirSync(dir, { recursive: true })
fs.rmSync(file, { force: true })

for (const [id, tool, input] of [
  ['demo-r', 'Read', { file_path: path.join(root, 'src', 'server.js') }],
  ['demo-g', 'Grep', { pattern: 'publish', path: 'src' }],
  ['demo-b', 'Bash', { command: 'npm test' }],
]) {
  await hook('PreToolUse', id, tool, input)
  await sleep(400)
  await hook('PostToolUse', id, tool, input)
}

const content = Array.from({ length: 60 }, (_, i) => `line ${String(i + 1).padStart(2, '0')}`).join('\n') + '\n'
await hook('PreToolUse', 'demo-1', 'Write', { file_path: file, content })
fs.writeFileSync(file, content)
await hook('PostToolUse', 'demo-1', 'Write', { file_path: file, content })
console.log('wrote a new 60-line file')

await sleep(9000)

const edit = {
  file_path: file,
  old_string: 'line 30\nline 31',
  new_string: 'line 30 EDITED\nnew line A\nnew line B\nnew line C\nline 31',
}
await hook('PreToolUse', 'demo-2', 'Edit', edit)
fs.writeFileSync(file, content.replace(edit.old_string, edit.new_string))
await hook('PostToolUse', 'demo-2', 'Edit', edit)
console.log('edited the middle of it')
