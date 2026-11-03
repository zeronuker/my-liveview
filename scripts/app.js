// npm run app: starts the server if it is not running, then opens the page in
// an app-style window (no tabs, no address bar).
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = Number(process.env.PORT) || 4747
const url = `http://127.0.0.1:${PORT}`
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const isUp = () =>
  fetch(url, { signal: AbortSignal.timeout(500) }).then(
    res => res.ok,
    () => false,
  )

if (!(await isUp())) {
  spawn(process.execPath, [path.join(root, 'src', 'server.js')], {
    cwd: root,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  }).unref()
  for (let i = 0; i < 25 && !(await isUp()); i++) await sleep(200)
  if (!(await isUp())) {
    console.error('the server did not start; try npm start to see why')
    process.exit(1)
  }
}

// ponytail: Windows paths only; add other systems' browsers when needed
const browsers = [
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
]
const browser = browsers.find(file => fs.existsSync(file))
if (!browser) {
  console.log(`no Chrome or Edge found; open ${url} yourself`)
  process.exit(0)
}
spawn(browser, [`--app=${url}`, '--window-size=1200,800'], {
  detached: true,
  stdio: 'ignore',
}).unref()
console.log(`opened ${url}`)
