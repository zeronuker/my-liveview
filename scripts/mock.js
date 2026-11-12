// npm run mock -- <name>   plays a mock session at the running Live View
// npm run mock -- --list   says what there is
// npm run mock -- --all    plays every one, one after another
// Files a scenario makes go in demo/mock (not kept in git). PORT picks the server.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { play, toActions } from '../src/mock.js'
import { SCENARIOS } from '../src/scenarios.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = Number(process.env.PORT) || 4747
const dir = path.join(root, 'demo', 'mock')
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const [arg] = process.argv.slice(2)

if (!arg || arg === '--list') {
  for (const [name, { about }] of Object.entries(SCENARIOS)) console.log(`${name.padEnd(14)} ${about}`)
  console.log('\nnpm run mock -- <name>   or   npm run mock -- --all')
  process.exit(0)
}
const names = arg === '--all' ? Object.keys(SCENARIOS) : [arg]
for (const name of names)
  if (!SCENARIOS[name]) {
    console.error(`no scenario called ${name}; npm run mock -- --list shows them`)
    process.exit(1)
  }

const tokenFile = path.join(root, '.token')
if (!fs.existsSync(tokenFile)) {
  console.error('no .token yet: start the server once (npm start) so it makes one')
  process.exit(1)
}
const token = fs.readFileSync(tokenFile, 'utf8').trim()

const send = body =>
  fetch(`http://127.0.0.1:${PORT}/event`, {
    method: 'POST',
    headers: { 'x-liveview-token': token, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).then(
    res => res.ok,
    () => false,
  )
const write = (file, content) => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content)
}

fs.rmSync(dir, { recursive: true, force: true })
for (const name of names) {
  console.log(`playing ${name}: ${SCENARIOS[name].about}`)
  await play(toActions(name, SCENARIOS[name].steps, { dir }), { write, send, sleep })
  if (names.length > 1) await sleep(4000)
}
console.log('done')
