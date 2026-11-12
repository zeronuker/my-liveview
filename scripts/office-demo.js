// npm run office-demo: a made-up session for the Office view, sent to the live
// view as hook events: a prompt, a search, some reading, a helper, a permission
// asked, a failing and then a passing test, nine new files, an edit that does
// not apply, and the end of the turn. Nothing of yours is touched; the new
// files go in demo/office-demo.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = Number(process.env.PORT) || 4747
const TOKEN = fs.readFileSync(path.join(root, '.token'), 'utf8').trim()
const dir = path.join(root, 'demo', 'office-demo')
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const chat = { session_id: 'office-demo', cwd: path.join(root, 'demo'), transcript_path: '' }

const send = body =>
  fetch(`http://127.0.0.1:${PORT}/event`, {
    method: 'POST',
    headers: { 'x-liveview-token': TOKEN, 'content-type': 'application/json' },
    body: JSON.stringify({ ...chat, ...body }),
  })

let n = 0
// one tool use, start to end; `work` runs between the two, as the tool would
const useTool = async (tool_name, tool_input, { ok = true, work } = {}) => {
  const tool_use_id = `office-demo-${Date.now()}-${n++}`
  await send({ hook_event_name: 'PreToolUse', tool_name, tool_use_id, tool_input })
  work?.()
  await sleep(300)
  await send({ hook_event_name: ok ? 'PostToolUse' : 'PostToolUseFailure', tool_name, tool_use_id, tool_input })
}

fs.rmSync(dir, { recursive: true, force: true })
fs.mkdirSync(dir, { recursive: true })

await send({ hook_event_name: 'UserPromptSubmit', prompt: 'Add the discount feature and test it' })
await sleep(800)
await useTool('Grep', { pattern: 'discount', path: path.join(root, 'demo') })
for (const name of ['cart.js', 'receipt.js', 'sample.js']) await useTool('Read', { file_path: path.join(root, 'demo', name) })

await send({ hook_event_name: 'SubagentStart', agent_id: 'demo-helper', agent_type: 'Explore' })
await sleep(1500)
await send({ hook_event_name: 'SubagentStop', agent_id: 'demo-helper', agent_type: 'Explore' })

await send({ hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: { command: 'npm test' } })
await sleep(2500)
await useTool('Bash', { command: 'npm test' }, { ok: false })
await sleep(500)

for (const name of ['discount', 'coupon', 'tax', 'totals', 'rounding', 'labels', 'format', 'limits', 'index']) {
  const file = path.join(dir, `${name}.js`)
  const content = Array.from({ length: 12 + (name.length % 5) * 6 }, (_, i) => `export const ${name}${i} = ${i}`).join('\n') + '\n'
  await useTool('Write', { file_path: file, content }, { work: () => fs.writeFileSync(file, content) })
  await sleep(150)
}

await useTool('Edit', { file_path: path.join(dir, 'tax.js'), old_string: 'not in the file', new_string: 'x' }, { ok: false })
await useTool('Bash', { command: 'npm test' })
await sleep(500)
await send({ hook_event_name: 'Stop', last_assistant_message: 'Done.' })
console.log('sent a made-up session to the Office view')
