const MAX = 200

const cut = text => (text.length > MAX ? `${text.slice(0, MAX - 1)}…` : text)
const firstLine = text => String(text ?? '').split('\n')[0]

const TITLE_MAX = 50

// A chat's name, from its first message: the first line with any words on it,
// 50 characters at most. A slash command is not a name, so it gives none.
// The rest of the message is dropped here and never kept.
export const titleOf = prompt => {
  const line = String(prompt ?? '')
    .split('\n')
    .map(text => text.replace(/\s+/g, ' ').trim())
    .find(Boolean)
  if (!line || line.startsWith('/')) return null
  return line.length > TITLE_MAX ? `${line.slice(0, TITLE_MAX - 1)}…` : line
}

// One short line for the activity feed. Nothing here is kept on disk.
export const summarize = (tool, input = {}) => {
  switch (tool) {
    case 'Read':
      return cut(`Read ${input.file_path}`)
    case 'Edit':
      return cut(`Edit ${input.file_path}`)
    case 'Write':
      return cut(`Write ${input.file_path}`)
    case 'Bash':
      return cut(`Ran: ${firstLine(input.command)}`)
    case 'Grep':
      return cut(`Search for ${input.pattern}${input.path ? ` in ${input.path}` : ''}`)
    case 'Glob':
      return cut(`Find files ${input.pattern}`)
    case 'WebFetch':
      return cut(`Fetch ${input.url}`)
    case 'WebSearch':
      return cut(`Web search: ${input.query}`)
    case 'Agent':
    case 'Task':
      return cut(`Subagent: ${input.description ?? ''}`)
    default:
      return tool // an unknown or MCP tool: its name, never its inputs
  }
}
