// Mock sessions: a scenario is a short list of plain steps; this turns it into
// the hook events Claude would send, and plays them at a Live View server over
// the same path the real hooks use. Scenarios are in scenarios.js.
//
// Steps (each is an array):
//   ['prompt', text]              the person sends a message
//   ['read', file]  ['grep', pattern]  ['glob', pattern]
//   ['write', file, lines]        a new file of that many lines
//   ['edit', file]                a change that applies
//   ['editFails', file]           a change that does not apply
//   ['bash', 'ok' | 'fail', command]
//   ['agentStart', id, type]  ['agentStop', id, type]
//   ['ask', ms]                   a permission is asked and waits that long
//   ['mcp', 'ok' | 'fail', server]  a tool of an MCP server
//   ['denied']                    a tool is refused in auto mode
//   ['compact', ms]               memory is compacted, taking that long
//   ['fail', error]               the API ends the turn with an error (rate_limit, ...)
//   ['wait', ms]
//   ['chat', name]                from here on, steps are in another chat
//   ['pace', 'fast' | 'normal']   whether a tool takes any time between its start and end
//   ['stop']                      Claude finishes its turn
import path from 'node:path'

// Actions: { do: 'hook', body } to send, { do: 'file', path, content } to write
// (before or while a tool runs), { do: 'wait', ms }. `dir` is where files go;
// `tick` is how long a tool takes between its start and end.
export const toActions = (name, steps, { dir, cwd = path.dirname(dir), tick = 300 }) => {
  const actions = []
  let count = 0
  let chat = 'one'
  let wait = tick
  const at = file => path.join(dir, file)
  const hook = body => actions.push({ do: 'hook', body: { session_id: `mock-${name}-${chat}`, cwd, ...body } })
  const file = (filePath, content) => actions.push({ do: 'file', path: filePath, content })
  const pause = ms => ms > 0 && actions.push({ do: 'wait', ms })

  // one tool, start to end; `before` files exist already, `during` appear while it runs
  const tool = (tool_name, tool_input, { ok = true, before, during } = {}) => {
    const tool_use_id = `mock-${name}-${count++}`
    if (before) file(before.path, before.content)
    hook({ hook_event_name: 'PreToolUse', tool_name, tool_use_id, tool_input })
    if (during) file(during.path, during.content)
    pause(wait)
    hook({ hook_event_name: ok ? 'PostToolUse' : 'PostToolUseFailure', tool_name, tool_use_id, tool_input })
  }

  for (const [kind, a, b, c] of steps) {
    switch (kind) {
      case 'prompt':
        hook({ hook_event_name: 'UserPromptSubmit', prompt: a })
        break
      case 'read':
        tool('Read', { file_path: at(a) })
        break
      case 'grep':
        tool('Grep', { pattern: a, path: dir })
        break
      case 'glob':
        tool('Glob', { pattern: a })
        break
      case 'write': {
        const content = Array.from({ length: b ?? 10 }, (_, i) => `export const ${path.parse(a).name}${i} = ${i}`).join('\n') + '\n'
        tool('Write', { file_path: at(a), content }, { during: { path: at(a), content } })
        break
      }
      case 'edit':
        tool(
          'Edit',
          { file_path: at(a), old_string: 'old line', new_string: 'new line' },
          { before: { path: at(a), content: 'old line\n' }, during: { path: at(a), content: 'new line\n' } },
        )
        break
      case 'editFails':
        tool('Edit', { file_path: at(a), old_string: 'not in the file', new_string: 'x' }, { ok: false, before: { path: at(a), content: 'x\n' } })
        break
      case 'bash':
        tool('Bash', { command: c ?? 'npm test' }, { ok: a === 'ok' })
        break
      case 'agentStart':
        hook({ hook_event_name: 'SubagentStart', agent_id: a, agent_type: b })
        break
      case 'agentStop':
        hook({ hook_event_name: 'SubagentStop', agent_id: a, agent_type: b })
        break
      case 'ask':
        hook({ hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: { command: 'npm test' } })
        pause(a)
        break
      case 'mcp':
        tool(`mcp__${b ?? 'github'}__search`, { query: 'x' }, { ok: a === 'ok' })
        break
      case 'denied':
        hook({ hook_event_name: 'PermissionDenied', tool_name: 'Bash', tool_input: { command: 'rm -rf build' }, reason: 'denied by auto mode' })
        break
      case 'compact':
        hook({ hook_event_name: 'PreCompact', trigger: 'auto', custom_instructions: null })
        pause(a)
        hook({ hook_event_name: 'PostCompact', trigger: 'auto', compact_summary: 'summary' })
        break
      case 'fail':
        hook({ hook_event_name: 'StopFailure', error: a ?? 'rate_limit', last_assistant_message: 'API Error: Rate limit reached' })
        break
      case 'wait':
        pause(a)
        break
      case 'chat':
        chat = a
        break
      case 'pace':
        wait = a === 'fast' ? 0 : tick
        break
      case 'stop':
        hook({ hook_event_name: 'Stop', last_assistant_message: 'Done.' })
        break
      default:
        throw new Error(`unknown mock step: ${kind}`)
    }
  }
  return actions
}

// Does the actions one after another. `scale` stretches or squeezes the waits
// (0 for none); `write`, `send` and `sleep` are how files, events and time work,
// so a test can play without a disk, a server or a clock.
export const play = async (actions, { scale = 1, write, send, sleep }) => {
  for (const action of actions) {
    if (action.do === 'file') write(action.path, action.content)
    else if (action.do === 'wait') await sleep(action.ms * scale)
    else if (!(await send(action.body))) throw new Error(`the server refused ${action.body.hook_event_name}`)
  }
}
