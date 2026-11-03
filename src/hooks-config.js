// What goes into Claude Code's settings.json: one http hook per event, which
// only ever reports (the server answers fast and empty; a down server never
// holds Claude up). Both functions return a new settings object.
const TOOL_EVENTS = ['PreToolUse', 'PostToolUse', 'PostToolUseFailure']

const isOurs = (url, handler) => handler.type === 'http' && handler.url === url

// Takes out what install added; every other hook stays as it was.
export const uninstall = (settings, url) => {
  const hooks = {}
  for (const [event, groups] of Object.entries(settings.hooks ?? {})) {
    const kept = groups
      .map(group => ({ ...group, hooks: group.hooks.filter(h => !isOurs(url, h)) }))
      .filter(group => group.hooks.length > 0)
    if (kept.length > 0) hooks[event] = kept
  }
  const next = { ...settings, hooks }
  if (Object.keys(hooks).length === 0) delete next.hooks
  return next
}

// Safe to run twice: it removes its own earlier entries first.
export const install = (settings, url, token) => {
  const base = uninstall(settings, url)
  const hooks = { ...base.hooks }
  const handler = { type: 'http', url, timeout: 5, headers: { 'x-liveview-token': token } }
  for (const event of TOOL_EVENTS)
    hooks[event] = [
      ...(hooks[event] ?? []),
      { matcher: '*', hooks: [handler] }, // every tool: the activity feed shows reads and commands too
    ]
  // a chat's first message names it in the sidebar; this event has no tool to match
  hooks.UserPromptSubmit = [...(hooks.UserPromptSubmit ?? []), { hooks: [handler] }]
  return { ...base, hooks }
}
