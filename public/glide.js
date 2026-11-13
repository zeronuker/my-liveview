// What is drawn glides after what is true. The stage and the pets move on whole cells and turn at right angles, and the
// screen is drawn many times a second with a few pixels to a tile, so drawing each at exactly its place looks stiff and
// jumps from pixel to pixel. A glide keeps a drawn place for each thing that follows the true one a little behind, easing
// into each move and out of it (a spring that starts and stops gently) and rounding the corners, and says how fast it is going and how far it has gone (for the
// size of a step). Plain data in, plain data out: time is passed in, so a test can fix it.
export const SMOOTH = 0.12 // about how long, in seconds, the drawn place takes to settle on the true one
const JUMP = 2 // a true place further than this many tiles off is a jump (a new arrival, instant speed): the drawn one goes there at once
const MOVING = 0.3 // tiles a second above which something counts as going somewhere

// One step of a critically damped spring: where `value` has got to after `dt` seconds of being pulled to `target`, and its
// speed. It starts and stops gently and never overshoots a target that stays put.
const settle = (value, speed, target, dt, smooth) => {
  const omega = 2 / smooth
  const x = omega * dt
  const damping = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x)
  const change = value - target
  const pull = (speed + omega * change) * dt
  return [target + (change + pull) * damping, (speed - omega * pull) * damping]
}

export const createGlide = ({ smooth = SMOOTH } = {}) => {
  const seen = new Map() // id -> { x, y, vx, vy, stride }

  // where to draw `id` now, given where it truly is and how long it has been (seconds) since the last time it was asked about
  const place = (id, x, y, dt) => {
    let drawn = seen.get(id)
    if (!drawn || Math.hypot(x - drawn.x, y - drawn.y) > JUMP) {
      drawn = { x, y, vx: 0, vy: 0, stride: drawn?.stride ?? 0 }
      seen.set(id, drawn)
      return { x, y, vx: 0, speed: 0, stride: drawn.stride, moving: false }
    }
    if (dt > 0) {
      const [nx, vx] = settle(drawn.x, drawn.vx, x, dt, smooth)
      const [ny, vy] = settle(drawn.y, drawn.vy, y, dt, smooth)
      drawn.stride += Math.hypot(nx - drawn.x, ny - drawn.y)
      Object.assign(drawn, { x: nx, y: ny, vx, vy })
    }
    const speed = Math.hypot(drawn.vx, drawn.vy)
    return { x: drawn.x, y: drawn.y, vx: drawn.vx, speed, stride: drawn.stride, moving: speed > MOVING }
  }

  // forget whatever is not in the list of ids that are still here
  const keep = ids => {
    const here = new Set(ids)
    for (const id of seen.keys()) if (!here.has(id)) seen.delete(id)
  }

  return { place, keep }
}
