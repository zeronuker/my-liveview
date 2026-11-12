import assert from 'node:assert/strict'
import { test } from 'node:test'

import { inPalette, MATERIALS, PALETTE, ramp, RAMPS, shade } from '../public/palette.js'

const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
const light = hex => {
  const [r, g, b] = rgb(hex)
  return 0.299 * r + 0.587 * g + 0.114 * b
}
const HEX = /^#[0-9a-f]{6}$/

test('a ramp is four real colours, darkest first, each lighter than the one before', () => {
  const colors = ramp('#b98a5a')

  assert.equal(colors.length, 4)
  for (const c of colors) assert.match(c, HEX)
  for (let i = 1; i < colors.length; i++) assert.ok(light(colors[i]) > light(colors[i - 1]), `${colors}`)
})

test('the base colour is kept as it is, as the third shade', () => {
  assert.equal(ramp('#b98a5a')[2], '#b98a5a')
})

test('shadows lean cool and highlights lean warm: blue in the darkest, red over blue in the lightest', () => {
  const [dark, , , bright] = ramp('#b98a5a').map(rgb)
  const base = rgb('#b98a5a')

  assert.ok(dark[2] - dark[0] > base[2] - base[0], 'the shadow has more blue than the base')
  assert.ok(bright[0] - bright[2] > base[0] - base[2] || bright[0] >= base[0], 'the highlight is no cooler than the base')
})

test('a ramp is the same every time, and can have more steps', () => {
  assert.deepEqual(ramp('#3f8f4a'), ramp('#3f8f4a'))
  assert.equal(ramp('#3f8f4a', 5).length, 5)
})

test('every material has a ramp of four shades, and shade() finds them', () => {
  for (const name of Object.keys(MATERIALS)) assert.equal(RAMPS[name].length, 4, name)
  assert.equal(shade('wood', 0), RAMPS.wood[0])
})

test('the palette stays small, with no two colours that look the same', () => {
  const colors = [...PALETTE]

  assert.ok(colors.length <= 64, `${colors.length} colours`)
  for (let i = 0; i < colors.length; i++)
    for (let j = i + 1; j < colors.length; j++) {
      const [a, b] = [rgb(colors[i]), rgb(colors[j])]
      const distance = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
      assert.ok(distance >= 10, `${colors[i]} and ${colors[j]} are too close`)
    }
})

test('inPalette says whether a colour belongs, in either case', () => {
  assert.ok(inPalette(shade('leaf', 1)))
  assert.ok(inPalette(shade('leaf', 1).toUpperCase()))
  assert.ok(!inPalette('#123456'))
})
