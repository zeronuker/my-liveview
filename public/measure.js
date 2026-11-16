// The City's choices of what each part shows: a building's height, its footprint, its colour and its lit windows.
// Plain data in, plain data out, so it can be tested; map.js draws with it.
//
// sizeOf(file, by, most) is the length in lines a part is drawn for: the file's lines, or how often it changed,
// scaled so the most changed file counts as a long one. litOf(file, by, now, most) is the share of windows lit.
// tintOf(file, by, now, most) is a colour { h, s, l } (0..1), or null for the folder colours map.js keeps.

import { ageLight, hash } from './city.js'
import { cloudColor } from './nebula.js'

export const CHOICES = {
  height: ['lines', 'changes'],
  footprint: ['lines', 'changes'],
  colour: ['folder', 'age', 'changes', 'type'],
  windows: ['recent', 'changes'],
}
const LONG = 3000 // the most changed file is drawn as long as a file of this many lines
const DAY = 86400000

const share = (file, most) => Math.min(1, (file.changes ?? 0) / Math.max(most, 1))

export const sizeOf = (file, by, most) => (by === 'changes' ? Math.max(1, Math.sqrt(share(file, most)) * LONG) : file.lines)

export const litOf = (file, by, now, most) => (by === 'changes' ? 0.06 + 0.6 * Math.sqrt(share(file, most)) : ageLight(file.changed, now).lit)

// The colour of a building when it shows its folder (the default): { h, s, l } (0..1). Each neighbourhood (a number, from
// 0) has its own colour, the same ones the Nebula's folders have, so they are told apart across the city; each building
// is its own shade of it (its path decides, so it never changes). Two in six break away from the neighbourhood's colour
// into a material seen in real skylines: blue glass, sandstone, slate, brick, weathered copper, limestone, dark steel.
export const ACCENT_SHARE = 2 / 6
const MATERIALS = [
  { h: 0.56, s: 0.5, l: 0.42 }, // blue glass
  { h: 0.09, s: 0.4, l: 0.56 }, // sandstone
  { h: 0.62, s: 0.14, l: 0.3 }, // slate
  { h: 0.03, s: 0.48, l: 0.38 }, // brick
  { h: 0.45, s: 0.36, l: 0.42 }, // weathered copper
  { h: 0.13, s: 0.28, l: 0.64 }, // limestone
  { h: 0.6, s: 0.1, l: 0.2 }, // dark steel
]
export const hueOfHex = hex => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
  const max = Math.max(r, g, b)
  const span = max - Math.min(r, g, b)
  if (!span) return 0
  const sector = max === r ? ((g - b) / span + 6) % 6 : max === g ? (b - r) / span + 2 : (r - g) / span + 4
  return sector / 6
}
export const folderTint = (path, neighbourhood) => {
  const pick = hash(`${path}#tint`)
  const jitter = (key, spread) => (hash(`${path}#${key}`) - 0.5) * spread
  if (pick < ACCENT_SHARE) {
    const material = MATERIALS[Math.floor((pick / ACCENT_SHARE) * MATERIALS.length)]
    return { h: (material.h + jitter('h', 0.02) + 1) % 1, s: material.s, l: Math.min(0.7, material.l + jitter('l', 0.08)) }
  }
  return { h: (hueOfHex(cloudColor(neighbourhood)) + jitter('h', 0.05) + 1) % 1, s: 0.45 + hash(`${path}#s`) * 0.25, l: 0.32 + hash(`${path}#l`) * 0.2 }
}

export const tintOf = (file, by, now, most) => {
  if (by === 'age') {
    if (!file.changed) return { h: 0.6, s: 0.12, l: 0.4 }
    const old = Math.min(1, Math.log1p(Math.max(0, now - file.changed) / DAY) / Math.log1p(365)) // 0 today, 1 a year or more
    return { h: 0.09 + old * 0.52, s: 0.6 - old * 0.45, l: 0.5 - old * 0.12 }
  }
  if (by === 'changes') {
    const hot = Math.sqrt(share(file, most)) // cold blue, through violet, to hot orange
    return { h: (0.62 + hot * 0.45) % 1, s: 0.35 + hot * 0.35, l: 0.36 + hot * 0.14 }
  }
  if (by === 'type') {
    const ext = file.path.includes('.') ? file.path.slice(file.path.lastIndexOf('.') + 1).toLowerCase() : ''
    return { h: hash(`.${ext}`), s: 0.4, l: 0.45 }
  }
  return null
}
