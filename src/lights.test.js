import assert from 'node:assert/strict'
import { test } from 'node:test'

import { lightColor, PATTERNS } from '../public/lights.js'
import { inPalette } from '../public/palette.js'
import { doorLights, itemsOf } from '../public/scenery.js'
import { buildStudio } from '../public/studio.js'

const layout = buildStudio()
const light = (pattern, extra = {}) => ({ x: 4, y: 5, w: 1, h: 1, pattern, on: '#aaaaaa', off: '#111111', colors: ['#aaaaaa', '#bbbbbb', '#cccccc'], ...extra })
const over = (l, seconds = 60) => new Set(Array.from({ length: seconds * 4 }, (_, i) => lightColor(l, i / 4)))

test('a steady light never changes; with less motion every light holds its on colour', () => {
  assert.deepEqual([...over(light('steady'))], ['#aaaaaa'])
  for (const pattern of PATTERNS) assert.equal(lightColor(light(pattern), 12.3, true), '#aaaaaa')
})

test('slow, fast, double and flicker lights are on and off at times, a cycle steps through its colours', () => {
  for (const pattern of ['slow', 'fast', 'double', 'flicker']) assert.deepEqual([...over(light(pattern))].sort(), ['#111111', '#aaaaaa'], pattern)
  assert.deepEqual([...over(light('cycle'))].sort(), ['#aaaaaa', '#bbbbbb', '#cccccc'])
})

test('a flicker is nearly always on, a fast light mostly on, a slow one half and half', () => {
  const share = (pattern, color) => Array.from({ length: 400 }, (_, i) => lightColor(light(pattern), i / 4)).filter(c => c === color).length / 400
  assert.ok(share('flicker', '#aaaaaa') > 0.85)
  assert.ok(share('fast', '#aaaaaa') > 0.5 && share('fast', '#aaaaaa') < 0.85)
  assert.ok(Math.abs(share('slow', '#aaaaaa') - 0.5) < 0.05)
})

test('lights in different places blink out of step, and the same light at the same time is always the same', () => {
  const a = Array.from({ length: 80 }, (_, i) => lightColor(light('slow', { x: 4, y: 5 }), i / 4))
  const b = Array.from({ length: 80 }, (_, i) => lightColor(light('slow', { x: 9, y: 22 }), i / 4))
  assert.notDeepEqual(a, b)
  assert.equal(lightColor(light('fast'), 7.25), lightColor(light('fast'), 7.25))
})

test('every light in the plan is inside its piece, a palette colour, of a known pattern; there are lights on racks, vending machines and TVs and over the sliding doors', () => {
  const kinds = new Set()
  for (const item of itemsOf(layout))
    for (const l of item.lights) {
      kinds.add(item.kind)
      assert.ok(PATTERNS.includes(l.pattern), `${item.kind}: ${l.pattern}`)
      assert.ok(l.x >= 0 && l.y >= 0 && l.x + l.w <= item.w * 16 && l.y + l.h <= item.h * 16 + item.rise, `${item.kind} at ${item.x},${item.y}: light outside`)
      for (const color of [l.on, l.off, ...(l.colors ?? [])].filter(Boolean)) assert.ok(inPalette(color), `${item.kind}: ${color}`)
    }
  for (const kind of ['rack', 'machine', 'vending', 'tv', 'sidetable', 'coffeebar']) assert.ok(kinds.has(kind), `${kind} has lights`)
  const doors = doorLights(layout)
  assert.equal(doors.length, layout.doors.filter(d => d.kind === 'sliding').length)
  assert.ok(doors.length >= 2)
  for (const l of doors) for (const color of [l.on, l.off]) assert.ok(inPalette(color))
})
