import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'

import { importsOf, resolveImports } from './imports.js'

// The repo's files and how long each is, for the Map view. Read-only.
// shortcut: it walks the folder and skips a fixed list of build folders instead of reading .gitignore; use `git ls-files` if ignored files show up.
const SKIP = new Set(['.git', 'node_modules', 'dist', 'build', 'target', '__pycache__', '.venv', '.next', 'coverage'])
const MAX_FILES = 20000 // the walk stops here, so a huge folder cannot hold the server up
const MAX_BYTES = 1024 * 1024 // a bigger file is not read, so it counts as one line per 40 bytes

// how many lines, and what it imports; lines -1 for a binary file
const readFile = async (file, size, rel) => {
  if (size > MAX_BYTES) {
    const handle = await fs.open(file)
    const { buffer, bytesRead } = await handle.read(Buffer.alloc(8000), 0, 8000, 0).finally(() => handle.close())
    return buffer.subarray(0, bytesRead).includes(0) ? { lines: -1 } : { lines: Math.ceil(size / 40), specs: [] }
  }
  const buf = await fs.readFile(file)
  if (buf.subarray(0, 8000).includes(0)) return { lines: -1 }
  let n = buf.length > 0 && buf[buf.length - 1] !== 10 ? 1 : 0
  for (const byte of buf) if (byte === 10) n++
  return { lines: n, specs: importsOf(rel, buf.toString('utf8')) }
}

const git = (dir, args) =>
  new Promise(resolve => execFile('git', args, { cwd: dir, maxBuffer: 64 * 1024 * 1024, timeout: 8000 }, (error, out) => resolve(error ? '' : out)))

// the repo's latest commits below `dir`, oldest first: [{ at: ms, files: [[path, lines added, lines removed], ...] }];
// [] when `dir` is not in a git repo. Read-only.
export const gitHistory = async dir => {
  const log = await git(dir, ['log', '-n', '3000', '--relative', '--no-renames', '--format=@%ct', '--numstat'])
  const commits = []
  for (const line of log.split('\n')) {
    if (line.startsWith('@')) commits.push({ at: Number(line.slice(1)) * 1000, files: [] })
    else if (line && commits.length) {
      const [added, removed, ...rest] = line.split('\t')
      const path = rest.join('\t')
      if (path) commits.at(-1).files.push([path, Number(added) || 0, Number(removed) || 0])
    }
  }
  return commits.reverse()
}

// git's word on each file: Map(path below `dir` -> { changed: ms of its last change, changes: how many commits
// touched it }), from the latest commits; a file changed but not committed yet changed now
export const gitChanged = async dir => {
  const out = new Map()
  const [history, diff, untracked] = await Promise.all([
    gitHistory(dir),
    git(dir, ['diff', '--name-only', '--relative', 'HEAD']),
    git(dir, ['ls-files', '--others', '--exclude-standard']),
  ])
  for (const { at, files } of history) {
    for (const [path] of files) {
      const was = out.get(path)
      out.set(path, { changed: at, changes: (was?.changes ?? 0) + 1 })
    }
  }
  const now = Date.now()
  for (const path of [...diff.split('\n'), ...untracked.split('\n')]) if (path) out.set(path, { changed: now, changes: out.get(path)?.changes ?? 0 })
  return out
}

// [{ path: 'src/a.js', lines: 12, imports: ['src/b.js'], changed: ms, changes: 3 }], paths below `root` with forward
// slashes; imports only when the file imports other files in the repo, changed and changes only when git knows the file
export const scanTree = async root => {
  const out = []
  const specs = new Map()
  const walk = async (dir, prefix) => {
    for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
      if (out.length >= MAX_FILES) return
      const rel = prefix + entry.name
      if (entry.isDirectory()) {
        if (!SKIP.has(entry.name)) await walk(path.join(dir, entry.name), `${rel}/`)
      } else if (entry.isFile()) {
        const file = path.join(dir, entry.name)
        const stat = await fs.stat(file).catch(() => null)
        const read = stat && (await readFile(file, stat.size, rel).catch(() => null))
        if (read?.lines >= 0) {
          out.push({ path: rel, lines: read.lines })
          if (read.specs.length) specs.set(rel, read.specs)
        }
      }
    }
  }
  const [, changed] = await Promise.all([walk(root, ''), gitChanged(root)])
  const imports = resolveImports(specs, out.map(f => f.path))
  for (const f of out) {
    if (imports.has(f.path)) f.imports = imports.get(f.path)
    if (changed.has(f.path)) Object.assign(f, changed.get(f.path))
  }
  return out
}

// a git repo: a folder with .git in it (a folder, or a file in a worktree)
export const isRepo = async dir => Boolean(dir) && path.isAbsolute(dir) && (await fs.stat(path.join(dir, '.git')).catch(() => null)) !== null

// the git repos directly inside `dir`, by name: [{ name, path }]; [] if it cannot be read
export const listRepos = async dir => {
  if (!dir || !path.isAbsolute(dir)) return []
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
  const out = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory() && !entry.name.startsWith('.') && (await isRepo(full))) out.push({ name: entry.name, path: full })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}
