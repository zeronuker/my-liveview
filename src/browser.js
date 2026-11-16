// Opens a page in an app-style Chrome or Edge window (no tabs, no address bar). Used by `npm run app` for the main
// window and by the server for the windows the page's "New window" menu asks for.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

// ponytail: Windows paths only; add other systems' browsers when needed
const browsers = [
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
]

// Its own profile, so every window opens at this size and not wherever the everyday Chrome last left one; Chrome then
// remembers any resize. The same profile means a running app window takes the new one into itself.
const profile = path.join(process.env.LOCALAPPDATA ?? root, 'my-liveview', 'chrome-profile')

// false if no Chrome or Edge is installed; `extra` adds command-line flags, such as the window's position
export const openAppWindow = (url, extra = []) => {
  const browser = browsers.find(file => fs.existsSync(file))
  if (!browser) return false
  spawn(
    browser,
    [
      `--app=${url}`,
      `--user-data-dir=${profile}`,
      '--window-size=1910,1063',
      '--no-first-run',
      '--no-default-browser-check',
      ...extra,
    ],
    { detached: true, stdio: 'ignore' },
  ).unref()
  return true
}
