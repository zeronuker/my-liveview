// What the Map lights up. Plain data in, plain data out, so it can be tested;
// map.js paints the result.

export const FADE_MS = 8000 // a file glows at full strength, then settles over this long
export const REST = 0.35 // and stays this lit: it was touched in this session

const KIND = { Read: 'read', Edit: 'edit', Write: 'edit' }

// 1 at the moment of the touch, falling to REST and staying there
export const glowLevel = ageMs => REST + (1 - REST) * Math.max(0, 1 - ageMs / FADE_MS)

// Which file a tool event touched and how: { path: 'src/a.js', kind: 'read' | 'edit' },
// the path below the chat's folder; null for anything else, or a file outside the folder.
export const touchOf = (event, cwd) => {
  const kind = event.type === 'tool' && event.path && KIND[event.tool]
  if (!kind || !cwd) return null
  const file = event.path.replace(/\\/g, '/')
  const dir = cwd.replace(/\\/g, '/').replace(/\/+$/, '')
  if (!file.toLowerCase().startsWith(`${dir.toLowerCase()}/`)) return null
  return { path: file.slice(dir.length + 1), kind }
}
