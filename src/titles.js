import fs from 'node:fs'
import path from 'node:path'

const MAX = 80

// The name the Claude app gave a chat. A chat's history is <id>.jsonl and the
// app keeps the name in <id>/custom-title.json beside it. This reads only that
// one small file, never the history. Null when there is no name.
export const readAppTitle = transcriptPath => {
  if (typeof transcriptPath !== 'string' || !transcriptPath.endsWith('.jsonl')) return null
  try {
    const file = path.join(transcriptPath.slice(0, -'.jsonl'.length), 'custom-title.json')
    const title = JSON.parse(fs.readFileSync(file, 'utf8')).customTitle
    const tidy = typeof title === 'string' ? title.replace(/\s+/g, ' ').trim() : ''
    return tidy === '' ? null : tidy.slice(0, MAX)
  } catch {
    return null // no file yet, or one half written: try again next time
  }
}
