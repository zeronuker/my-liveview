import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { isRepo, listRepos, scanTree } from './tree-scan.js'

test('scanTree: lists files with their line counts and imports, skipping build folders and binaries', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lv-tree-'))
  try {
    fs.mkdirSync(path.join(dir, 'src'))
    fs.mkdirSync(path.join(dir, 'node_modules'))
    fs.writeFileSync(path.join(dir, 'a.txt'), 'one\ntwo\nthree\n')
    fs.writeFileSync(path.join(dir, 'src', 'b.js'), "import './c.js'\ny") // no final newline still counts
    fs.writeFileSync(path.join(dir, 'src', 'c.js'), '')
    fs.writeFileSync(path.join(dir, 'node_modules', 'skip.js'), 'x\n')
    fs.writeFileSync(path.join(dir, 'pic.png'), Buffer.from([137, 80, 0, 1, 2]))
    const tree = (await scanTree(dir)).sort((a, b) => (a.path < b.path ? -1 : 1))
    assert.deepEqual(tree, [{ path: 'a.txt', lines: 3 }, { path: 'src/b.js', lines: 2, imports: ['src/c.js'] }, { path: 'src/c.js', lines: 0 }])
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('scanTree: a folder that does not exist is an empty tree', async () => {
  assert.deepEqual(await scanTree(path.join(os.tmpdir(), 'lv-no-such-folder-xyz')), [])
})

test('listRepos: the git repos directly inside a folder, by name; isRepo says which folders are repos', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lv-repos-'))
  try {
    for (const name of ['beta', 'alpha', 'notes', '.hidden']) fs.mkdirSync(path.join(dir, name))
    fs.mkdirSync(path.join(dir, 'beta', '.git'))
    fs.mkdirSync(path.join(dir, '.hidden', '.git'))
    fs.writeFileSync(path.join(dir, 'alpha', '.git'), 'gitdir: elsewhere') // a worktree
    assert.deepEqual(await listRepos(dir), [{ name: 'alpha', path: path.join(dir, 'alpha') }, { name: 'beta', path: path.join(dir, 'beta') }])
    assert.equal(await isRepo(path.join(dir, 'beta')), true)
    assert.equal(await isRepo(path.join(dir, 'notes')), false)
    assert.equal(await isRepo('beta'), false) // only a full path
    assert.deepEqual(await listRepos(path.join(dir, 'missing')), [])
    assert.deepEqual(await listRepos('relative/path'), [])
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
