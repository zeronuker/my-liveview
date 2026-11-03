import assert from 'node:assert/strict'
import { test } from 'node:test'

import { fileTree, groupChats, relParts } from '../public/tree.js'

test('relParts: the parts below the chat folder, either slash, any case', () => {
  assert.deepEqual(relParts('C:\\Proj\\src\\a.js', 'C:\\Proj'), ['src', 'a.js'])
  assert.deepEqual(relParts('c:/proj/src/a.js', 'C:\\PROJ\\'), ['src', 'a.js'])
  assert.deepEqual(relParts('C:\\Proj\\a.js', 'C:\\Proj'), ['a.js'])
})

test('relParts: a path outside the folder keeps all its parts', () => {
  assert.deepEqual(relParts('D:\\other\\a.js', 'C:\\Proj'), ['D:', 'other', 'a.js'])
  assert.deepEqual(relParts('C:\\Project2\\a.js', 'C:\\Proj'), ['C:', 'Project2', 'a.js'])
  assert.deepEqual(relParts('C:\\Proj\\a.js', ''), ['C:', 'Proj', 'a.js'])
})

test('groupChats: one group per folder, in the order first seen', () => {
  const groups = groupChats([
    { id: 'a', cwd: 'C:\\x\\one' },
    { id: 'b', cwd: 'C:\\x\\two' },
    { id: 'c', cwd: 'C:\\x\\one' },
  ])

  assert.deepEqual(groups.map(g => [g.name, g.chats.map(c => c.id)]), [
    ['one', ['a', 'c']],
    ['two', ['b']],
  ])
})

test('fileTree: folders inside folders under a project, folders before files', () => {
  const cwd = 'C:\\p'
  const tree = fileTree([
    { cwd, path: 'C:\\p\\z.txt' },
    { cwd, path: 'C:\\p\\src\\b.js' },
    { cwd, path: 'C:\\p\\src\\a.js' },
    { cwd, path: 'C:\\p\\src\\deep\\c.js' },
    { cwd, path: 'C:\\p\\docs\\r.md' },
  ])

  assert.equal(tree.length, 1)
  const [project] = tree
  assert.equal(project.name, 'p')
  assert.deepEqual(project.dirs.map(d => d.name), ['docs', 'src'])
  assert.deepEqual(project.files.map(f => f.name), ['z.txt'])
  const src = project.dirs[1]
  assert.deepEqual(src.files.map(f => f.name), ['a.js', 'b.js'])
  assert.deepEqual(src.dirs.map(d => d.name), ['deep'])
  assert.deepEqual(src.dirs[0].files.map(f => f.name), ['c.js'])
})

test('fileTree: a chain of single folders becomes one row', () => {
  const [project] = fileTree([
    { cwd: 'C:\\p', path: 'D:\\users\\me\\.claude\\a.md' },
    { cwd: 'C:\\p', path: 'C:\\p\\src\\x\\y.js' },
    { cwd: 'C:\\p', path: 'C:\\p\\src\\z.js' },
  ])

  assert.deepEqual(project.dirs.map(d => d.name), ['D:/users/me/.claude', 'src'])
  assert.deepEqual(project.dirs[0].files.map(f => f.name), ['a.md'])
  // src holds a file, so its subfolder stays its own row
  assert.deepEqual(project.dirs[1].dirs.map(d => d.name), ['x'])
})

test('fileTree: one top folder for each project, sorted by name', () => {
  const tree = fileTree([
    { cwd: 'C:\\b', path: 'C:\\b\\x.js' },
    { cwd: 'C:\\a', path: 'C:\\a\\y.js' },
  ])

  assert.deepEqual(tree.map(p => p.name), ['a', 'b'])
})

test('fileTree: the entries keep their own fields', () => {
  const [project] = fileTree([{ cwd: 'C:\\p', path: 'C:\\p\\a.js', adds: 3 }])

  assert.equal(project.files[0].adds, 3)
})
