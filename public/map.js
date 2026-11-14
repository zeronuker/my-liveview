// The Map: the chat's repo in 3D, lit by what Claude reads and edits. Four styles:
//   city    every file a building on a plain (city.js lays it out)
//   sphere  folders inside, every file a dot on a sphere around them (sphere.js)
//   planet  the same files on the skin of a dark planet, the repo at its top pole
//   globe   the sphere, inside a faint globe outline
// glow.js says what is lit. This draws it with three.js, which is only loaded the first time the Map is shown.

import { layoutCity } from './city.js'
import { glowLevel, touchOf } from './glow.js'
import { curvePoints, layoutSphere } from './sphere.js'

const COLORS = {
  base: '#2a3550', folded: '#44444e', read: '#5aa0ff', edit: '#ffb347', new: '#7bd88f', ground: '#10162a', sky: '#070b17',
  dot: '#8c9ccc', dir: '#aab4dc', edge: '#3f4d82',
}
const RANK = { read: 1, edit: 2, new: 3 }
const GLOBES = new Set(['sphere', 'planet', 'globe'])
const LABELS = 60 // the biggest folders are named
const REFETCH_MS = 1500 // a file that is not in the map yet: the repo is read again after this
const GROW_MS = 700 // a dot grows out over this long
const STAGGER_MS = 300 // and each ring of folders starts this much after the one inside it
const TRAIL_MS = 1100 // the comet takes this long from one file to the next
const TAIL = 26 // points in a comet's tail
const TRAILS = 3 // comets drawn at once
const GLIDE_MS = 900

const buildingHeight = lines => 0.4 + Math.log2(1 + lines) * 0.6
const depthOf = path => (path ? path.split('/').length : 0)
const slabTop = depth => 0.2 + Math.min(depth, 6) * 0.03
const ease = t => 1 - (1 - Math.min(Math.max(t, 0), 1)) ** 3

export const createMap = ({ canvas, tip }) => {
  let T = null // { THREE, OrbitControls }, once loaded
  let scene, camera, renderer, controls, raycaster
  let group = null // everything drawn for the current repo
  let mesh = null // city: the files, one instance each
  let files = [] // city: the layout's files, as the instances are numbered
  let nodes = [] // globes: the layout's nodes, as the dots are numbered
  let globe = null // globes: { dots, trail, edges, size } the parts drawn each frame
  let visible = false
  let cwd = ''
  let shownCwd = '' // the repo drawn now
  let mode = 'sphere'
  let shownMode = ''
  let lastTree = null // the repo's files as last read, so a change of style needs no new read
  let glide = null // the camera easing to a new place
  let loadGen = 0
  let frame = 0
  let refetch = 0
  const origin = Date.now()
  const index = new Map() // path -> instance (city) or node (globes) number
  const born = new Map() // path -> when its dot starts to grow
  const trails = []
  const lastPath = new Map() // folder -> the file touched last there, where the next comet starts
  const touchedBy = new Map() // folder -> Map(path -> { kind, at })
  const touchesOf = folder => touchedBy.get(folder) ?? touchedBy.set(folder, new Map()).get(folder)
  const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  let ready = null // apply() can show the Map twice before three.js has loaded: set up once
  const init = () => (ready ??= setup())
  const setup = async () => {
    const THREE = await import('three')
    const { OrbitControls } = await import('./vendor/OrbitControls.js')
    T = { THREE, OrbitControls }
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    scene = new THREE.Scene()
    scene.background = new THREE.Color(COLORS.sky)
    camera = new THREE.PerspectiveCamera(50, 1, 0.1, 8000)
    const sun = new THREE.DirectionalLight('#ffffff', 1.6)
    sun.position.set(-1, 2, 1)
    scene.add(new THREE.HemisphereLight('#aab8ff', '#1a1f33', 1.4), sun)
    controls = new OrbitControls(camera, canvas)
    controls.enableDamping = true
    controls.addEventListener('start', () => (glide = null))
    raycaster = new THREE.Raycaster()
    canvas.addEventListener('pointermove', hover)
    canvas.addEventListener('pointerleave', () => (tip.hidden = true))
    canvas.addEventListener('dblclick', () => fit())
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

  // back to the whole picture: at once the first time, after that the camera glides
  const fit = instant => {
    if (!group || !controls) return
    const { center, cam } = group.userData
    if (instant === true || calm) {
      glide = null
      controls.target.copy(center)
      camera.position.copy(cam)
      controls.update()
      return
    }
    glide = { at: performance.now(), from: camera.position.clone(), fromTarget: controls.target.clone(), to: cam, toTarget: center }
  }

  const label = (text, serif) => {
    const c = document.createElement('canvas')
    c.width = 256
    c.height = 64
    const g = c.getContext('2d')
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    if (serif) {
      g.font = '500 34px Georgia, serif'
      g.fillStyle = 'rgba(214, 222, 255, 0.9)'
    } else {
      g.font = 'bold 36px sans-serif'
      g.lineWidth = 6
      g.strokeStyle = '#070b17'
      g.strokeText(text, 128, 32, 248)
      g.fillStyle = '#dfe6ff'
    }
    g.fillText(text, 128, 32, 246)
    return new T.THREE.Sprite(new T.THREE.SpriteMaterial({ map: new T.THREE.CanvasTexture(c), depthTest: serif, transparent: true, depthWrite: false }))
  }

  // the repo drawn in the chosen style; what was touched keeps its light
  const build = tree => {
    lastTree = tree
    if (group) {
      scene.remove(group)
      group.traverse(o => {
        o.geometry?.dispose()
        o.material?.map?.dispose()
        o.material?.dispose?.()
      })
    }
    const fresh = shownCwd !== cwd || shownMode !== mode
    mesh = null
    globe = null
    files = []
    nodes = []
    index.clear()
    if (fresh) born.clear()
    group = new T.THREE.Group()
    ;(GLOBES.has(mode) ? addGlobe : addCity)(tree, fresh)
    scene.add(group)
    controls.maxPolarAngle = GLOBES.has(mode) ? Math.PI : Math.PI * 0.48
    controls.autoRotate = GLOBES.has(mode) && !calm
    controls.autoRotateSpeed = 0.5
    if (fresh) {
      shownCwd = cwd
      shownMode = mode
      trails.length = 0
      fit(true)
    }
  }

  // dots with a soft halo, so a touched file glows; each is drawn in the shader
  const pointMaterial = () =>
    new T.THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 } },
      vertexShader: `attribute float aSize; attribute vec3 aColor; attribute vec3 aHalo; attribute float aGlow;
        uniform float uScale; varying vec3 vC; varying vec3 vH; varying float vG;
        void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
          gl_PointSize = uScale * aSize * 6.0 / -mv.z; vC = aColor; vH = aHalo; vG = aGlow; }`,
      fragmentShader: `varying vec3 vC; varying vec3 vH; varying float vG;
        void main() { float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0) discard;
          float core = smoothstep(0.19, 0.14, d); float halo = pow(1.0 - d, 2.6) * vG;
          gl_FragColor = vec4(vC * core * 1.15 + vH * halo, 1.0); }`,
      transparent: true,
      blending: T.THREE.AdditiveBlending,
      depthWrite: false,
    })

  // a set of dots whose size, colour and glow change every frame
  const dotSet = count => {
    const { THREE } = T
    const attrs = { position: new Float32Array(count * 3), aSize: new Float32Array(count), aColor: new Float32Array(count * 3), aHalo: new Float32Array(count * 3), aGlow: new Float32Array(count) }
    const geometry = new THREE.BufferGeometry()
    for (const [name, array] of Object.entries(attrs)) geometry.setAttribute(name, new THREE.BufferAttribute(array, name === 'aSize' || name === 'aGlow' ? 1 : 3))
    const points = new THREE.Points(geometry, pointMaterial())
    points.frustumCulled = false
    return { points, attrs, geometry }
  }

  const addGlobe = (tree, fresh) => {
    const { THREE } = T
    const layout = layoutSphere(tree, mode === 'planet' ? 'planet' : 'sphere')
    nodes = layout.nodes
    const R = layout.radius
    const planet = mode === 'planet' ? R : 0
    group.userData.center = new THREE.Vector3()
    group.userData.cam = planet ? new THREE.Vector3(0, R * 1.7, R * 2.7) : new THREE.Vector3(0, R * 1.0, R * 3.2)
    controls.maxDistance = R * 9

    const now = Date.now()
    nodes.forEach((n, i) => {
      index.set(n.path, i)
      if (!born.has(n.path)) born.set(n.path, calm ? now - GROW_MS : fresh ? now + Math.max(n.depth - 1, 0) * STAGGER_MS + (n.dir ? 0 : 150) : now)
    })

    // branches: thin curves that fade towards the tips and grow outward
    const positions = []
    const colors = []
    const starts = []
    const edge = new THREE.Color(COLORS.edge)
    for (const [a, b] of layout.edges) {
      const points = curvePoints(nodes[a], nodes[b], planet)
      const start = (born.get(nodes[b].path) - origin) / 1000
      for (let i = 1; i < points.length; i++) {
        for (const j of [i - 1, i]) {
          const p = points[j]
          positions.push(p.x, p.y, p.z)
          const f = (0.62 - (0.4 * j) / (points.length - 1) - (0.06 * nodes[b].depth) / Math.max(layout.depth, 1)) * 2
          colors.push(edge.r * f, edge.g * f, edge.b * f)
          starts.push(start + (j / (points.length - 1)) * 0.3)
        }
      }
    }
    const edgeGeometry = new THREE.BufferGeometry()
    edgeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    edgeGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    edgeGeometry.setAttribute('aStart', new THREE.Float32BufferAttribute(starts, 1))
    const edgeMaterial = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: `attribute vec3 color; attribute float aStart; uniform float uTime; varying vec3 vC;
        void main() { vC = color * smoothstep(aStart, aStart + 0.3, uTime); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: 'varying vec3 vC; void main() { gl_FragColor = vec4(vC, 1.0); }',
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    group.add(new THREE.LineSegments(edgeGeometry, edgeMaterial))

    const dots = dotSet(nodes.length)
    nodes.forEach((n, i) => dots.attrs.position.set([n.x, n.y, n.z], i * 3))
    const sizes = nodes.map((n, i) => (i === 0 ? R * 0.07 : n.dir ? R * 0.022 : Math.min(R * 0.014 + Math.sqrt(n.lines) * R * 0.0016, R * 0.04)))
    const trail = dotSet(TRAILS * TAIL)
    group.add(dots.points, trail.points)
    globe = { dots, trail, edgeMaterial, sizes, R, planet }

    // names on the folders nearest the middle
    for (const n of nodes.filter(m => m.dir && (m.depth === 1 || m.depth === 2)).slice(0, LABELS)) {
      const sprite = label(n.path.split('/').pop(), true)
      sprite.scale.set(R * 0.34, R * 0.085, 1)
      sprite.position.set(n.x, n.y + R * 0.06, n.z)
      group.add(sprite)
    }

    // the planet's dark skin, or the globe's faint outline
    if (mode === 'planet') {
      group.add(
        new THREE.Mesh(new THREE.SphereGeometry(R * 0.985, 72, 52), new THREE.MeshBasicMaterial({ color: '#0a1124' })),
        new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.SphereGeometry(R * 0.99, 24, 16)), new THREE.LineBasicMaterial({ color: '#16204a', transparent: true, opacity: 0.55 })),
      )
    }
    if (mode === 'globe') {
      group.add(
        new THREE.Mesh(new THREE.SphereGeometry(R * 1.1, 64, 48), new THREE.MeshBasicMaterial({ color: '#4a64c8', transparent: true, opacity: 0.045, side: THREE.BackSide, depthWrite: false })),
        new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.SphereGeometry(R * 1.1, 24, 16)), new THREE.LineBasicMaterial({ color: '#4a64c8', transparent: true, opacity: 0.16, depthWrite: false })),
      )
    }
  }

  const addCity = tree => {
    const { THREE } = T
    const city = layoutCity(tree)
    const size = Math.max(city.width, 10)
    group.userData.center = new THREE.Vector3(size / 2, 0, size / 2)
    group.userData.cam = new THREE.Vector3(size / 2, size * 1.0, size / 2 + size * 1.5)
    controls.maxDistance = size * 6
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
      const sprite = label(dir.path.split('/').pop(), false)
      sprite.position.set(dir.x + dir.w / 2, 4, dir.z + dir.d / 2)
      sprite.scale.set(Math.min(dir.w * 0.8, 14), Math.min(dir.w * 0.2, 3.5), 1)
      group.add(sprite)
    }
  }

  // each frame: touched files get their colour, easing back to a resting light
  const kindColors = {}
  const kindColor = kind => (kindColors[kind] ??= new T.THREE.Color(COLORS[kind]))
  const paintCity = now => {
    const base = new T.THREE.Color(COLORS.base)
    const tint = new T.THREE.Color()
    for (const [path, { kind, at }] of touchesOf(shownCwd)) {
      const i = index.get(path)
      if (i !== undefined) mesh.setColorAt(i, tint.copy(base).lerp(kindColor(kind), glowLevel(now - at)))
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }

  // the globes: dots grow out from the middle, pop and glow when touched; comets fly between touched files
  let scratchTint = null
  const paintGlobe = now => {
    const { THREE } = T
    const { dots, trail, edgeMaterial, sizes, R } = globe
    const scale = canvas.height / (2 * Math.tan((camera.fov * Math.PI) / 360))
    dots.points.material.uniforms.uScale.value = scale
    trail.points.material.uniforms.uScale.value = scale
    edgeMaterial.uniforms.uTime.value = (now - origin) / 1000
    const touches = touchesOf(shownCwd)
    const tint = (scratchTint ??= new THREE.Color())
    const { attrs } = dots
    nodes.forEach((n, i) => {
      let size = sizes[i] * ease((now - born.get(n.path)) / GROW_MS)
      let glow = i === 0 ? 0.55 + 0.1 * Math.sin(now / 900) : 0
      tint.set(n.dir ? COLORS.dir : n.folded ? COLORS.folded : COLORS.dot)
      let halo = kindColor('read')
      const touch = touches.get(n.path)
      if (touch && now >= touch.at) {
        const age = now - touch.at
        const level = glowLevel(age)
        const pop = Math.max(0, 1 - age / 700) ** 2
        halo = kindColor(touch.kind)
        tint.lerp(halo, Math.min(1, level + 0.2))
        glow = level
        size *= 1 + 0.9 * pop + 0.35 * level
      }
      attrs.aSize[i] = size
      attrs.aGlow[i] = glow
      attrs.aColor.set([tint.r, tint.g, tint.b], i * 3)
      attrs.aHalo.set([halo.r, halo.g, halo.b], i * 3)
    })
    for (const name of ['aSize', 'aGlow', 'aColor', 'aHalo']) dots.geometry.attributes[name].needsUpdate = true

    const t = trail.attrs
    t.aSize.fill(0)
    while (trails.length > TRAILS) trails.shift()
    trails.forEach((tr, ti) => {
      const p = (now - tr.at) / TRAIL_MS
      const fade = p < 1 ? 1 : Math.max(0, 1 - (p - 1) * 1.6)
      for (let k = 0; k < TAIL; k++) {
        const slot = ti * TAIL + k
        const along = Math.min(1, p) - k * 0.028
        if (along < 0 || fade <= 0) continue
        const point = tr.path[Math.min(tr.path.length - 1, Math.floor(ease(along) * (tr.path.length - 1)))]
        t.position.set([point.x, point.y, point.z], slot * 3)
        t.aSize[slot] = R * 0.02 * (1 - k / (TAIL + 2)) * fade
        t.aGlow[slot] = (1 - k / TAIL) * 0.9 * fade
        const mix = tint.set(COLORS.edit).lerp(kindColor(tr.kind), k / TAIL)
        t.aColor.set([mix.r, mix.g, mix.b], slot * 3)
        t.aHalo.set([mix.r, mix.g, mix.b], slot * 3)
      }
    })
    for (const name of ['position', 'aSize', 'aGlow', 'aColor', 'aHalo']) trail.geometry.attributes[name].needsUpdate = true
  }

  const load = async () => {
    if (!cwd || !T) return
    const gen = ++loadGen
    const res = await fetch(`/tree?cwd=${encodeURIComponent(cwd)}`).catch(() => null)
    if (!res?.ok || gen !== loadGen) return
    const tree = await res.json()
    if (gen === loadGen) build(tree)
  }

  const show = (event, rect, file) => {
    tip.hidden = !file
    if (!file) return
    tip.textContent = file.folded ? `${file.path} (${file.folded} files)` : `${file.path} · ${file.lines} lines`
    tip.style.left = `${event.clientX - rect.left + 12}px`
    tip.style.top = `${event.clientY - rect.top + 12}px`
  }

  const hover = event => {
    const rect = canvas.getBoundingClientRect()
    if (globe) {
      // the dot nearest the pointer, within a few pixels; on the planet, only dots on the side facing us
      const { THREE } = T
      const at = new THREE.Vector3()
      const toCamera = new THREE.Vector3()
      let best = null
      let near = 14 * 14
      for (const n of nodes) {
        if (n.dir) continue
        at.set(n.x, n.y, n.z)
        if (globe.planet && at.dot(toCamera.copy(camera.position).sub(at)) < 0) continue
        at.project(camera)
        if (at.z > 1) continue
        const dx = ((at.x + 1) / 2) * rect.width - (event.clientX - rect.left)
        const dy = ((1 - at.y) / 2) * rect.height - (event.clientY - rect.top)
        if (dx * dx + dy * dy < near) {
          near = dx * dx + dy * dy
          best = n
        }
      }
      return show(event, rect, best)
    }
    if (!mesh) return
    raycaster.setFromCamera({ x: ((event.clientX - rect.left) / rect.width) * 2 - 1, y: -((event.clientY - rect.top) / rect.height) * 2 + 1 }, camera)
    const hit = raycaster.intersectObject(mesh)[0]
    show(event, rect, hit && files[hit.instanceId])
  }

  const draw = () => {
    frame = requestAnimationFrame(draw)
    if (glide) {
      const k = ease((performance.now() - glide.at) / GLIDE_MS)
      camera.position.lerpVectors(glide.from, glide.to, k)
      controls.target.lerpVectors(glide.fromTarget, glide.toTarget, k)
      if (k >= 1) glide = null
    }
    controls.update()
    if (globe) paintGlobe(Date.now())
    else if (mesh) paintCity(Date.now())
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
    else if (shownMode !== mode && lastTree) build(lastTree)
    if (visible && !frame) frame = requestAnimationFrame(draw)
  }

  // which repo to show: a chat's folder
  const setRepo = next => {
    if (next === cwd) return
    cwd = next
    if (visible) load()
  }

  // every tool event is noted, shown or not; a file the map does not have yet brings a fresh reading of the repo,
  // and in the globes a file touched just now is flown to by a comet from the one before
  const feed = event => {
    const touch = touchOf(event, event.cwd)
    if (!touch) return
    const touches = touchesOf(event.cwd)
    const known = event.cwd !== shownCwd || index.has(touch.path)
    let kind = touch.kind === 'edit' && !known ? 'new' : touch.kind
    if (RANK[touches.get(touch.path)?.kind] > RANK[kind]) kind = touches.get(touch.path).kind
    let at = event.at ?? Date.now()
    if (globe && event.cwd === shownCwd && index.has(touch.path) && Date.now() - at < 4000) {
      const from = nodes[index.get(lastPath.get(event.cwd) ?? '') ?? 0]
      const to = nodes[index.get(touch.path)]
      trails.push({ kind, at: Date.now(), path: curvePoints(from, to, globe.planet, 40) })
      at = Date.now() + TRAIL_MS // it lights up when the comet lands
    }
    lastPath.set(event.cwd, touch.path)
    touches.set(touch.path, { kind, at })
    if (!known && visible && event.cwd === cwd) {
      clearTimeout(refetch)
      refetch = setTimeout(load, REFETCH_MS)
    }
  }

  // 'city', 'sphere', 'planet' or 'globe'
  const setMode = next => {
    if (next === mode) return
    mode = next
    if (visible && lastTree) build(lastTree)
  }

  return { feed, setRepo, setMode, setVisible, resetView: fit }
}
