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

const hook = (kind, id, tool, input, extra = {}) =>
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
      ...extra,
    }),
  })

fs.mkdirSync(dir, { recursive: true })
fs.rmSync(file, { force: true })

// the first message of a chat names it in the sidebar
await hook('UserPromptSubmit', undefined, undefined, undefined, { prompt: 'Fix the login bug in the demo app' })

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

// a JavaScript file, for the syntax colors and the change map
const js = path.join(dir, 'sample.js')
const code = [
  "import { read } from './store.js'",
  '',
  '// how many entries to keep',
  'const LIMIT = 50',
  '',
  ...Array.from({ length: 28 }, (_, i) => `const item${i + 1} = read('key-${i + 1}', ${i + 1})`),
  '',
  'export function total(list) {',
  '  let sum = 0',
  '  for (const entry of list) {',
  '    if (entry.ok) sum += entry.value',
  '  }',
  '  return sum',
  '}',
  '',
].join('\n')
await hook('PreToolUse', 'demo-3', 'Write', { file_path: js, content: code })
fs.writeFileSync(js, code)
await hook('PostToolUse', 'demo-3', 'Write', { file_path: js, content: code })
await sleep(7000)

const jsEdit = {
  file_path: js,
  old_string: '    if (entry.ok) sum += entry.value',
  new_string: "    if (!entry.ok) continue // skip failed entries\n    if (entry.value > LIMIT) throw new Error('too big')\n    sum += entry.value",
}
await hook('PreToolUse', 'demo-4', 'Edit', jsEdit)
fs.writeFileSync(js, code.replace(jsEdit.old_string, jsEdit.new_string))
await hook('PostToolUse', 'demo-4', 'Edit', jsEdit)
// one word changed inside a line: only that word is brightened
await sleep(5000)
const limitEdit = { file_path: js, old_string: 'const LIMIT = 50', new_string: 'const LIMIT = 75' }
await hook('PreToolUse', 'demo-5', 'Edit', limitEdit)
fs.writeFileSync(js, fs.readFileSync(js, 'utf8').replace(limitEdit.old_string, limitEdit.new_string))
await hook('PostToolUse', 'demo-5', 'Edit', limitEdit)
console.log('wrote and edited a JavaScript file')

// a second chat, in another project folder
const other = path.join(root, 'demo', 'other.txt')
const otherCwd = path.join(root, 'demo', 'other-project')
const otherHook = (kind, id, tool, input, extra = {}) =>
  fetch(`http://127.0.0.1:${PORT}/event`, {
    method: 'POST',
    headers: { 'x-liveview-token': TOKEN, 'content-type': 'application/json' },
    body: JSON.stringify({
      hook_event_name: kind,
      session_id: 'second-chat-0001',
      cwd: otherCwd,
      tool_name: tool,
      tool_use_id: id,
      tool_input: input,
      ...extra,
    }),
  })
await otherHook('UserPromptSubmit', undefined, undefined, undefined, { prompt: 'Write notes: alpha, beta and gamma' })
const text = 'alpha\nbeta\ngamma\n'
await otherHook('PreToolUse', 'other-1', 'Write', { file_path: other, content: text })
fs.writeFileSync(other, text)
await otherHook('PostToolUse', 'other-1', 'Write', { file_path: other, content: text })
console.log('a second chat wrote a file')
