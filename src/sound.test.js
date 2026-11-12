import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createSound, isDue, SOUNDS, soundFor } from '../public/sound.js'

// an audio context that makes no noise: it only says what it was asked to play
const fakeAudio = () => {
  const log = { made: 0, oscillators: [], resumed: 0 }
  class Context {
    constructor() {
      log.made++
      this.currentTime = 0
      this.state = 'suspended'
      this.destination = {}
    }
    resume() {
      log.resumed++
      this.state = 'running'
    }
    createOscillator() {
      const osc = { type: '', frequency: { setValueAtTime: freq => (osc.freq = freq) }, connect() {}, start() {}, stop() {} }
      log.oscillators.push(osc)
      return osc
    }
    createGain() {
      return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }
    }
  }
  return { log, Context }
}

test('each effect has a sound, and an unknown one has none', () => {
  assert.equal(soundFor('confetti'), 'chime')
  assert.equal(soundFor('warning'), 'buzz')
  assert.equal(soundFor('ring'), 'tick')
  assert.equal(soundFor('glyph'), 'click')
  assert.equal(soundFor('sparkle'), null)
  for (const name of ['chime', 'buzz', 'tick', 'click']) assert.ok(SOUNDS.includes(name), name)
})

test('nothing plays until it is turned on, and turning it on starts the audio', () => {
  const { log, Context } = fakeAudio()
  const sound = createSound({ AudioContextClass: Context })

  sound.play('chime')
  assert.equal(log.oscillators.length, 0)
  assert.equal(log.made, 0)

  sound.setOn(true)
  assert.equal(log.made, 1)
  assert.equal(log.resumed, 1)
  sound.play('chime')
  assert.equal(log.oscillators.length, 2) // two notes
  assert.equal(log.oscillators[0].freq, 660)
})

test('turned off again, it is quiet; and it is made only once', () => {
  const { log, Context } = fakeAudio()
  const sound = createSound({ AudioContextClass: Context })
  sound.setOn(true)
  sound.setOn(false)
  sound.play('buzz')
  sound.setOn(true)

  assert.equal(log.oscillators.length, 0)
  assert.equal(log.made, 1)
  assert.equal(sound.isOn(), true)
})

test('the same sound twice in a moment plays once: a crowd of typists is not a rattle', () => {
  const { log, Context } = fakeAudio()
  const sound = createSound({ AudioContextClass: Context })
  sound.setOn(true)
  sound.play('click')
  sound.play('click')

  assert.equal(log.oscillators.length, 1)
})

test('a sound is due again once its gap has passed', () => {
  assert.equal(isDue('click', 0.05, { click: 0 }), false)
  assert.equal(isDue('click', 0.2, { click: 0 }), true)
  assert.equal(isDue('chime', 0, {}), true)
})

test('a browser with no audio is fine: turning it on does nothing', () => {
  const sound = createSound({ AudioContextClass: undefined })

  sound.setOn(true)
  sound.play('chime')
  assert.equal(sound.isOn(), true)
})
