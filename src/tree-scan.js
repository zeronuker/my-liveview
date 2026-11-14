import fs from 'node:fs/promises'
import path from 'node:path'

// The repo's files and how long each is, for the Map view. Read-only.
// shortcut: it walks the folder and skips a fixed list of build folders instead of reading .gitignore; use `git ls-files` if ignored files show up.
const SKIP = new Set(['.git', 'node_modules', 'dist', 'build', 'target', '__pycache__', '.venv', '.next', 'coverage'])
const MAX_FILES = 20000 // the walk stops here, so a huge folder cannot hold the server up
const MAX_BYTES = 1024 * 1024 // a bigger file is not read, so it counts as one line per 40 bytes

const countLines = async (file, size) => {
  if (size > MAX_BYTES) return Math.ceil(size / 40)
  const buf = await fs.readFile(file)
  if (buf.subarray(0, 8000).includes(0)) return -1 // binary: left out
  let n = buf.length > 0 && buf[buf.length - 1] !== 10 ? 1 : 0
  for (const byte of buf) if (byte === 10) n++
  return n
}

// [{ path: 'src/a.js', lines: 12 }], paths below `root` with forward slashes
export const scanTree = async root => {
  const out = []
  const walk = async (dir, prefix) => {
    for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
      if (out.length >= MAX_FILES) return
      const rel = prefix + entry.name
      if (entry.isDirectory()) {
        if (!SKIP.has(entry.name)) await walk(path.join(dir, entry.name), `${rel}/`)
      } else if (entry.isFile()) {
        const file = path.join(dir, entry.name)
        const stat = await fs.stat(file).catch(() => null)
        const lines = stat && (await countLines(file, stat.size).catch(() => -1))
        if (lines >= 0) out.push({ path: rel, lines })
      }
    }
  }
  await walk(root, '')
  return out
}
