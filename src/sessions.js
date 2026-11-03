import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const sessionsDir = () => process.env.SESSIONS_DIR || path.join(os.homedir(), '.claude', 'sessions')

const isAlive = pid => {
  try {
    process.kill(pid, 0) // sends nothing: only asks whether the process exists
    return true
  } catch (error) {
    return error.code === 'EPERM' // it exists, but is not ours to signal
  }
}

// Whether each chat is working or idle, as the Claude app records it: one small
// file per running chat in ~/.claude/sessions. Only the chat's id, its status
// and its process are read; nothing else in those files is used or kept.
// A chat whose process has gone cannot be working, whatever its file says.
export const readStatuses = (dir = sessionsDir()) => {
  const statuses = new Map()
  let names
  try {
    names = fs.readdirSync(dir)
  } catch {
    return statuses // no such folder (a chat run some other way): nothing to say
  }
  for (const name of names.filter(file => file.endsWith('.json'))) {
    try {
      const { sessionId, status, pid } = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'))
      if (typeof sessionId !== 'string' || typeof status !== 'string') continue
      statuses.set(sessionId, Number.isInteger(pid) && !isAlive(pid) ? 'idle' : status)
    } catch {
      // half written at this moment: it is read again next time
    }
  }
  return statuses
}
