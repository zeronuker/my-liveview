// node scripts/hooks.js install|uninstall [--dry-run]
// Edits ~/.claude/settings.json (or $CLAUDE_SETTINGS), after copying it aside.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { install, uninstall } from '../src/hooks-config.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = Number(process.env.PORT) || 4747
const url = `http://127.0.0.1:${PORT}/event`
const file = process.env.CLAUDE_SETTINGS ?? path.join(os.homedir(), '.claude', 'settings.json')
const [command, flag] = process.argv.slice(2)

if (command !== 'install' && command !== 'uninstall') {
  console.error('usage: node scripts/hooks.js install|uninstall [--dry-run]')
  process.exit(1)
}

const tokenFile = path.join(root, '.token')
if (!fs.existsSync(tokenFile)) {
  console.error('no .token yet: start the server once (npm start) so it makes one')
  process.exit(1)
}
const token = fs.readFileSync(tokenFile, 'utf8').trim()

const before = JSON.parse(fs.readFileSync(file, 'utf8'))
const after = command === 'install' ? install(before, url, token) : uninstall(before, url)
const text = JSON.stringify(after, null, 2) + '\n'

if (flag === '--dry-run') {
  console.log(text.replaceAll(token, '<token>')) // the token stays out of the output
  process.exit(0)
}

const backup = `${file}.liveview-${Date.now()}.bak`
fs.copyFileSync(file, backup)
fs.writeFileSync(file, text)
console.log(`${command}ed. the old settings are kept at ${backup}`)
