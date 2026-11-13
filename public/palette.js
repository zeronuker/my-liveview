// The Office's colours: one small palette for all new pixel art. Every material
// (wood, grass, glass...) is a ramp of four shades, darkest to lightest, made
// from one base colour. Shadows lean cool (blue), highlights lean warm (yellow),
// so the art has depth without ever using black. Warm "light" colours are kept
// for things that give light (lamps, screens, windows), nothing else.
// Plain data in, plain data out, so it can be tested.

const toHsl = hex => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, s, l]
}

const toHex = ([h, s, l]) => {
  const a = s * Math.min(l, 1 - l)
  const f = n => {
    const k = (n + h / 30) % 12
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))))
  }
  return '#' + [f(0), f(8), f(4)].map(v => v.toString(16).padStart(2, '0')).join('')
}

// Four shades (or `steps`) of one material, darkest first. The base colour is
// the third one; the shades step 15% in lightness, with the hue moving
// `hueShift` degrees per step: toward blue in the dark, toward yellow in the light.
export const ramp = (base, steps = 4, hueShift = 8) => {
  const [h, s, l] = toHsl(base)
  const baseIndex = Math.round((steps - 1) * 0.6)
  // a dark base gets smaller steps, so the darkest shade never sinks into black
  const darkStep = Math.min(0.15, (l - 0.14) / baseIndex)
  const lightStep = Math.min(0.15, (0.9 - l) / (steps - 1 - baseIndex))
  return Array.from({ length: steps }, (_, i) => {
    const k = i - baseIndex
    if (k === 0) return base
    const target = k < 0 ? 245 : 50
    let delta = ((target - h + 540) % 360) - 180
    delta = Math.sign(delta) * Math.min(Math.abs(delta), hueShift * Math.abs(k))
    const sat = s * (1 - (k < 0 ? 0.05 : 0.1) * Math.abs(k))
    return toHex([(h + delta + 360) % 360, Math.max(0, Math.min(1, sat)), l + (k < 0 ? darkStep : lightStep) * k])
  })
}

// the base colour of every material
export const MATERIALS = {
  wood: '#b98a5a',
  plaster: '#d8cdb8',
  brick: '#a8553a',
  metal: '#8a8f9c',
  glass: '#6f9fc9',
  leaf: '#3f8f4a',
  grass: '#86b04c',
  fabricWarm: '#c98f3a',
  fabricCool: '#2a7f9e',
  carpet: '#43386f',
  tile: '#6b4b4d',
  light: '#f2c94c',
  // floors, one for each kind of room, and the cap of a wall
  honey: '#d6bb88',
  sage: '#c5d5b4',
  periwinkle: '#aab8de',
  lilac: '#c8cce6',
  slate: '#b0b8c6',
  frost: '#cfe0e6',
  stone: '#b6b3a9',
  wallcap: '#7d7898',
  // rugs
  terracotta: '#c4825a',
}

export const RAMPS = Object.fromEntries(Object.entries(MATERIALS).map(([name, base]) => [name, ramp(base)]))

// a colour of a material: shade 0 is the darkest, 3 the lightest
export const shade = (material, index) => RAMPS[material][index]

// every colour of the palette
export const PALETTE = new Set(Object.values(RAMPS).flat())

export const inPalette = hex => PALETTE.has(hex.toLowerCase())
