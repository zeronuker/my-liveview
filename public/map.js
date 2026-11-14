// The Map: the chat's repo as a 3D city, lit by what Claude reads and edits.
// city.js lays the repo out, glow.js says what is lit; this draws it with three.js,
// which is only loaded the first time the Map is shown.

import { layoutCity } from './city.js'
import { glowLevel, touchOf } from './glow.js'

const COLORS = { base: '#2a3550', folded: '#44444e', read: '#5aa0ff', edit: '#ffb347', new: '#7bd88f', ground: '#10162a', sky: '#070b17' }
const RANK = { read: 1, edit: 2, new: 3 }
const LABELS = 60 // the biggest folders are named
const REFETCH_MS = 1500 // a file that is not in the map yet: the repo is read again after this

const buildingHeight = lines => 0.4 + Math.log2(1 + lines) * 0.6
const depthOf = path => (path ? path.split('/').length : 0)
const slabTop = depth => 0.2 + Math.min(depth, 6) * 0.03

export const createMap = ({ canvas, tip }) => {
  let T = null // { THREE, OrbitControls }, once loaded
  let scene, camera, renderer, controls, raycaster
  let group = null // everything drawn for the current repo
  let mesh = null // the files, one instance each
  let files = [] // the layout's files, as the instances are numbered
  let visible = false
  let cwd = ''
  let shownCwd = '' // the repo drawn now
  let loadGen = 0
  let frame = 0
  let refetch = 0
  const index = new Map() // path -> instance number
  const touchedBy = new Map() // folder -> Map(path -> { kind, at })
  const touchesOf = folder => touchedBy.get(folder) ?? touchedBy.set(folder, new Map()).get(folder)

  const init = async () => {
    if (T) return
    const THREE = await import('three')
    const { OrbitControls } = await import('./vendor/OrbitControls.js')
    T = { THREE, OrbitControls }
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    scene = new THREE.Scene()
    scene.background = new THREE.Color(COLORS.sky)
    camera = new THREE.PerspectiveCamera(50, 1, 0.1, 5000)
    const sun = new THREE.DirectionalLight('#ffffff', 1.6)
    sun.position.set(-1, 2, 1)
    scene.add(new THREE.HemisphereLight('#aab8ff', '#1a1f33', 1.4), sun)
    controls = new OrbitControls(camera, canvas)
    controls.enableDamping = true
    controls.maxPolarAngle = Math.PI * 0.48
    raycaster = new THREE.Raycaster()
    canvas.addEventListener('pointermove', hover)
    canvas.addEventListener('pointerleave', () => (tip.hidden = true))
    canvas.addEventListener('dblclick', fit)
    new ResizeObserver(resize).observe(canvas)
  }

  const resize = () => {
    if (!renderer) return
    const { clientWidth: w, clientHeight: h } = canvas
    if (!w || !h) return
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }

  const fit = () => {
    if (!group || !controls) return
    const size = group.userData.size
    controls.target.set(size / 2, 0, size / 2)
    camera.position.set(size / 2, size * 1.0, size * 1.5)
    controls.update()
  }

  const label = text => {
    const c = document.createElement('canvas')
    c.width = 256
    c.height = 64
    const g = c.getContext('2d')
    g.font = 'bold 36px sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.lineWidth = 6
    g.strokeStyle = '#070b17'
    g.strokeText(text, 128, 32, 248)
    g.fillStyle = '#dfe6ff'
    g.fillText(text, 128, 32, 248)
    return new T.THREE.Sprite(new T.THREE.SpriteMaterial({ map: new T.THREE.CanvasTexture(c), depthTest: false, transparent: true }))
  }

  // the city drawn from the repo's files; what was touched keeps its light
  const build = tree => {
    const { THREE } = T
    if (group) {
      scene.remove(group)
      group.traverse(o => {
        o.geometry?.dispose()
        o.material?.map?.dispose()
        o.material?.dispose?.()
      })
    }
    const city = layoutCity(tree)
    group = new THREE.Group()
    group.userData.size = Math.max(city.width, 10)
    const box = new THREE.BoxGeometry(1, 1, 1)
    const dummy = new THREE.Object3D()
    const put = (m, i, x, z, w, d, y0, y1) => {
      dummy.position.set(x + w / 2, (y0 + y1) / 2, z + d / 2)
      dummy.scale.set(w, y1 - y0, d)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
    }

    const slabs = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial(), city.dirs.length + 1)
    put(slabs, 0, 0, 0, city.width, city.depth, 0, slabTop(0))
    slabs.setColorAt(0, new THREE.Color(COLORS.ground))
    city.dirs.forEach((dir, i) => {
      const depth = depthOf(dir.path)
      put(slabs, i + 1, dir.x, dir.z, dir.w, dir.d, 0, slabTop(depth))
      slabs.setColorAt(i + 1, new THREE.Color(COLORS.ground).offsetHSL(0, 0, Math.min(depth, 6) * 0.012))
    })

    files = city.files
    mesh = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial(), files.length)
    index.clear()
    files.forEach((f, i) => {
      const bottom = slabTop(depthOf(f.path) - 1)
      const inset = Math.min(0.12, f.w / 4, f.d / 4)
      put(mesh, i, f.x + inset, f.z + inset, f.w - 2 * inset, f.d - 2 * inset, bottom, bottom + buildingHeight(f.lines))
      mesh.setColorAt(i, new THREE.Color(f.folded ? COLORS.folded : COLORS.base))
      index.set(f.path, i)
    })
    group.add(slabs, mesh)

    const big = [...city.dirs].sort((a, b) => b.w * b.d - a.w * a.d).slice(0, LABELS)
    for (const dir of big) {
      if (depthOf(dir.path) > 2 || dir.w < 6) continue
      const sprite = label(dir.path.split('/').pop())
      sprite.position.set(dir.x + dir.w / 2, 4, dir.z + dir.d / 2)
      sprite.scale.set(Math.min(dir.w * 0.8, 14), Math.min(dir.w * 0.2, 3.5), 1)
      group.add(sprite)
    }
    scene.add(group)
    if (shownCwd !== cwd) {
      shownCwd = cwd
      fit()
    }
  }

  // each frame: touched files get their colour, easing back to a resting light
  const kindColors = {}
  const paint = () => {
    if (!mesh) return
    const { THREE } = T
    const now = Date.now()
    const base = new THREE.Color(COLORS.base)
    const tint = new THREE.Color()
    for (const [path, { kind, at }] of touchesOf(shownCwd)) {
      const i = index.get(path)
      if (i === undefined) continue
      mesh.setColorAt(i, tint.copy(base).lerp((kindColors[kind] ??= new THREE.Color(COLORS[kind])), glowLevel(now - at)))
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }

  const load = async () => {
    if (!cwd || !T) return
    const gen = ++loadGen
    const res = await fetch(`/tree?cwd=${encodeURIComponent(cwd)}`).catch(() => null)
    if (!res?.ok || gen !== loadGen) return
    const tree = await res.json()
    if (gen === loadGen) build(tree)
  }

  const hover = event => {
    if (!mesh) return
    const r = canvas.getBoundingClientRect()
    raycaster.setFromCamera({ x: ((event.clientX - r.left) / r.width) * 2 - 1, y: -((event.clientY - r.top) / r.height) * 2 + 1 }, camera)
    const hit = raycaster.intersectObject(mesh)[0]
    const file = hit && files[hit.instanceId]
    tip.hidden = !file
    if (!file) return
    tip.textContent = file.folded ? `${file.path} (${file.folded} files)` : `${file.path} · ${file.lines} lines`
    tip.style.left = `${event.clientX - r.left + 12}px`
    tip.style.top = `${event.clientY - r.top + 12}px`
  }

  const draw = () => {
    frame = requestAnimationFrame(draw)
    controls.update()
    paint()
    renderer.render(scene, camera)
  }

  const setVisible = async on => {
    visible = on
    if (!on) {
      cancelAnimationFrame(frame)
      frame = 0
      return
    }
    await init()
    if (!visible) return
    resize()
    if (shownCwd !== cwd) await load()
    if (visible && !frame) frame = requestAnimationFrame(draw)
  }

  // which repo to show: a chat's folder
  const setRepo = next => {
    if (next === cwd) return
    cwd = next
    if (visible) load()
  }

  // every tool event is noted, shown or not; a file the map does not have yet brings a fresh reading of the repo
  const feed = event => {
    const touch = touchOf(event, event.cwd)
    if (!touch) return
    const touches = touchesOf(event.cwd)
    const known = event.cwd !== shownCwd || index.has(touch.path)
    let kind = touch.kind === 'edit' && !known ? 'new' : touch.kind
    if (RANK[touches.get(touch.path)?.kind] > RANK[kind]) kind = touches.get(touch.path).kind
    touches.set(touch.path, { kind, at: event.at ?? Date.now() })
    if (!known && visible && event.cwd === cwd) {
      clearTimeout(refetch)
      refetch = setTimeout(load, REFETCH_MS)
    }
  }

  return { feed, setRepo, setVisible, resetView: fit }
}
