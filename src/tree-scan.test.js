import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { scanTree } from './tree-scan.js'

test('scanTree: lists files with their line counts, skipping build folders and binaries', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lv-tree-'))
  try {
    fs.mkdirSync(path.join(dir, 'src'))
    fs.mkdirSync(path.join(dir, 'node_modules'))
    fs.writeFileSync(path.join(dir, 'a.txt'), 'one\ntwo\nthree\n')
    fs.writeFileSync(path.join(dir, 'src', 'b.js'), 'x\ny') // no final newline still counts
    fs.writeFileSync(path.join(dir, 'node_modules', 'skip.js'), 'x\n')
    fs.writeFileSync(path.join(dir, 'pic.png'), Buffer.from([137, 80, 0, 1, 2]))
    const tree = (await scanTree(dir)).sort((a, b) => (a.path < b.path ? -1 : 1))
    assert.deepEqual(tree, [{ path: 'a.txt', lines: 3 }, { path: 'src/b.js', lines: 2 }])
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('scanTree: a folder that does not exist is an empty tree', async () => {
  assert.deepEqual(await scanTree(path.join(os.tmpdir(), 'lv-no-such-folder-xyz')), [])
})
