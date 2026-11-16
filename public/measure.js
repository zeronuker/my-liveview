// The City's choices of what each part shows: a building's height, its footprint, its colour and its lit windows.
// Plain data in, plain data out, so it can be tested; map.js draws with it.
//
// sizeOf(file, by, most) is the length in lines a part is drawn for: the file's lines, or how often it changed,
// scaled so the most changed file counts as a long one. litOf(file, by, now, most) is the share of windows lit.
// tintOf(file, by, now, most) is a colour { h, s, l } (0..1), or null for the folder colours map.js keeps.

import { ageLight, hash } from './city.js'

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
