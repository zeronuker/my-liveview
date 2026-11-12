// The Office's sounds, made in the browser (no sound files): a chime when work
// reaches the CEO, a buzz on a failure, a tick for a hand-in or a prompt, and a
// soft click for each line of code being typed. Off until the person turns it on.
// Plain data decides what plays; `createSound` makes the noise.

// which sound goes with which effect
const SOUND_OF = { confetti: 'chime', warning: 'buzz', ring: 'tick', glyph: 'click' }
export const soundFor = kind => SOUND_OF[kind] ?? null

// each sound: notes of { freq (Hz), type, at (s after the start), dur (s), vol }
const NOTES = {
  chime: [{ freq: 660, type: 'sine', at: 0, dur: 0.25, vol: 0.5 }, { freq: 880, type: 'sine', at: 0.12, dur: 0.4, vol: 0.5 }],
  buzz: [{ freq: 140, type: 'square', at: 0, dur: 0.25, vol: 0.25 }],
  tick: [{ freq: 1200, type: 'triangle', at: 0, dur: 0.05, vol: 0.3 }],
  click: [{ freq: 2400, type: 'square', at: 0, dur: 0.02, vol: 0.08 }],
}
export const SOUNDS = Object.keys(NOTES)

// the least time, in seconds, before the same sound may play again: a crowd of
// typists must not turn into a rattle
const GAP = { chime: 0.5, buzz: 0.4, tick: 0.1, click: 0.12 }
export const isDue = (name, now, last) => now - (last[name] ?? -Infinity) >= (GAP[name] ?? 0)

export const createSound = ({ AudioContextClass = globalThis.AudioContext ?? globalThis.webkitAudioContext } = {}) => {
  let on = false
  let ctx = null
  const last = {}

  // the sound context is made when it is first turned on: that is a click, which
  // browsers need before they allow any sound
  const setOn = value => {
    on = value
    if (on && !ctx && AudioContextClass) ctx = new AudioContextClass()
    if (on && ctx?.state === 'suspended') ctx.resume?.()
  }

  const play = name => {
    if (!on || !ctx || !NOTES[name]) return
    const now = ctx.currentTime
    if (!isDue(name, now, last)) return
    last[name] = now
    for (const note of NOTES[name]) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = note.type
      osc.frequency.setValueAtTime(note.freq, now + note.at)
      gain.gain.setValueAtTime(note.vol * 0.3, now + note.at) // not loud: it is background
      gain.gain.exponentialRampToValueAtTime(0.0001, now + note.at + note.dur)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now + note.at)
      osc.stop(now + note.at + note.dur + 0.02)
    }
  }

  return { setOn, play, isOn: () => on }
}
