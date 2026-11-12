// Records the Office canvas to an mp4 file (Chrome and Edge 126 and later can).
// `Recorder` and `save` are given so a test can use fakes.
export const TYPES = ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4']

export const pickType = isSupported => TYPES.find(type => isSupported(type)) ?? null

const two = n => String(n).padStart(2, '0')
export const fileName = d =>
  `office-${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}.mp4`

export const createRecorder = ({ canvas, Recorder = globalThis.MediaRecorder, save, onChange = () => {} }) => {
  let rec = null
  const typeToUse = () => (Recorder ? pickType(type => Recorder.isTypeSupported(type)) : null)

  const start = () => {
    const mimeType = typeToUse()
    if (!mimeType || rec) return false
    const stream = canvas.captureStream(30)
    const chunks = []
    const next = new Recorder(stream, { mimeType, videoBitsPerSecond: 4_000_000 })
    next.ondataavailable = event => event.data.size > 0 && chunks.push(event.data)
    next.onstop = () => {
      for (const track of stream.getTracks()) track.stop()
      rec = null
      if (chunks.length > 0) save(new Blob(chunks, { type: mimeType }), fileName(new Date()))
      onChange()
    }
    next.start(1000)
    rec = next
    onChange()
    return true
  }

  return {
    start,
    isSupported: () => typeToUse() !== null,
    // the video so far is saved
    stop: () => rec && rec.state !== 'inactive' && rec.stop(),
    // while the window is hidden nothing is drawn: pausing leaves no frozen stretch
    pause: () => rec?.state === 'recording' && rec.pause(),
    resume: () => rec?.state === 'paused' && rec.resume(),
    get isRecording() {
      return rec !== null
    },
  }
}
