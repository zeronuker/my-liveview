import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { once } from 'node:events'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = 4798 // not the real 4747, so a running live view is left alone

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

test('stopping the server tells open windows to close, then it exits', async () => {
  const server = spawn(process.execPath, [path.join(root, 'src', 'server.js')], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore',
  })
  const exited = once(server, 'exit')
  try {
    for (let i = 0; i < 25; i++) {
      if (await fetch(`http://127.0.0.1:${PORT}/`).then(() => true, () => false)) break
      await sleep(100)
    }
    const stream = await fetch(`http://127.0.0.1:${PORT}/stream`)
    const token = fs.readFileSync(path.join(root, '.token'), 'utf8').trim()
    const stop = await fetch(`http://127.0.0.1:${PORT}/stop`, {
      method: 'POST',
      headers: { 'x-liveview-token': token },
    })
    assert.equal(stop.status, 200)

    let text = ''
    for await (const chunk of stream.body) {
      text += new TextDecoder().decode(chunk)
      if (text.includes('"type":"close"')) break
    }
    assert.match(text, /"type":"close"/)
    await exited
  } finally {
    server.kill()
  }
})

test('stopping needs the token', async () => {
  const server = spawn(process.execPath, [path.join(root, 'src', 'server.js')], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore',
  })
  try {
    for (let i = 0; i < 25; i++) {
      if (await fetch(`http://127.0.0.1:${PORT}/`).then(() => true, () => false)) break
      await sleep(100)
    }
    const stop = await fetch(`http://127.0.0.1:${PORT}/stop`, { method: 'POST' })

    assert.equal(stop.status, 401)
  } finally {
    server.kill()
  }
})
