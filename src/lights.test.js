import assert from 'node:assert/strict'
import { test } from 'node:test'

import { lightColor, PATTERNS } from '../public/lights.js'
import { inPalette } from '../public/palette.js'
import { doorLights, itemsOf, windowLights } from '../public/scenery.js'
import { buildStudio } from '../public/studio.js'

const layout = buildStudio()
const light = (pattern, extra = {}) => ({ x: 4, y: 5, w: 1, h: 1, pattern, on: '#aaaaaa', off: '#111111', colors: ['#aaaaaa', '#bbbbbb', '#cccccc'], ...extra })
const over = (l, seconds = 60) => new Set(Array.from({ length: seconds * 4 }, (_, i) => lightColor(l, i / 4)))

test('a steady light never changes; with less motion every light holds its on colour', () => {
  assert.deepEqual([...over(light('steady'))], ['#aaaaaa'])
  for (const pattern of PATTERNS.filter(p => p !== 'glint')) assert.equal(lightColor(light(pattern), 12.3, true), '#aaaaaa')
  assert.equal(lightColor(light('glint'), 12.3, true), '#111111') // a sparkle held still would look like a spot of dirt
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

test('a glint sweeps along a row of lights, one at a time, and a different row is out of step', () => {
  const row = seed => [0, 4, 8, 12, 16, 20].map(x => light('glint', { x, y: 3, seed }))
  const flashing = (seed, seconds) => row(seed).map(l => lightColor(l, seconds) === '#aaaaaa')
  const seen = new Set()
  for (let i = 0; i < 160; i++) {
    const on = flashing(0, i / 4)
    assert.ok(on.filter(Boolean).length <= 2, 'at most a pair at once')
    on.forEach((flash, x) => flash && seen.add(x))
  }
  assert.equal(seen.size, 6, 'the sparkle visits every light')
  assert.notDeepEqual(Array.from({ length: 160 }, (_, i) => flashing(0, i / 4)), Array.from({ length: 160 }, (_, i) => flashing(17, i / 4)))
})

test('every window has a sparkle low in its pane, inside the window; the monitors facing the room have a screensaver that is only for a screen that is not lit', () => {
  const lights = windowLights(layout)
  assert.ok(lights.length > 50)
  for (const l of lights) {
    assert.equal(l.pattern, 'glint')
    assert.ok(layout.windows.some(w => w.w >= w.h && l.x >= w.x * 16 && l.x < (w.x + w.w) * 16 && l.y >= w.y * 16 && l.y < (w.y + 1) * 16), `a light at ${l.x},${l.y} is not on a window`)
    for (const color of [l.on, l.off]) assert.ok(inPalette(color))
  }
  const desks = itemsOf(layout).filter(item => item.kind === 'desk')
  assert.ok(desks.some(d => d.lights.length > 0 && d.lights.every(l => l.idleOnly)))
  assert.ok(desks.filter(d => d.face !== 'up').every(d => d.lights.length === 0), 'no screensaver on a monitor seen from the back')
})
