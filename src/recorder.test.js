import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createRecorder, fileName, pickType } from '../public/recorder.js'

// a MediaRecorder that records nothing: it only says what it was asked
const fakes = (types = ['video/mp4']) => {
  const log = { started: [], saved: [], tracksStopped: 0 }
  class Recorder {
    static isTypeSupported = type => types.includes(type)
    state = 'inactive'
    constructor(stream, options) {
      this.options = options
    }
    start() {
      this.state = 'recording'
      log.started.push(this.options.mimeType)
      this.ondataavailable({ data: new Blob(['frame']) })
    }
    pause() {
      this.state = 'paused'
    }
    resume() {
      this.state = 'recording'
    }
    stop() {
      this.state = 'inactive'
      this.onstop()
    }
  }
  const canvas = { captureStream: () => ({ getTracks: () => [{ stop: () => log.tracksStopped++ }] }) }
  const make = () => createRecorder({ canvas, Recorder, save: (blob, name) => log.saved.push({ blob, name }) })
  return { log, make }
}

test('the first mp4 type the browser can record is used; with none, there is none', () => {
  assert.equal(pickType(type => type === 'video/mp4'), 'video/mp4')
  assert.equal(pickType(() => false), null)
})

test('the file is named after the day and time', () => {
  assert.equal(fileName(new Date(2026, 10, 12, 9, 5)), 'office-2026-11-12-0905.mp4')
})

test('start records, stop saves an mp4 and lets go of the canvas stream', () => {
  const { log, make } = fakes()
  const recorder = make()

  assert.equal(recorder.start(), true)
  assert.equal(recorder.isRecording, true)
  recorder.stop()

  assert.equal(recorder.isRecording, false)
  assert.equal(log.saved.length, 1)
  assert.match(log.saved[0].name, /^office-.*\.mp4$/)
  assert.equal(log.saved[0].blob.type, 'video/mp4')
  assert.equal(log.tracksStopped, 1)
})

test('a browser that cannot record mp4 does not start, and says so', () => {
  const { log, make } = fakes([])
  const recorder = make()

  assert.equal(recorder.isSupported(), false)
  assert.equal(recorder.start(), false)
  assert.equal(recorder.isRecording, false)
  assert.deepEqual(log.started, [])
})

test('starting twice does not start a second recording; stopping with none does nothing', () => {
  const { log, make } = fakes()
  const recorder = make()

  recorder.stop()
  recorder.start()
  assert.equal(recorder.start(), false)
  assert.equal(log.started.length, 1)
})

test('pause and resume keep it one recording, and it is still saved once', () => {
  const { log, make } = fakes()
  const recorder = make()

  recorder.start()
  recorder.pause()
  recorder.pause()
  recorder.resume()
  recorder.stop()

  assert.equal(log.saved.length, 1)
})
