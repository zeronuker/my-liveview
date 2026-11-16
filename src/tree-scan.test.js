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
    fs.writeFileSync(path.join(dir, 'model.bin'), Buffer.concat([Buffer.from([1, 0, 2]), Buffer.alloc(1100 * 1024, 7)])) // big and binary: left out too
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

test('scanTree: in a git repo each file says when it last changed; an uncommitted change is now', async () => {
  const { execFileSync } = await import('node:child_process')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lv-git-'))
  try {
    const run = (...args) => execFileSync('git', args, { cwd: dir, env: { ...process.env, GIT_AUTHOR_DATE: '2020-01-02T00:00:00Z', GIT_COMMITTER_DATE: '2020-01-02T00:00:00Z' } })
    run('init', '-q')
    fs.writeFileSync(path.join(dir, 'old.js'), 'x\n')
    fs.writeFileSync(path.join(dir, 'edited.js'), 'x\n')
    run('add', '.')
    run('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'one')
    fs.writeFileSync(path.join(dir, 'edited.js'), 'y\n')
    fs.writeFileSync(path.join(dir, 'new.js'), 'z\n')
    const before = Date.now()
    const tree = Object.fromEntries((await scanTree(dir)).map(f => [f.path, f.changed]))
    assert.equal(tree['old.js'], Date.parse('2020-01-02T00:00:00Z'))
    assert.ok(tree['edited.js'] >= before && tree['new.js'] >= before)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
