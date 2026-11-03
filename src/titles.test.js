import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { readAppTitle } from './titles.js'

// a chat's history path, with the folder the app keeps beside it
const chat = contents => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lv-titles-'))
  fs.mkdirSync(path.join(dir, 'abc'))
  if (contents !== undefined) fs.writeFileSync(path.join(dir, 'abc', 'custom-title.json'), contents)
  return { transcript: path.join(dir, 'abc.jsonl'), done: () => fs.rmSync(dir, { recursive: true }) }
}

test('the name the app gave a chat is read from the file beside its history', () => {
  const { transcript, done } = chat('{"customTitle":"ClaudeBorne BrandKit ChangeLog Updates"}')
  try {
    assert.equal(readAppTitle(transcript), 'ClaudeBorne BrandKit ChangeLog Updates')
  } finally {
    done()
  }
})

test('a missing file, broken contents or an empty name give no name', () => {
  for (const contents of [undefined, '{not json', '{}', '{"customTitle":"   "}', '{"customTitle":7}']) {
    const { transcript, done } = chat(contents)
    try {
      assert.equal(readAppTitle(transcript), null)
    } finally {
      done()
    }
  }
})

test('the name is tidied and cut to 80 characters', () => {
  const { transcript, done } = chat(JSON.stringify({ customTitle: `  a   b\n${'x'.repeat(200)}` }))
  try {
    const title = readAppTitle(transcript)

    assert.equal(title.length, 80)
    assert.ok(title.startsWith('a b x'))
  } finally {
    done()
  }
})

test('anything that is not a history path gives no name', () => {
  assert.equal(readAppTitle(undefined), null)
  assert.equal(readAppTitle('C:\\x\\notes.txt'), null)
  assert.equal(readAppTitle('C:\\no\\such\\folder\\x.jsonl'), null)
})
