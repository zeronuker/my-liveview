// Lights that blink, in the Office's art: a light is a small rectangle over a piece's picture that changes colour
// with the time, so the piece looks alive (server racks, the test machine, vending machines, TVs, lamps, the
// coffee machine, door sensors). A piece's art says where its lights are and how each behaves; this says what
// colour a light is at a moment. Plain data in, plain data out, so it can be tested.
//
// A light is { x, y, w, h, pattern, on, off, colors } in the piece's own pixels (a `phase`, a number of ticks, puts it at a
// point of its own in its cycle, so the pieces of one picture can change together):
//   steady   always `on`
//   slow     `on` for a second, `off` for a second
//   fast     mostly `on`, `off` at random a few times a second (a busy disk)
//   double   two flashes, then a pause
//   flicker  nearly always `on`, now and then `off` for a moment (a lamp)
//   cycle    steps through `colors` (a TV)
//   glint    on for a moment as a sparkle sweeps along a row of lights (a window pane); `seed` puts one row out of step
//            with another. Held `off` with less motion (a still sparkle would look like a spot of dirt).
import { hash } from './pixel.js'

export const PATTERNS = ['steady', 'slow', 'fast', 'double', 'flicker', 'cycle', 'glint']
const TICK = 0.25 // seconds: lights change four times a second at most, which keeps them pixel-art blinks, not fades

// the colour a light is at a time in seconds; `still` (less motion) holds every light at its `on` colour
export const lightColor = (light, seconds, still = false) => {
  if (still) return light.pattern === 'glint' ? light.off : light.on
  if (light.pattern === 'glint') return ((((Math.floor(seconds / TICK) - Math.floor(light.x / 4) + (light.seed ?? 0)) % 40) + 40) % 40) < 2 ? light.on : light.off
  // each light starts at a point of its own, so a row of them does not blink together
  const tick = Math.floor(seconds / TICK) + (light.phase ?? hash(light.x, light.y) % 16)
  switch (light.pattern) {
    case 'slow':
      return tick % 8 < 4 ? light.on : light.off
    case 'fast':
      return hash(tick, light.x * 31 + light.y) % 3 === 0 ? light.off : light.on
    case 'double': {
      const step = tick % 12
      return step === 0 || step === 2 ? light.on : light.off
    }
    case 'flicker':
      return hash(tick, light.y * 7 + light.x) % 12 === 0 ? light.off : light.on
    case 'cycle':
      return light.colors[Math.floor(tick / 3) % light.colors.length]
    default:
      return light.on
  }
}
