// The pond's fish: a few koi that swim about on their own in the water that can be seen (not under the terrace or the
// boardwalk). They are not workers, and nothing in the Office waits on them. A fish picks a place in the water, turns
// towards it a little at a time, swims there at its own pace (slower in a tight turn and as it arrives), and now and
// then rests a few seconds, drifting, before picking another. Its place and its heading change smoothly, never in
// jumps. Plain data in, plain data out: `water` is rows of text like the studio's ('.' is water), and `random` is a
// function giving a number from 0 up to 1, so a test can fix it.
export const TURN = 2.2 // the most a fish turns, radians a second
export const FISH_COLORS = ['#ff8a3d', '#f4f1e8', '#e9b949', '#ff8a3d', '#f4f1e8', '#e9b949'] // orange, white and gold
const CRUISE = [0.35, 0.85] // tiles a second, from the slowest fish to the fastest
const ARRIVED = 0.35 // how near to the place counts as being there

export const createFish = (water, count, random = Math.random, colors = FISH_COLORS) => {
  const isWater = (x, y) => water[Math.round(y)]?.[Math.round(x)] === '.'

  // the biggest stretch of water that joins up, as a list of cells: every fish lives there
  const seen = new Set()
  let cells = []
  for (let y = 0; y < water.length; y++)
    for (let x = 0; x < water[y].length; x++) {
      if (water[y][x] !== '.' || seen.has(`${x},${y}`)) continue
      const part = [[x, y]]
      seen.add(`${x},${y}`)
      for (let head = 0; head < part.length; head++)
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const [nx, ny] = [part[head][0] + dx, part[head][1] + dy]
          if (water[ny]?.[nx] !== '.' || seen.has(`${nx},${ny}`)) continue
          seen.add(`${nx},${ny}`)
          part.push([nx, ny])
        }
      if (part.length > cells.length) cells = part
    }

  // a straight line from one place to another that stays in the water
  const clear = (from, to) => {
    const steps = Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / 0.25)
    for (let i = 1; i <= steps; i++) if (!isWater(from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps)) return false
    return true
  }

  // somewhere new to swim to: a few tries at a place in the water that can be reached in a straight line
  const choose = fish => {
    for (let tries = 0; tries < 12; tries++) {
      const [cx, cy] = cells[Math.floor(random() * cells.length)]
      const to = [cx + (random() - 0.5) * 0.6, cy + (random() - 0.5) * 0.6]
      if (Math.hypot(to[0] - fish.x, to[1] - fish.y) > 1.5 && clear([fish.x, fish.y], to)) return to
    }
    return [fish.x - Math.cos(fish.heading), fish.y - Math.sin(fish.heading)] // none: turn back the way it came
  }

  const fish = cells.length === 0 ? [] : Array.from({ length: count }, (_, i) => {
    const [cx, cy] = cells[Math.floor(random() * cells.length)]
    const one = { id: `fish${i}`, x: cx, y: cy, heading: random() * 2 * Math.PI, speed: 0, cruise: CRUISE[0] + random() * (CRUISE[1] - CRUISE[0]), color: colors[i % colors.length], size: 0.8 + random() * 0.5, phase: random() * 6, pause: random() * 3, target: null }
    one.target = choose(one)
    return one
  })

  const step = (one, dt) => {
    one.phase += dt * (2 + one.speed * 9) // the tail
    if (one.pause > 0) {
      one.pause -= dt
      one.speed += (0.05 - one.speed) * Math.min(1, 2 * dt) // a slow drift
    } else {
      const want = Math.atan2(one.target[1] - one.y, one.target[0] - one.x)
      const diff = ((want - one.heading + 3 * Math.PI) % (2 * Math.PI)) - Math.PI
      one.heading += Math.max(-TURN * dt, Math.min(TURN * dt, diff))
      const near = Math.hypot(one.target[0] - one.x, one.target[1] - one.y)
      const pace = one.cruise * Math.max(0.25, 1 - Math.abs(diff) / 1.6) * Math.min(1, near / 1.2 + 0.2) // slower in a tight turn and on arriving
      one.speed += (pace - one.speed) * Math.min(1, 1.5 * dt)
      if (near < ARRIVED) {
        if (random() < 0.4) one.pause = 1.5 + random() * 3
        one.target = choose(one)
      }
    }
    const [nx, ny] = [one.x + Math.cos(one.heading) * one.speed * dt, one.y + Math.sin(one.heading) * one.speed * dt]
    if (isWater(nx, ny)) {
      one.x = nx
      one.y = ny
    } else {
      one.speed -= one.speed * Math.min(1, 1.5 * dt) // the bank is ahead: ease off and pick another way
      one.target = choose(one)
    }
  }

  return {
    tick: dt => fish.forEach(one => step(one, dt)),
    snapshot: () => fish.map(({ id, x, y, heading, speed, color, size, phase }) => ({ id, x, y, heading, speed, color, size, phase })),
  }
}
