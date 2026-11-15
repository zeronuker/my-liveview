import assert from 'node:assert/strict'
import { test } from 'node:test'

import { importsOf, resolveImports } from './imports.js'

const links = (files, paths = Object.keys(files)) =>
  Object.fromEntries(resolveImports(new Map(Object.entries(files).map(([p, text]) => [p, importsOf(p, text)])), paths))

test('JS and TS: relative imports, exports, require and import() are followed; packages are not', () => {
  const got = links({
    'src/a.js': "import x from './b.js'\nimport './c'\nexport { y } from '../lib/d'\nconst e = require('./e.cjs')\nimport('./f.js')\nimport React from 'react'",
    'src/b.js': '', 'src/c.ts': '', 'lib/d/index.js': '', 'src/e.cjs': '', 'src/f.ts': '',
  })
  assert.deepEqual(got, { 'src/a.js': ['src/b.js', 'src/c.ts', 'lib/d/index.js', 'src/e.cjs', 'src/f.ts'] })
})

test('CSS and HTML: @import, src and href; a URL is not a file', () => {
  const got = links({
    'web/index.html': '<link href="/style.css"><script src="app.js"></script><a href="https://x.org/a.js">',
    'web/style.css': "@import 'base.css';", 'web/base.css': '', 'web/app.js': '',
  })
  assert.deepEqual(got, { 'web/index.html': ['web/style.css', 'web/app.js'], 'web/style.css': ['web/base.css'] })
})

test('Python: from-imports, relative imports and plain imports', () => {
  const got = links({
    'pkg/a.py': 'from . import b\nfrom .sub import c\nimport pkg.d, os\nfrom pkg.d import thing',
    'pkg/b.py': '', 'pkg/sub/__init__.py': '', 'pkg/d.py': '',
  })
  assert.deepEqual(got, { 'pkg/a.py': ['pkg/b.py', 'pkg/sub/__init__.py', 'pkg/d.py'] })
})

test('a file that only imports itself or missing files has no links', () => {
  assert.deepEqual(links({ 'a.js': "import './a.js'\nimport './gone.js'\nimport '../../out.js'" }), {})
})
