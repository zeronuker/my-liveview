import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = 4798 // not the real 4747, so a running live view is left alone
const base = `http://127.0.0.1:${PORT}`

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const isUp = () => fetch(`${base}/`).then(() => true, () => false)

// Runs the real server on a spare port for one test, and stops it after.
const withServer = async (run, env = {}) => {
  const server = spawn(process.execPath, [path.join(root, 'src', 'server.js')], {
    env: { ...process.env, PORT: String(PORT), ...env },
    stdio: 'ignore',
  })
  const exited = once(server, 'exit')
  try {
    for (let i = 0; i < 40 && !(await isUp()); i++) await sleep(100)
    const token = fs.readFileSync(path.join(root, '.token'), 'utf8').trim()
    await run({ token, exited })
  } finally {
    server.kill()
  }
}

// Everything a page would receive on /stream, collected as it arrives.
const listen = async () => {
  const state = { text: '' }
  const response = await fetch(`${base}/stream`)
  ;(async () => {
    for await (const chunk of response.body) state.text += new TextDecoder().decode(chunk)
  })().catch(() => {})
  state.until = async (match, ms = 4000) => {
    const end = Date.now() + ms
    while (Date.now() < end) {
      if (state.text.includes(match)) return true
      await sleep(40)
    }
    return false
  }
  return state
}

const hook = (token, body) =>
  fetch(`${base}/event`, {
    method: 'POST',
    headers: { 'x-liveview-token': token, 'content-type': 'application/json' },
    body: JSON.stringify({ session_id: 'chat1', cwd: 'C:\\proj', ...body }),
  })

test('stopping the server tells open windows to close, then it exits', () =>
  withServer(async ({ token, exited }) => {
    const page = await listen()
    const stop = await fetch(`${base}/stop`, { method: 'POST', headers: { 'x-liveview-token': token } })

    assert.equal(stop.status, 200)
    assert.ok(await page.until('"type":"close"'))
    await exited
  }))

test('a new window is told when the history ends and what follows is live', () =>
  withServer(async () => {
    const page = await listen()

    assert.ok(await page.until('"type":"ready"'))
  }))

test('stopping needs the token', () =>
  withServer(async () => {
    const stop = await fetch(`${base}/stop`, { method: 'POST' })

    assert.equal(stop.status, 401)
  }))

test('the whole file of a recent edit can be fetched; an unknown one cannot', () =>
  withServer(async ({ token }) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lv-whole-'))
    const file = path.join(dir, 'a.txt')
    fs.writeFileSync(file, 'one\ntwo\nthree\n')
    try {
      const page = await listen()
      await hook(token, {
        hook_event_name: 'PreToolUse',
        tool_name: 'Edit',
        tool_use_id: 'w1',
        tool_input: { file_path: file, old_string: 'two', new_string: 'TWO' },
      })

      assert.ok(await page.until('"hasWhole":true'))
      const whole = await fetch(`${base}/whole?id=w1`)
      assert.equal(whole.status, 200)
      assert.equal(await whole.text(), 'one\nTWO\nthree\n')
      assert.equal((await fetch(`${base}/whole?id=nope`)).status, 404)
    } finally {
      fs.rmSync(dir, { recursive: true })
    }
  }))

test('a file over 300 KB is not kept whole', () =>
  withServer(async ({ token }) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lv-whole-'))
    try {
      const page = await listen()
      await hook(token, {
        hook_event_name: 'PreToolUse',
        tool_name: 'Write',
        tool_use_id: 'big1',
        tool_input: { file_path: path.join(dir, 'big.txt'), content: 'x\n'.repeat(160 * 1024) },
      })

      assert.ok(await page.until('"hasWhole":false'))
      assert.equal((await fetch(`${base}/whole?id=big1`)).status, 404)
    } finally {
      fs.rmSync(dir, { recursive: true })
    }
  }))

test('a chat takes the name the Claude app gave it and follows a rename', () =>
  withServer(
    async ({ token }) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lv-title-'))
      const titleFile = path.join(dir, 'chat1', 'custom-title.json')
      fs.mkdirSync(path.dirname(titleFile))
      fs.writeFileSync(titleFile, JSON.stringify({ customTitle: 'First name' }))
      try {
        const page = await listen()
        await hook(token, {
          hook_event_name: 'PreToolUse',
          tool_name: 'Read',
          tool_use_id: 'r1',
          tool_input: { file_path: 'x' },
          transcript_path: path.join(dir, 'chat1.jsonl'),
        })
        assert.ok(await page.until('"title":"First name","source":"app"'))

        fs.writeFileSync(titleFile, JSON.stringify({ customTitle: 'Second name' }))
        assert.ok(await page.until('"title":"Second name","source":"app"'))

        // a window opened afterwards is told the current name, not the old one
        const late = await listen()
        assert.ok(await late.until('"type":"ready"'))
        assert.ok(late.text.includes('Second name'))
        assert.ok(late.text.lastIndexOf('Second name') > late.text.lastIndexOf('First name'))
      } finally {
        fs.rmSync(dir, { recursive: true })
      }
    },
    { TITLE_POLL_MS: '150' },
  ))

test('a chat\'s busy or idle status is sent when it changes, and to a window opened later', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lv-status-'))
  const file = path.join(dir, '1.json')
  const write = status => fs.writeFileSync(file, JSON.stringify({ sessionId: 'chat1', status, pid: process.pid }))
  write('busy')
  return withServer(
    async () => {
      try {
        const page = await listen()
        assert.ok(await page.until('"type":"status","sessionId":"chat1","status":"busy"'))

        write('idle')
        assert.ok(await page.until('"status":"idle"'))

        // a window opened afterwards is told where things stand now
        const late = await listen()
        assert.ok(await late.until('"type":"ready"'))
        assert.ok(late.text.includes('"sessionId":"chat1","status":"idle"'))
        assert.equal(late.text.includes('"status":"busy"'), false)
      } finally {
        fs.rmSync(dir, { recursive: true })
      }
    },
    { SESSIONS_DIR: dir, STATUS_POLL_MS: '100' },
  )
})

test('the first message names a chat that has no app name, and the app name wins later', () =>
  withServer(
    async ({ token }) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lv-title-'))
      try {
        const page = await listen()
        await hook(token, { hook_event_name: 'UserPromptSubmit', prompt: 'fix the login bug', transcript_path: path.join(dir, 'chat1.jsonl') })
        assert.ok(await page.until('"title":"fix the login bug","source":"message"'))

        fs.mkdirSync(path.join(dir, 'chat1'))
        fs.writeFileSync(path.join(dir, 'chat1', 'custom-title.json'), JSON.stringify({ customTitle: 'Login work' }))
        assert.ok(await page.until('"title":"Login work","source":"app"'))
      } finally {
        fs.rmSync(dir, { recursive: true })
      }
    },
    { TITLE_POLL_MS: '150' },
  ))

test('a turn ending, a subagent starting and stopping, and a permission asked reach the page', () =>
  withServer(async ({ token }) => {
    const page = await listen()
    const stop = await hook(token, { hook_event_name: 'Stop', last_assistant_message: 'done' })
    await hook(token, { hook_event_name: 'SubagentStart', agent_id: 'a1', agent_type: 'Explore' })
    await hook(token, { hook_event_name: 'SubagentStop', agent_id: 'a1', agent_type: 'Explore' })
    await hook(token, { hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: { command: 'npm test' } })

    // the answer stays empty: it must not block Claude or decide a permission
    assert.equal(stop.status, 200)
    assert.equal(await stop.text(), '{}')
    assert.ok(await page.until('"type":"turn-end","sessionId":"chat1"'))
    assert.ok(await page.until('"type":"agent-start","sessionId":"chat1"'))
    assert.ok(await page.until('"type":"agent-stop","sessionId":"chat1"'))
    assert.ok(await page.until('"agentId":"a1","agentType":"Explore"'))
    assert.ok(await page.until('"type":"permission","sessionId":"chat1"'))
    assert.ok(await page.until('"tool":"Bash","summary":"Ran: npm test"'))
  }))

test('a tool used inside a subagent says which subagent', () =>
  withServer(async ({ token }) => {
    const page = await listen()
    await hook(token, {
      hook_event_name: 'PreToolUse',
      tool_name: 'Read',
      tool_use_id: 'r1',
      tool_input: { file_path: 'C:\proj\a.js' },
      agent_id: 'a1',
      agent_type: 'Explore',
    })

    assert.ok(await page.until('"agentId":"a1","agentType":"Explore"'))
  }))
