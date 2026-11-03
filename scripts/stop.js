// npm run stop: asks the running server to exit (it checks the token).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = Number(process.env.PORT) || 4747
const token = fs.readFileSync(path.join(root, '.token'), 'utf8').trim()

const stopped = await fetch(`http://127.0.0.1:${PORT}/stop`, {
  method: 'POST',
  headers: { 'x-liveview-token': token },
  signal: AbortSignal.timeout(2000),
}).then(
  res => res.ok,
  () => false,
)
console.log(stopped ? 'stopped' : 'the server was not running')
