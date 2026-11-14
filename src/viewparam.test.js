import assert from 'node:assert/strict'
import { test } from 'node:test'

import { parseView, VIEW_NAMES } from '../public/viewparam.js'

test('each view in the address pins the choices it stands for', () => {
  assert.deepEqual(parseView('?view=code'), { name: 'Code', office: false, map: false, angled: false })
  assert.deepEqual(parseView('?view=office'), { name: 'Office', office: true, map: false, angled: false })
  assert.deepEqual(parseView('?view=angled'), { name: 'Office, angled', office: true, map: false, angled: true })
  assert.deepEqual(parseView('?view=map'), { name: 'Map', office: true, map: true, angled: false })
})

test('the angled view can also pin the side it is seen from, in quarter turns', () => {
  assert.deepEqual(parseView('?view=angled&turn=1'), { name: 'Office, angled, turned 90\u00b0', office: true, map: false, angled: true, rotation: 1 })
  assert.equal(parseView('?view=angled&turn=3').rotation, 3)
  assert.equal(parseView('?view=angled&turn=2').name, 'Office, angled, turned 180\u00b0')
  assert.equal(parseView('?view=angled&turn=0').rotation, 0) // pinned to the front, whatever was saved
  assert.equal(Object.hasOwn(parseView('?view=angled'), 'rotation'), false) // no turn in the address: the saved one applies
  for (const turn of ['4', '-1', 'x', '', '1.5', '01']) assert.equal(Object.hasOwn(parseView(`?view=angled&turn=${turn}`), 'rotation'), false, turn)
  assert.equal(Object.hasOwn(parseView('?view=office&turn=1'), 'rotation'), false) // only the angled view has sides
})

test('an address with no view, or one we do not have, pins nothing', () => {
  for (const search of ['', '?', '?view=', '?view=nonsense', '?view=__proto__', '?other=1', '?view=Angled']) assert.equal(parseView(search), null, search)
})

test('the view can be anywhere in the query, and every pinnable view has a name', () => {
  assert.equal(parseView('?x=1&view=angled&y=2').angled, true)
  assert.deepEqual(Object.keys(VIEW_NAMES).sort(), ['angled', 'code', 'map', 'office'])
})
