import assert from 'node:assert/strict'
import { test } from 'node:test'

import { parseView, VIEW_NAMES } from '../public/viewparam.js'

test('each view in the address pins the choices it stands for', () => {
  assert.deepEqual(parseView('?view=code'), { name: 'Code', office: false, map: false, angled: false })
  assert.deepEqual(parseView('?view=office'), { name: 'Office', office: true, map: false, angled: false })
  assert.deepEqual(parseView('?view=angled'), { name: 'Office, angled', office: true, map: false, angled: true })
  assert.deepEqual(parseView('?view=map'), { name: 'Map', office: true, map: true, angled: false })
})

test('an address with no view, or one we do not have, pins nothing', () => {
  for (const search of ['', '?', '?view=', '?view=nonsense', '?view=__proto__', '?other=1', '?view=Angled']) assert.equal(parseView(search), null, search)
})

test('the view can be anywhere in the query, and every pinnable view has a name', () => {
  assert.equal(parseView('?x=1&view=angled&y=2').angled, true)
  assert.deepEqual(Object.keys(VIEW_NAMES).sort(), ['angled', 'code', 'map', 'office'])
})
