import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { readStatuses } from './sessions.js'

const DEAD_PID = 2147483000 // far above any process id in use

// a folder of the app's per-chat files, built from { file: contents }
const folder = files => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lv-sessions-'))
  for (const [name, contents] of Object.entries(files))
    fs.writeFileSync(path.join(dir, name), typeof contents === 'string' ? contents : JSON.stringify(contents))
  return { dir, done: () => fs.rmSync(dir, { recursive: true }) }
}

test('a chat is working or idle as its file says', () => {
  const { dir, done } = folder({
    '1.json': { sessionId: 'a', status: 'busy', pid: process.pid },
    '2.json': { sessionId: 'b', status: 'idle', pid: process.pid },
  })
  try {
    assert.deepEqual([...readStatuses(dir)], [['a', 'busy'], ['b', 'idle']])
  } finally {
    done()
  }
})

test('a chat whose process has gone is idle, even if its file still says busy', () => {
  const { dir, done } = folder({ '1.json': { sessionId: 'a', status: 'busy', pid: DEAD_PID } })
  try {
    assert.equal(readStatuses(dir).get('a'), 'idle')
  } finally {
    done()
  }
})

test('files that are broken, half written or not about a chat are skipped', () => {
  const { dir, done } = folder({
    'bad.json': '{not json',
    'empty.json': '',
    'no-status.json': { sessionId: 'x' },
    'no-id.json': { status: 'busy' },
    'notes.txt': 'busy',
    'ok.json': { sessionId: 'ok', status: 'busy', pid: process.pid },
  })
  try {
    assert.deepEqual([...readStatuses(dir)], [['ok', 'busy']])
  } finally {
    done()
  }
})

test('a folder that does not exist says nothing', () => {
  assert.equal(readStatuses(path.join(os.tmpdir(), 'lv-no-such-folder')).size, 0)
})

test('only the chat id, status and process are read from a file', () => {
  const { dir, done } = folder({
    '1.json': { sessionId: 'a', status: 'busy', pid: process.pid, name: 'secret name', cwd: 'C:\\private', messagingSocketPath: 'x' },
  })
  try {
    const [[id, status]] = [...readStatuses(dir)]

    assert.deepEqual([id, status], ['a', 'busy'])
  } finally {
    done()
  }
})
