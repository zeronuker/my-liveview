// The Map: the chat's repo in 3D, lit by what Claude reads and edits. Two styles:
//   nebula  every file a star, linked to the files it imports, each folder a coloured cloud (nebula.js)
//   city    every file a building at night, imports as arcs between rooftops, lit windows for recent work (city.js)
// Both share the links that light up with running light, and the comets from one file to the next.
// glow.js says what is lit. This draws it with three.js, which is only loaded the first time the Map is shown.

import { ROAD, ageLight, buildingHeight, buildingPieces, cityArc, hash, layoutCity, treeSpots } from './city.js'
import { FADE_MS, glowLevel, touchOf } from './glow.js'
import { litOf, sizeOf, tintOf } from './measure.js'
import { blastRadius, curvePoints, importLinks, layoutNebula } from './nebula.js'
import { changesBetween, stateAt, timeline } from './replay.js'

const BLAST = '#8fe9ff' // the colour of a blast radius
const COLORS = {
  folded: '#4a4d55', read: '#6cb4ff', edit: '#ffb347', new: '#7bf0a0', sky: '#05060f', night: '#060b0d',
  asphalt: '#161a21', walk: '#222833', lane: '#d8c48a', lamp: '#ffcf7a', roof: '#5a6170', crane: '#f0b43c', arc: '#5fd3e6', grey: '#6d7079',
}
const DISTRICT_HUES = [0.97, 0.08, 0.53, 0.74, 0.13, 0.44, 0.88, 0.6] // muted pinks, creams, teals, lavenders
const RANK = { read: 1, edit: 2, new: 3 }
const LABELS = 12 // the biggest folders are named
const DUST_PER_FILE = 3 // faint specks in each cloud, so a bigger folder is a denser cloud
const REFETCH_MS = 1500 // a file that is not in the map yet: the repo is read again after this
const GROW_MS = 900 // a star fades in, or a building rises, over this long
const SPREAD_MS = 1400 // and the outermost starts this much after the middle
const TRAIL_MS = 1100 // the comet takes this long from one file to the next
const TAIL = 26 // points in a comet's tail
const TRAILS = 3 // comets drawn at once
const STEPS = 12 // segments in a link's curve
const SPARKS = 2 // lights running along each lit link
const MAX_SPARKS = 600
const RINGS = 48 // pulse rings drawn at once (nebula)
const CRANES = 40 // cranes on buildings Claude has edited (city)
const LIGHTS = 12 // searchlights on buildings Claude is reading (city)
const PULSE_S = 1.3 // a busy file beats once in this long
const BLAST_MS = 260 // the blast radius spreads one step out in this long
const REPLAY_MS = 30000 // the time-lapse plays the whole history in this long at speed 1
const GLIDE_MS = 900

const depthOf = path => (path ? path.split('/').length : 0)
const slabTop = depth => 0.2 + Math.min(depth, 6) * 0.03
const ease = t => 1 - (1 - Math.min(Math.max(t, 0), 1)) ** 3

// canvas and tip are the Map's canvas and its pointer tip; bar is the time-lapse bar's parts:
// { box, open, play, time, date, speed, close }
export const createMap = ({ canvas, tip, bar }) => {
  let T = null // { THREE, OrbitControls }, once loaded
  let scene, camera, renderer, controls, raycaster
  let group = null // everything drawn for the current repo
  let items = [] // the files drawn, as they are numbered: nebula nodes or city lots, each with a path
  let web = null // what both styles share: { spots, links, curves, ... } (addWeb)
  let sky = null // nebula: the stars, clouds and rings
  let town = null // city: the buildings, cranes and searchlights
  let visible = false
  let cwd = ''
  let shownCwd = '' // the repo drawn now
  let mode = 'nebula'
  let shownMode = ''
  let lastTree = null // the repo's files as last read, so a change of style needs no new read
  let glide = null // the camera easing to a new place
  let hovered = -1 // the file under the pointer
  let loadGen = 0
  let frame = 0
  let refetch = 0
  let pressed = null
  let mapping = { height: 'lines', footprint: 'lines', colour: 'folder', windows: 'recent' } // what a building shows (measure.js)
  let focus = null // the blast radius shown: { i, at, steps: Map(number -> steps away) }
  let replay = null // the time-lapse: { line, t, playing, speed, touches, wall }
  let restore = false // the time-lapse has closed: put everything back as it is now
  const origin = Date.now()
  const index = new Map() // path -> its number in items
  const born = new Map() // path -> when its star or building starts to appear
  const trails = []
  const lastPath = new Map() // folder -> the file touched last there, where the next comet starts
  const resting = new Set() // folders whose chat has finished its turn: the last file there stops beating
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
    camera = new THREE.PerspectiveCamera(50, 1, 0.1, 20000)
    const moon = new THREE.DirectionalLight('#c9d6ff', 1.1)
    moon.position.set(-1, 2, 1)
    scene.add(new THREE.HemisphereLight('#8fa2d8', '#141a24', 1.1), moon)
    controls = new OrbitControls(camera, canvas)
    controls.enableDamping = true
    controls.addEventListener('start', () => (glide = null))
    raycaster = new THREE.Raycaster()
    canvas.addEventListener('pointermove', hover)
    canvas.addEventListener('pointerleave', () => {
      tip.hidden = true
      hovered = -1
    })
    canvas.addEventListener('pointerdown', event => (pressed = { x: event.clientX, y: event.clientY }))
    canvas.addEventListener('click', click)
    canvas.addEventListener('dblclick', () => fit())
    window.addEventListener('keydown', event => event.key === 'Escape' && visible && (focus = null))
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

  const glideTo = (cam, target) => (glide = { at: performance.now(), from: camera.position.clone(), fromTarget: controls.target.clone(), to: cam, toTarget: target })

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
    glideTo(cam, center)
  }

  const label = (text, serif) => {
    const c = document.createElement('canvas')
    c.width = 256
    c.height = 64
    const g = c.getContext('2d')
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    if (serif) {
      g.font = 'italic 300 32px Georgia, serif'
      g.shadowColor = 'rgba(160, 180, 255, 0.9)'
      g.shadowBlur = 12
      g.fillStyle = 'rgba(226, 232, 255, 0.85)'
    } else {
      g.font = '600 30px ui-monospace, Consolas, monospace'
      g.shadowColor = 'rgba(0, 0, 0, 0.9)'
      g.shadowBlur = 8
      g.fillStyle = 'rgba(232, 236, 245, 0.9)'
    }
    g.fillText(text, 128, 32, 246)
    return new T.THREE.Sprite(new T.THREE.SpriteMaterial({ map: new T.THREE.CanvasTexture(c), depthTest: serif, transparent: true, depthWrite: false, opacity: serif ? 0.8 : 1 }))
  }

  // a name for each of the biggest folders; a name two folders share gets its parent too (prayer/components)
  const folderNames = dirs => {
    const short = (dir, parts) => dir.split('/').slice(-parts).join('/') || 'repo'
    const shared = new Set(dirs.map(d => short(d, 1)).filter((n, i, all) => all.indexOf(n) !== i))
    return dir => short(dir, shared.has(short(dir, 1)) ? 2 : 1)
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
    sky = null
    town = null
    web = null
    items = []
    dotSets.length = 0
    hovered = -1
    focus = null
    index.clear()
    if (fresh) born.clear()
    group = new T.THREE.Group()
    ;(mode === 'nebula' ? addNebula : addCity)(tree, fresh)
    scene.add(group)
    scene.background.set(mode === 'nebula' ? COLORS.sky : COLORS.night)
    controls.maxPolarAngle = mode === 'nebula' ? Math.PI : Math.PI * 0.47
    controls.autoRotate = !calm
    controls.autoRotateSpeed = mode === 'nebula' ? 0.3 : 0.15
    if (fresh) {
      shownCwd = cwd
      shownMode = mode
      trails.length = 0
      fit(true)
    }
  }

  // numbers the files and says when each starts to appear: from the middle outward when the repo is new to the window
  const number = (list, fresh, distance) => {
    items = list
    const now = Date.now()
    list.forEach((item, i) => {
      index.set(item.path, i)
      if (!born.has(item.path)) born.set(item.path, calm || !fresh ? now - GROW_MS : now + distance(item) * SPREAD_MS)
    })
    if (replay) stateNow() // the time-lapse's sizes, for the files as now numbered
  }

  // soft glowing dots, drawn in the shader; `ring` draws each as a thin ring instead
  const pointMaterial = ring =>
    new T.THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 } },
      vertexShader: `attribute float aSize; attribute vec3 aColor; attribute vec3 aHalo; attribute float aGlow;
        uniform float uScale; varying vec3 vC; varying vec3 vH; varying float vG;
        void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
          gl_PointSize = uScale * aSize * 6.0 / -mv.z; vC = aColor; vH = aHalo; vG = aGlow; }`,
      fragmentShader: ring
        ? `varying vec3 vC; varying vec3 vH; varying float vG;
          void main() { float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0) discard;
            float band = exp(-pow((d - 0.82) * 9.0, 2.0)); gl_FragColor = vec4(vH * band * vG, 1.0); }`
        : `varying vec3 vC; varying vec3 vH; varying float vG;
          void main() { float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0) discard;
            float core = exp(-d * d * 40.0); float halo = (exp(-d * d * 6.0) * 0.7 + pow(1.0 - d, 3.0) * 0.3) * vG;
            gl_FragColor = vec4(vC * core * 1.3 + vH * halo, 1.0); }`,
      transparent: true,
      blending: T.THREE.AdditiveBlending,
      depthWrite: false,
    })

  // a set of dots whose size, colour and glow can change every frame
  const dotSets = []
  const dotSet = (count, ring) => {
    const { THREE } = T
    const attrs = { position: new Float32Array(count * 3), aSize: new Float32Array(count), aColor: new Float32Array(count * 3), aHalo: new Float32Array(count * 3), aGlow: new Float32Array(count) }
    const geometry = new THREE.BufferGeometry()
    for (const [name, array] of Object.entries(attrs)) geometry.setAttribute(name, new THREE.BufferAttribute(array, name === 'aSize' || name === 'aGlow' ? 1 : 3))
    const points = new THREE.Points(geometry, pointMaterial(ring))
    points.frustumCulled = false
    const changed = (...names) => names.forEach(name => (geometry.attributes[name].needsUpdate = true))
    const set = { points, attrs, geometry, changed }
    dotSets.push(set)
    return set
  }

  // far stars all round; `upper` keeps them above the horizon
  const farStars = (radius, upper) => {
    const far = dotSet(1800)
    for (let i = 0; i < 1800; i++) {
      const u = upper ? Math.random() * 0.95 + 0.05 : Math.random() * 2 - 1
      const t = Math.random() * Math.PI * 2
      const r = radius * (1 + Math.random() * 0.7)
      const s = Math.sqrt(1 - u * u)
      far.attrs.position.set([Math.cos(t) * s * r, u * r, Math.sin(t) * s * r], i * 3)
      far.attrs.aSize[i] = radius * 0.0006 * (0.4 + Math.random() ** 3 * 2)
      const tint = new T.THREE.Color().setHSL(0.55 + Math.random() * 0.4, 0.5, 0.55 + Math.random() * 0.3)
      far.attrs.aColor.set([tint.r, tint.g, tint.b], i * 3)
    }
    return far
  }

  // the links both styles draw: an arc for each import, in the colours of its two ends, that lights up and runs
  // with light when one end is busy; and the sparks and comets that travel along them
  const addWeb = (spots, links, colorOf, arc, light) => {
    const { THREE } = T
    const count = links.length * STEPS * 2
    const attrs = { position: new Float32Array(count * 3), aColor: new Float32Array(count * 3), aT: new Float32Array(count), aStart: new Float32Array(count), aGlow: new Float32Array(count), aFlow: new Float32Array(count), aHot: new Float32Array(count * 3), aShow: new Float32Array(count).fill(1) }
    const curves = []
    const linksOf = spots.map(() => [])
    links.forEach(([a, b], l) => {
      linksOf[a].push(l)
      linksOf[b].push(l)
      const points = arc(spots[a], spots[b], STEPS)
      curves.push(points)
      const ca = colorOf(a).clone().multiplyScalar(light)
      const cb = colorOf(b).clone().multiplyScalar(light)
      const start = (Math.max(born.get(items[a].path), born.get(items[b].path)) - origin) / 1000
      let v = l * STEPS * 2
      for (let i = 1; i <= STEPS; i++) {
        for (const j of [i - 1, i]) {
          const p = points[j]
          const t = j / STEPS
          const mix = ca.clone().lerp(cb, t)
          attrs.position.set([p.x, p.y, p.z], v * 3)
          attrs.aColor.set([mix.r, mix.g, mix.b], v * 3)
          attrs.aT[v] = t
          attrs.aStart[v] = start + 0.25 + t * 0.4
          v++
        }
      }
    })
    const geometry = new THREE.BufferGeometry()
    for (const [name, array] of Object.entries(attrs)) geometry.setAttribute(name, new THREE.BufferAttribute(array, array.length === count ? 1 : 3))
    const material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uMove: { value: calm ? 0 : 1 }, uDim: { value: 1 } },
      vertexShader: `attribute vec3 aColor; attribute float aT; attribute float aStart; attribute float aGlow; attribute float aFlow; attribute vec3 aHot; attribute float aShow;
        uniform float uTime; varying vec3 vC; varying vec3 vH; varying float vT; varying float vG; varying float vF; varying float vIn;
        void main() { vC = aColor; vH = aHot; vT = aT; vG = aGlow; vF = aFlow; vIn = smoothstep(aStart, aStart + 0.4, uTime) * aShow;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform float uTime; uniform float uMove; uniform float uDim; varying vec3 vC; varying vec3 vH; varying float vT; varying float vG; varying float vF; varying float vIn;
        void main() { float along = vF < 0.0 ? 1.0 - vT : vT;
          float wave = pow(0.5 + 0.5 * sin((along * 3.0 - uTime * 1.6 * uMove) * 6.2832), 6.0);
          gl_FragColor = vec4((vC * uDim + vH * vG * (0.7 + 2.4 * wave)) * vIn, 1.0); }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const lines = new THREE.LineSegments(geometry, material)
    lines.frustumCulled = false
    const sparks = dotSet(MAX_SPARKS)
    const trail = dotSet(TRAILS * TAIL)
    group.add(lines, sparks.points, trail.points)
    web = { spots, links, linksOf, curves, attrs, geometry, material, sparks, trail, arc, lit: new Set() }
  }

  const addNebula = (tree, fresh) => {
    const { THREE } = T
    const layout = layoutNebula(tree)
    const nodes = layout.nodes
    const R = layout.radius
    group.userData.center = new THREE.Vector3()
    group.userData.cam = new THREE.Vector3(0, R * 0.55, R * 2.6)
    controls.maxDistance = R * 6
    const cloudColor = c => new THREE.Color().setHSL(c.hue, 0.7, 0.62)
    const starColor = c => new THREE.Color().setHSL(c.hue, 0.65, 0.76)
    number(nodes, fresh, n => Math.hypot(n.x, n.y, n.z) / R)

    // far stars all round, and faint dust in each cloud, more where there are more files
    const far = farStars(R * 7)
    const big = layout.clouds.filter(c => c.count)
    const perFile = Math.min(DUST_PER_FILE, 8000 / nodes.length)
    const specks = big.flatMap(c => Array(Math.round(c.count * perFile)).fill(c))
    const dust = dotSet(specks.length)
    specks.forEach((c, i) => {
      const spread = c.spread + 4
      const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * spread * 1.1
      dust.attrs.position.set([c.x + gauss(), c.y + gauss() * 0.7, c.z + gauss()], i * 3)
      dust.attrs.aSize[i] = 0.1 + Math.random() * 0.2
      const tint = cloudColor(c).multiplyScalar(0.06 + Math.random() * 0.07)
      dust.attrs.aColor.set([tint.r, tint.g, tint.b], i * 3)
      dust.attrs.aHalo.set([tint.r, tint.g, tint.b], i * 3)
      dust.attrs.aGlow[i] = 0.6
    })

    // the clouds: a few big soft smudges in each folder's colour, turning slowly; fainter when there are many,
    // so where they overlap they do not wash out to white
    const clouds = []
    const faint = Math.min(1, Math.sqrt(8 / big.length))
    for (const c of big) {
      const base = cloudColor(c)
      const size = (c.spread + 8) * 2.6
      for (let k = 0; k < 3; k++) {
        const material = new THREE.SpriteMaterial({ map: puffTexture(), color: base.clone().offsetHSL((k - 1) * 0.04, 0, 0), transparent: true, opacity: (0.11 * faint) / (1 + k * 0.3), blending: THREE.AdditiveBlending, depthWrite: false })
        const sprite = new THREE.Sprite(material)
        const off = (c.spread + 4) * 0.35
        sprite.position.set(c.x + (Math.random() - 0.5) * off, c.y + (Math.random() - 0.5) * off, c.z + (Math.random() - 0.5) * off)
        sprite.scale.setScalar(size * (1 - k * 0.22))
        material.rotation = Math.random() * Math.PI * 2
        clouds.push({ sprite, spin: (Math.random() - 0.5) * 0.00008 })
        group.add(sprite)
      }
    }
    group.add(far.points, dust.points)

    const colors = nodes.map(n => starColor(layout.clouds[n.cloud]))
    const linkLight = 0.11 * Math.min(1, Math.sqrt(150 / Math.max(layout.links.length, 1))) // fainter when there are many, so a big repo does not wash out
    addWeb(nodes, layout.links, i => colors[i], curvePoints, linkLight)

    const stars = dotSet(nodes.length)
    nodes.forEach((n, i) => stars.attrs.position.set([n.x, n.y, n.z], i * 3))
    const sizes = nodes.map(n => 0.22 + Math.sqrt(n.degree) * 0.09 + Math.log2(1 + n.lines) * 0.018)
    const phases = nodes.map((n, i) => (i * 2.399) % (Math.PI * 2))
    const rings = dotSet(RINGS, true)
    group.add(stars.points, rings.points)
    sky = { stars, rings, colors, sizes, phases, clouds, R }

    const name = folderNames(big.map(c => c.dir))
    for (const c of big.filter(c => c.count > 1).sort((a, b) => b.count - a.count).slice(0, LABELS)) {
      const sprite = label(name(c.dir), true)
      sprite.scale.set(R * 0.4, R * 0.1, 1)
      sprite.position.set(c.x, c.y + c.spread * 0.8 + 4, c.z)
      group.add(sprite)
    }
  }

  // a soft round smudge, the stuff the clouds are made of
  let puff = null
  const puffTexture = () => {
    if (puff) return puff
    const c = document.createElement('canvas')
    c.width = c.height = 128
    const g = c.getContext('2d')
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
    grad.addColorStop(0, 'rgba(255,255,255,1)')
    grad.addColorStop(0.35, 'rgba(255,255,255,0.45)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 128, 128)
    return (puff = new T.THREE.CanvasTexture(c))
  }

  // the buildings' walls: a grid of windows, some lit (more for recent work), drawn in the shader;
  // aHeat glows a building Claude is working on; aDim darkens one outside a blast radius
  const buildingMaterial = () =>
    new T.THREE.ShaderMaterial({
      vertexShader: `attribute vec3 aColor; attribute float aLit; attribute float aSeed; attribute vec3 aHeat; attribute float aDim;
        varying vec3 vN; varying vec3 vL; varying vec3 vM; varying vec3 vSize; varying vec3 vC; varying float vLit; varying float vSeed; varying vec3 vHeat; varying float vDim;
        void main() {
          vL = normal; vDim = aDim;
          vSize = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
          vM = (position + 0.5) * vSize; vN = normalize(mat3(instanceMatrix) * normal);
          vC = aColor; vLit = aLit; vSeed = aSeed; vHeat = aHeat;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
      fragmentShader: `varying vec3 vN; varying vec3 vL; varying vec3 vM; varying vec3 vSize; varying vec3 vC; varying float vLit; varying float vSeed; varying vec3 vHeat; varying float vDim;
        float rand(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main() {
          vec3 n = normalize(vN);
          float shade = 0.42 + 0.58 * max(dot(n, normalize(vec3(-0.4, 1.0, 0.3))), 0.0);
          vec3 color = vC * shade;
          float glass = 0.0;
          vec3 l = normalize(vL);
          if (abs(l.y) < 0.5) {
            float along = abs(l.x) > 0.5 ? vM.z : vM.x;
            vec2 cell = vec2(along / 0.42, (vM.y - 0.2) / 0.52);
            vec2 f = fract(cell);
            float inside = step(0.22, f.x) * step(f.x, 0.78) * step(0.28, f.y) * step(f.y, 0.78);
            inside *= step(0.0, cell.y) * step(vM.y + 0.25, vSize.y) * step(0.12, along) * step(along, (abs(l.x) > 0.5 ? vSize.z : vSize.x) - 0.12);
            float on = step(rand(floor(cell) + vec2(vSeed * 31.0, l.x * 7.0 + l.z * 13.0)), vLit);
            color = mix(color, color * 0.32 + vec3(0.02, 0.03, 0.05), inside);
            glass = inside * on;
            color += glass * vec3(1.0, 0.8, 0.48) * 0.95;
          } else color *= 0.72;
          color = color * vDim + vHeat * (0.45 + glass * 0.9);
          gl_FragColor = vec4(color, 1.0); }`,
    })

  const addCity = (tree, fresh) => {
    const { THREE } = T
    // what each part shows (measure.js): the footprint sets the layout, the height each building's height
    const most = Math.max(1, ...tree.map(f => f.changes ?? 0))
    const byPath = new Map(tree.map(f => [f.path, f]))
    const city = layoutCity(tree.map(f => ({ ...f, size: sizeOf(f, mapping.footprint, most) })))
    const tall = f => (f.folded ? 0 : sizeOf(byPath.get(f.path) ?? f, mapping.height, most))
    const tallest = Math.max(0, ...city.files.map(f => buildingHeight(tall(f))))
    const size = Math.max(city.width, city.depth, tallest * 2, 10)
    const mid = new THREE.Vector3(city.width / 2, 0, city.depth / 2)
    group.userData.center = new THREE.Vector3(mid.x, tallest * 0.2, mid.z)
    group.userData.cam = new THREE.Vector3(mid.x, size * 0.5, mid.z + size * 0.85)
    controls.maxDistance = size * 4
    const box = new THREE.BoxGeometry(1, 1, 1)
    const dummy = new THREE.Object3D()
    // a box with its middle at x, z (turned by angle round y) from y0 to y1
    const put = (m, i, x, z, w, d, y0, y1, angle = 0) => {
      dummy.position.set(x, (y0 + y1) / 2, z)
      dummy.rotation.set(0, angle, 0)
      dummy.scale.set(w, Math.max(y1 - y0, 1e-3), d)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
    }
    // a point offset by dx, dz from x, z, turned by angle
    const turn = (x, z, dx, dz, angle) => ({ x: x + dx * Math.cos(angle) + dz * Math.sin(angle), z: z - dx * Math.sin(angle) + dz * Math.cos(angle) })

    // the ground fading into the night
    const fade = document.createElement('canvas')
    fade.width = fade.height = 256
    const g = fade.getContext('2d')
    const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128)
    grad.addColorStop(0, '#0f1c18')
    grad.addColorStop(0.6, '#08100e')
    grad.addColorStop(1, COLORS.night)
    g.fillStyle = grad
    g.fillRect(0, 0, 256, 256)
    const fadeMap = new THREE.CanvasTexture(fade)
    fadeMap.colorSpace = THREE.SRGBColorSpace
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(size * 7, size * 7), new THREE.MeshBasicMaterial({ map: fadeMap }))
    ground.rotation.x = -Math.PI / 2
    ground.position.set(mid.x, -0.01, mid.z)

    // inside each ring road: park ground, with a patch of pavement under every building
    const parks = city.districts.map(d => {
      const shape = new THREE.Shape(d.ring.map(p => new THREE.Vector2(p.x, -p.z)))
      const m = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshLambertMaterial({ color: '#15281f' }))
      m.rotation.x = -Math.PI / 2
      m.position.y = 0.04
      return m
    })
    const files = city.files
    const pads = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 14), new THREE.MeshLambertMaterial({ color: COLORS.walk }), files.length)

    // the roads: a ring road round each district and curving main roads between them, with lane lines and lamps
    const strip = []
    const ribbon = (points, closed) => {
      const n = points.length
      const side = i => {
        const a = points[closed ? (i - 1 + n) % n : Math.max(i - 1, 0)]
        const b = points[closed ? (i + 1) % n : Math.min(i + 1, n - 1)]
        const length = Math.hypot(b.x - a.x, b.z - a.z) || 1
        return { x: (-(b.z - a.z) / length) * (ROAD / 2), z: ((b.x - a.x) / length) * (ROAD / 2) }
      }
      for (let i = 0; i < (closed ? n : n - 1); i++) {
        const [p, q] = [points[i], points[(i + 1) % n]]
        const [sp, sq] = [side(i), side((i + 1) % n)]
        const v = (x, z) => strip.push(x, 0.1, z)
        v(p.x + sp.x, p.z + sp.z)
        v(p.x - sp.x, p.z - sp.z)
        v(q.x + sq.x, q.z + sq.z)
        v(q.x + sq.x, q.z + sq.z)
        v(p.x - sp.x, p.z - sp.z)
        v(q.x - sq.x, q.z - sq.z)
      }
    }
    for (const d of city.districts) ribbon(d.ring, true)
    for (const road of city.roads) ribbon(road, false)
    const roadGeometry = new THREE.BufferGeometry()
    roadGeometry.setAttribute('position', new THREE.Float32BufferAttribute(strip, 3))
    const roads = new THREE.Mesh(roadGeometry, new THREE.MeshBasicMaterial({ color: COLORS.asphalt, side: THREE.DoubleSide }))
    const segments = [
      ...city.districts.flatMap(d => d.ring.map((p, i) => [p, d.ring[(i + 1) % d.ring.length]])),
      ...city.roads.flatMap(road => road.slice(1).map((q, i) => [road[i], q])),
    ]
    const lanes = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(segments.flatMap(([p, q]) => [new THREE.Vector3(p.x, 0.13, p.z), new THREE.Vector3(q.x, 0.13, q.z)])), new THREE.LineDashedMaterial({ color: COLORS.lane, dashSize: 0.45, gapSize: 0.45, transparent: true, opacity: 0.5 }))
    lanes.computeLineDistances()
    const lampSpots = []
    for (const d of city.districts) {
      let walked = 0
      d.ring.forEach((p, i) => {
        const q = d.ring[(i + 1) % d.ring.length]
        const length = Math.hypot(q.x - p.x, q.z - p.z)
        const [nx, nz] = [-(q.z - p.z) / (length || 1), (q.x - p.x) / (length || 1)]
        for (let s = (3 - (walked % 3)) % 3; s < length; s += 3) for (const k of [-1, 1]) lampSpots.push([p.x + ((q.x - p.x) * s) / length + nx * k * ROAD * 0.62, p.z + ((q.z - p.z) * s) / length + nz * k * ROAD * 0.62])
        walked += length
      })
    }
    const lamps = dotSet(lampSpots.length)
    const lamp = new THREE.Color(COLORS.lamp)
    lampSpots.forEach(([x, z], i) => {
      lamps.attrs.position.set([x, 0.55, z], i * 3)
      lamps.attrs.aSize[i] = 0.09
      lamps.attrs.aColor.set([lamp.r, lamp.g, lamp.b], i * 3)
      lamps.attrs.aHalo.set([lamp.r * 0.6, lamp.g * 0.5, lamp.b * 0.3], i * 3)
      lamps.attrs.aGlow[i] = 0.7
    })

    // trees in the parks and round the districts
    const treeList = treeSpots(city)
    const crowns = new THREE.InstancedMesh(new THREE.ConeGeometry(0.5, 1.6, 7), new THREE.MeshLambertMaterial(), treeList.length)
    treeList.forEach((t, i) => {
      dummy.position.set(t.x, 0.8 * t.size + 0.1, t.z)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.setScalar(t.size)
      dummy.updateMatrix()
      crowns.setMatrixAt(i, dummy.matrix)
      crowns.setColorAt(i, new THREE.Color('#21463a').offsetHSL((hash(`${i}`) - 0.5) * 0.06, 0, (hash(`${i}#l`) - 0.5) * 0.06))
    })

    // the buildings: one per file, turned as the layout says, in its neighbourhood's colour (its folder, two levels
    // deep: src/components), weathered grey the longer it has been left alone; a big file is a stepped skyscraper
    const tops = []
    const hood = f => f.path.split('/').slice(0, -1).slice(0, 2).join('/')
    const hoods = [...new Set(files.map(hood))].sort()
    const hueOf = f => DISTRICT_HUES[hoods.indexOf(hood(f)) % DISTRICT_HUES.length]
    const now = Date.now()
    const colors = []
    const pieces = [] // { file, x, z, w, d, y0, y1, angle }, x, z the piece's middle, heights from the ground
    const bottom = slabTop(1)
    const lots = files.map((f, i) => {
      const seed = hash(f.path)
      const height = buildingHeight(tall(f))
      const parts = buildingPieces(f.w, f.d, tall(f), seed)
      for (const p of parts) pieces.push({ ...turn(f.x, f.z, p.x, p.z, f.angle), w: p.w, d: p.d, y0: bottom + p.y0, y1: bottom + p.y1, angle: f.angle, file: i, top: p.y1 === height })
      const top = parts.find(p => p.y1 === height)
      tops.push({ ...turn(f.x, f.z, top.x, top.z, f.angle), y: bottom + height })
      return { w: f.w, d: f.d, bottom, height }
    })
    const shell = new THREE.BoxGeometry(1, 1, 1)
    const mesh = new THREE.InstancedMesh(shell, buildingMaterial(), pieces.length)
    const attr = (name, size) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(pieces.length * size), size)
      shell.setAttribute(name, a)
      return a
    }
    const aColor = attr('aColor', 3)
    const aLit = attr('aLit', 1)
    const aSeed = attr('aSeed', 1)
    const aHeat = attr('aHeat', 3)
    const aDim = attr('aDim', 1)
    aDim.array.fill(1)
    const piecesOf = files.map(() => [])
    files.forEach(f => {
      const file = byPath.get(f.path) ?? f
      const tint = tintOf(file, mapping.colour, now, most)
      const color = f.folded
        ? new THREE.Color(COLORS.folded)
        : tint
          ? new THREE.Color().setHSL(tint.h, tint.s, tint.l)
          : new THREE.Color().setHSL(hueOf(f), 0.34, 0.4).lerp(new THREE.Color(COLORS.grey), ageLight(file.changed, now).grey)
      colors.push(Object.assign(color, { lit: f.folded ? 0.1 : litOf(file, mapping.windows, now, most) }))
    })
    pieces.forEach((p, k) => {
      const c = colors[p.file]
      piecesOf[p.file].push(k)
      aColor.setXYZ(k, c.r, c.g, c.b)
      aLit.setX(k, c.lit)
      aSeed.setX(k, hash(`${files[p.file].path}#${k}`))
    })
    number(files, fresh, f => Math.hypot(f.x - mid.x, f.z - mid.z) / (size * 0.71))

    // small boxes on the roofs of the bigger buildings
    const roofSpots = pieces.filter(p => p.top && p.w > 1.3 && p.d > 1.3)
    const roofList = roofSpots.flatMap((p, k) =>
      [0, 1].map(j => {
        const r = hash(`${k}:${j}`)
        const s = 0.22 + r * 0.22
        return { ...turn(p.x, p.z, (r - 0.5) * (p.w - s - 0.4), (hash(`${j}:${k}`) - 0.5) * (p.d - s - 0.4), p.angle), s, y0: p.y1, y1: p.y1 + (j ? 0.12 : 0.25 + r * 0.2), angle: p.angle, file: p.file }
      }),
    )
    const roofs = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial({ color: COLORS.roof }), roofList.length)

    // the buildings, roof boxes and pavement at their height now: rising when the city opens, and in the time-lapse
    // as tall as each file was then (0: not there yet); says whether any is still rising
    const shape = now => {
      let rising = false
      const scale = files.map((f, i) => {
        const grow = ease((now - born.get(f.path)) / GROW_MS)
        if (grow < 1) rising = true
        return grow * (replay ? replay.scale[i] : 1)
      })
      pieces.forEach((p, k) => {
        const f = scale[p.file]
        put(mesh, k, p.x, p.z, f > 0 ? p.w : 1e-3, f > 0 ? p.d : 1e-3, bottom + (p.y0 - bottom) * f, bottom + (p.y1 - bottom) * f, p.angle)
      })
      roofList.forEach((r, k) => {
        const f = scale[r.file]
        put(roofs, k, r.x, r.z, f > 0 ? r.s : 1e-3, f > 0 ? r.s : 1e-3, bottom + (r.y0 - bottom) * f, bottom + (r.y1 - bottom) * f, r.angle)
      })
      files.forEach((f, i) => put(pads, i, f.x, f.z, scale[i] > 0 ? f.r + 0.3 : 1e-3, scale[i] > 0 ? f.r + 0.3 : 1e-3, 0, slabTop(1)))
      for (const m of [mesh, roofs, pads]) m.instanceMatrix.needsUpdate = true
      mesh.computeBoundingSphere()
      return rising
    }
    shape(now)

    const far = farStars(size * 4, true)
    far.points.position.copy(mid)
    group.add(ground, ...parks, roads, pads, lanes, lamps.points, crowns, mesh, roofs, far.points)
    addWeb(tops, importLinks(tree, index), () => new THREE.Color(COLORS.arc), cityArc, 0.16 * Math.min(1, Math.sqrt(150 / Math.max(files.length, 1))))

    // searchlights for buildings being read, and room for cranes and their beacons on buildings being edited
    const cone = new THREE.ConeGeometry(1, 1, 24, 1, true)
    const lights = Array.from({ length: LIGHTS }, () => {
      const m = new THREE.Mesh(cone, new THREE.MeshBasicMaterial({ color: COLORS.read, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }))
      m.visible = false
      group.add(m)
      return m
    })
    const beacons = dotSet(CRANES)
    group.add(beacons.points)
    town = { mesh, lots, tops, colors, aHeat, aDim, aLit, piecesOf, owner: pieces.map(p => p.file), shape, rising: true, lights, beacons, cranes: new Map(), heated: new Set(), size }

    // the districts' names, over their tallest building
    const name = folderNames(city.districts.map(d => d.path))
    city.districts.forEach((d, di) => {
      const own = tops.filter((t, i) => files[i].district === di)
      if (own.length < 2 || di >= LABELS) return
      const tallest = Math.max(...own.map(t => t.y))
      const sprite = label(name(d.path), false)
      sprite.position.set(d.x, tallest + 2.5, d.z)
      const wide = Math.max(9, size * 0.07)
      sprite.scale.set(wide, wide / 4, 1)
      group.add(sprite)
    })
  }

  // a tower crane on a building Claude has edited: mast, jib, counter-jib and a hanging cable
  const addCrane = i => {
    const { THREE } = T
    const top = town.tops[i]
    const lot = town.lots[i]
    const h = 1.6 + Math.min(lot.height * 0.4, 2)
    const jib = Math.max(lot.w, lot.d) * 0.6 + 0.8
    const steel = new THREE.MeshLambertMaterial({ color: COLORS.crane, emissive: COLORS.crane, emissiveIntensity: 0.15 })
    const crane = new THREE.Group()
    const bar = (w, hh, d, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), steel)
      m.position.set(x, y, z)
      crane.add(m)
    }
    const head = new THREE.Group()
    bar(0.12, h, 0.12, 0, h / 2, 0)
    head.position.y = h
    crane.add(head)
    const jibBar = (w, x) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, 0.1), steel)
      m.position.x = x
      head.add(m)
    }
    jibBar(jib, jib / 2)
    jibBar(jib * 0.35, -jib * 0.175)
    const weight = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.18), steel)
    weight.position.set(-jib * 0.3, -0.12, 0)
    head.add(weight)
    const cable = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(jib * 0.85, 0, 0), new THREE.Vector3(jib * 0.85, -h * 0.6, 0)]), new THREE.LineBasicMaterial({ color: '#cfd3da' }))
    head.add(cable)
    crane.position.set(top.x, top.y, top.z)
    head.rotation.y = hash(items[i].path) * Math.PI * 2
    group.add(crane)
    return { head, mast: h, slot: town.cranes.size }
  }

  // each frame, what both styles need: how busy each touched file is, the links of busy files lit, sparks running
  // along them, and the comets
  const kindColors = {}
  const kindColor = kind => (kindColors[kind] ??= new T.THREE.Color(COLORS[kind]))
  let scratch = null
  // what has been touched: Claude's work, or in the time-lapse the files the commits changed
  const touchesNow = () => (replay ? replay.touches : touchesOf(shownCwd))
  const busyFiles = now => {
    const touches = touchesNow()
    const latest = replay || resting.has(shownCwd) ? undefined : index.get(lastPath.get(shownCwd))
    const out = new Map() // number -> { touch, level, beat, color }
    for (const [path, touch] of touches) {
      const i = index.get(path)
      if (i === undefined || now < touch.at) continue
      const fresh = Math.max(0, 1 - (now - touch.at) / FADE_MS)
      const level = Math.max(fresh, i === latest ? 0.55 : 0)
      const beat = calm ? 0.5 : 0.5 + 0.5 * Math.sin(((now - touch.at) / 1000 / PULSE_S) * Math.PI * 2)
      out.set(i, { touch, level, beat, color: kindColor(touch.kind) })
    }
    return out
  }

  const paintWeb = (now, busy, colorOf) => {
    const { THREE } = T
    const { attrs, geometry, material, linksOf, links, curves, sparks, trail, lit } = web
    const time = (now - origin) / 1000
    material.uniforms.uTime.value = time
    const tint = (scratch ??= new THREE.Color())
    const hot = new Map() // link -> { glow, flow, color }
    const heat = (i, glow, color) => {
      for (const l of linksOf[i]) if (!hot.has(l) || hot.get(l).glow < glow) hot.set(l, { glow, flow: links[l][0] === i ? 1 : -1, color })
    }
    for (const [i, b] of busy) if (b.level > 0) heat(i, b.level, b.color)
    if (hovered >= 0) heat(hovered, 0.5, colorOf(hovered))
    // the blast radius: each link from a file to one that uses it lights up as the blast reaches it
    material.uniforms.uDim.value = focus ? 0.3 : 1
    if (focus) {
      const blast = tint.set(BLAST).clone()
      links.forEach(([a, b], l) => {
        const step = focus.steps.get(a)
        if (step === undefined || focus.steps.get(b) !== step - 1 || now - focus.at < step * BLAST_MS) return
        hot.set(l, { glow: Math.max(0.35, 1 - step * 0.15), flow: -1, color: blast })
      })
    }
    // the time-lapse: a link shows once both its files are there
    if (replay) {
      const per = STEPS * 2
      links.forEach(([a, b], l) => attrs.aShow.fill(replay.scale[a] > 0 && replay.scale[b] > 0 ? 1 : 0, l * per, (l + 1) * per))
      geometry.attributes.aShow.needsUpdate = true
    } else if (restore) {
      attrs.aShow.fill(1)
      geometry.attributes.aShow.needsUpdate = true
    }

    // the links that were lit and are not now go dark; the lit ones take their glow
    const per = STEPS * 2
    const setLink = (l, glow, flow, color) => {
      for (let v = l * per; v < (l + 1) * per; v++) {
        attrs.aGlow[v] = glow
        attrs.aFlow[v] = flow
        attrs.aHot.set([color.r, color.g, color.b], v * 3)
      }
    }
    if (lit.size || hot.size) {
      for (const l of lit) if (!hot.has(l)) setLink(l, 0, 1, tint.setRGB(0, 0, 0))
      lit.clear()
      for (const [l, h] of hot) {
        setLink(l, h.glow, h.flow, h.color)
        lit.add(l)
      }
      for (const name of ['aGlow', 'aFlow', 'aHot']) geometry.attributes[name].needsUpdate = true
    }

    // sparks: little lights running along each lit link, away from the busy file
    const s = sparks.attrs
    s.aSize.fill(0)
    let slot = 0
    if (!calm) {
      for (const [l, h] of hot) {
        const points = curves[l]
        for (let k = 0; k < SPARKS && slot < MAX_SPARKS; k++, slot++) {
          let along = (time * 0.45 + k / SPARKS + l * 0.137) % 1
          if (h.flow < 0) along = 1 - along
          const p = points[Math.round(along * STEPS)]
          s.position.set([p.x, p.y, p.z], slot * 3)
          s.aSize[slot] = 0.6 * h.glow * Math.sin(Math.PI * along) + 0.08
          s.aGlow[slot] = h.glow
          s.aColor.set([h.color.r, h.color.g, h.color.b], slot * 3)
          s.aHalo.set([h.color.r, h.color.g, h.color.b], slot * 3)
        }
      }
    }
    sparks.changed('position', 'aSize', 'aGlow', 'aColor', 'aHalo')

    // comets from the file touched before to the one touched now
    const t = trail.attrs
    t.aSize.fill(0)
    while (trails.length > TRAILS) trails.shift()
    trails.forEach((tr, ti) => {
      const p = (now - tr.at) / TRAIL_MS
      const fade = p < 1 ? 1 : Math.max(0, 1 - (p - 1) * 1.6)
      for (let k = 0; k < TAIL; k++) {
        const at = ti * TAIL + k
        const along = Math.min(1, p) - k * 0.028
        if (along < 0 || fade <= 0) continue
        const point = tr.path[Math.min(tr.path.length - 1, Math.floor(ease(along) * (tr.path.length - 1)))]
        t.position.set([point.x, point.y, point.z], at * 3)
        t.aSize[at] = 0.55 * (1 - k / (TAIL + 2)) * fade + 0.1
        t.aGlow[at] = (1 - k / TAIL) * 0.9 * fade
        const mix = tint.set('#ffffff').lerp(kindColor(tr.kind), 0.4 + (0.6 * k) / TAIL)
        t.aColor.set([mix.r, mix.g, mix.b], at * 3)
        t.aHalo.set([mix.r, mix.g, mix.b], at * 3)
      }
    })
    trail.changed('position', 'aSize', 'aGlow', 'aColor', 'aHalo')
  }

  // the nebula each frame: stars fade in and twinkle; a busy star beats and sends rings out
  const paintNebula = (now, busy) => {
    const { stars, rings, colors, sizes, phases, clouds } = sky
    const time = (now - origin) / 1000
    if (!calm) for (const c of clouds) c.sprite.material.rotation += c.spin * 16
    const touches = touchesNow()
    const tint = (scratch ??= new T.THREE.Color())
    const blast = kindColors.blast ?? (kindColors.blast = new T.THREE.Color(BLAST))
    const { attrs } = stars
    items.forEach((n, i) => {
      const grow = ease((now - born.get(n.path)) / GROW_MS) * (replay ? Math.sqrt(replay.scale[i]) : 1)
      let size = sizes[i] * grow
      let glow = (0.35 + (calm ? 0 : 0.12 * Math.sin(time * 1.3 + phases[i]))) * grow
      tint.copy(colors[i])
      let halo = colors[i]
      const touch = touches.get(n.path)
      if (touch && now >= touch.at) {
        halo = kindColor(touch.kind)
        tint.lerp(halo, glowLevel(now - touch.at))
      }
      const b = busy.get(i)
      if (b?.level > 0) {
        size *= 1 + b.level * (0.8 + 0.9 * b.beat)
        glow = Math.max(glow, 0.7 + b.level * (0.9 + 0.9 * b.beat))
      }
      if (i === hovered) {
        glow = Math.max(glow, 1)
        size *= 1.3
      }
      if (focus) {
        const step = focus.steps.get(i)
        if (step !== undefined && now - focus.at >= step * BLAST_MS) {
          halo = blast
          glow = Math.max(glow, 1.4 - step * 0.15)
          size *= step ? 1.2 : 1.6
        } else {
          glow *= 0.25
          tint.multiplyScalar(0.35)
        }
      }
      attrs.aSize[i] = size
      attrs.aGlow[i] = glow
      attrs.aColor.set([tint.r, tint.g, tint.b], i * 3)
      attrs.aHalo.set([halo.r, halo.g, halo.b], i * 3)
    })
    stars.changed('aSize', 'aGlow', 'aColor', 'aHalo')

    // rings: each beat of a busy star sends a ring out that widens and fades
    const r = rings.attrs
    r.aSize.fill(0)
    ;[...busy].filter(([, b]) => b.level > 0).sort((a, b) => b[1].level - a[1].level).slice(0, RINGS).forEach(([i, b], k) => {
      const n = items[i]
      const phase = calm ? 0.5 : (((now - b.touch.at) / 1000) % PULSE_S) / PULSE_S
      r.position.set([n.x, n.y, n.z], k * 3)
      r.aSize[k] = sizes[i] * (1.5 + phase * 6)
      r.aGlow[k] = b.level * (1 - phase) * 1.8
      r.aHalo.set([b.color.r, b.color.g, b.color.b], k * 3)
    })
    rings.changed('position', 'aSize', 'aGlow', 'aHalo')
  }

  // the city each frame: buildings rise when the city opens; a building Claude touched keeps a faint glow,
  // one it is busy with glows and beats; edited ones get a crane with a blinking beacon, read ones a searchlight
  const paintCity = (now, busy) => {
    const { THREE } = T
    if (town.rising || replay || restore) town.rising = town.shape(now)
    const { aHeat, aDim, aLit, heated, lights, beacons, cranes, tops, lots, piecesOf, owner, colors } = town
    const touches = touchesNow()
    const glow = new Map() // number -> heat colour
    for (const [path, touch] of touches) {
      const i = index.get(path)
      if (i === undefined || now < touch.at) continue
      const b = busy.get(i)
      const level = 0.12 + (b?.level > 0 ? b.level * (0.45 + 0.45 * b.beat) : 0)
      glow.set(i, kindColor(touch.kind).clone().multiplyScalar(level))
      if (!replay && (touch.kind === 'edit' || touch.kind === 'new') && !cranes.has(i) && cranes.size < CRANES) cranes.set(i, addCrane(i))
    }
    if (hovered >= 0) glow.set(hovered, (glow.get(hovered) ?? new THREE.Color()).clone().add(new THREE.Color(0.18, 0.2, 0.24)))

    // the blast radius: the clicked building and all that depend on it glow, step by step; the rest go dark
    if (focus || aDim.array[0] !== 1) {
      const blast = new THREE.Color(BLAST)
      owner.forEach((i, k) => {
        const step = focus?.steps.get(i)
        const reached = step !== undefined && now - focus.at >= step * BLAST_MS
        aDim.setX(k, !focus || reached ? 1 : 0.25)
        if (reached) glow.set(i, blast.clone().multiplyScalar(step ? Math.max(0.2, 0.55 - step * 0.08) : 0.9))
      })
      aDim.needsUpdate = true
    }

    // the time-lapse: windows lit for work done shortly before the day shown
    if (replay || restore) {
      owner.forEach((i, k) => aLit.setX(k, replay && mapping.windows === 'recent' ? ageLight(replay.changed[i], replay.t).lit : colors[i].lit))
      aLit.needsUpdate = true
    }
    for (const i of heated) if (!glow.has(i)) for (const k of piecesOf[i]) aHeat.setXYZ(k, 0, 0, 0)
    heated.clear()
    for (const [i, c] of glow) {
      for (const k of piecesOf[i]) aHeat.setXYZ(k, c.r, c.g, c.b)
      heated.add(i)
    }
    aHeat.needsUpdate = true

    // cranes: the jib swings slowly while the building is busy; the beacon on top blinks
    const bc = beacons.attrs
    bc.aSize.fill(0)
    for (const [i, crane] of cranes) {
      const b = busy.get(i)
      const on = b?.level > 0
      if (on && !calm) crane.head.rotation.y += 0.004
      const top = tops[i]
      bc.position.set([top.x, top.y + crane.mast + 0.12, top.z], crane.slot * 3)
      const blink = calm ? 1 : 0.5 + 0.5 * Math.sin(now / 260)
      bc.aSize[crane.slot] = on ? 0.18 + 0.12 * blink : 0.1
      bc.aGlow[crane.slot] = on ? 0.6 + blink : 0.4
      bc.aColor.set([1, 0.3, 0.25], crane.slot * 3)
      bc.aHalo.set([1, 0.25, 0.2], crane.slot * 3)
    }
    beacons.changed('position', 'aSize', 'aGlow', 'aColor', 'aHalo')

    // searchlights: a cone of light down onto each building being read
    const reading = [...busy].filter(([, b]) => b.level > 0 && b.touch.kind === 'read').slice(0, LIGHTS)
    lights.forEach((light, k) => {
      const entry = reading[k]
      light.visible = Boolean(entry)
      if (!entry) return
      const [i, b] = entry
      const top = tops[i]
      const r = Math.max(lots[i].w, lots[i].d) * 0.7
      light.scale.set(r, 6, r)
      light.position.set(top.x, top.y + 3, top.z)
      light.material.opacity = b.level * (0.05 + 0.05 * b.beat)
    })
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
    const users = web ? blastRadius(web.links, index.get(file.path)).size - 1 : 0
    const linked = ` · ${users} depend${users === 1 ? 's' : ''} on it`
    tip.textContent = file.folded ? `${file.path} (${file.folded} files)` : `${file.path} · ${file.lines} lines${linked}`
    tip.style.left = `${event.clientX - rect.left + 12}px`
    tip.style.top = `${event.clientY - rect.top + 12}px`
  }

  // the file under the pointer: the nearest star within a few pixels, or the building the pointer is on
  const fileAt = event => {
    const rect = canvas.getBoundingClientRect()
    if (town) {
      raycaster.setFromCamera({ x: ((event.clientX - rect.left) / rect.width) * 2 - 1, y: -((event.clientY - rect.top) / rect.height) * 2 + 1 }, camera)
      const hit = raycaster.intersectObject(town.mesh)[0]
      return hit ? town.owner[hit.instanceId] : -1
    }
    const at = new T.THREE.Vector3()
    let best = -1
    let near = 14 * 14
    items.forEach((n, i) => {
      at.set(n.x, n.y, n.z).project(camera)
      if (at.z > 1) return
      const dx = ((at.x + 1) / 2) * rect.width - (event.clientX - rect.left)
      const dy = ((1 - at.y) / 2) * rect.height - (event.clientY - rect.top)
      if (dx * dx + dy * dy < near) {
        near = dx * dx + dy * dy
        best = i
      }
    })
    return best
  }

  const hover = event => {
    if (!web) return
    hovered = fileAt(event)
    canvas.style.cursor = hovered >= 0 ? 'pointer' : ''
    show(event, canvas.getBoundingClientRect(), items[hovered])
  }

  // a click on a file (not the end of a drag) shows its blast radius and glides the camera up close to it;
  // a click on empty ground clears it
  const click = event => {
    if (!web || !pressed || Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) > 4) return
    const i = fileAt(event)
    focus = i < 0 ? null : { i, at: Date.now(), steps: blastRadius(web.links, i) }
    if (i < 0) return
    const spot = web.spots[i]
    const target = new T.THREE.Vector3(spot.x, spot.y, spot.z)
    const away = camera.position.clone().sub(controls.target).setLength(sky ? Math.max(sky.R * 0.35, 25) : Math.max(town.size * 0.3, 14))
    if (calm) {
      controls.target.copy(target)
      camera.position.copy(target).add(away)
    } else glideTo(target.clone().add(away), target)
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
    if (web) {
      const now = Date.now()
      const scale = canvas.height / (2 * Math.tan((camera.fov * Math.PI) / 360))
      for (const set of dotSets) set.points.material.uniforms.uScale.value = scale
      if (replay) playReplay(now)
      const busy = busyFiles(now)
      paintWeb(now, busy, i => (sky ? sky.colors[i] : town.colors[i]))
      if (sky) paintNebula(now, busy)
      else paintCity(now, busy)
      restore = false
    }
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
    closeReplay()
    cwd = next
    if (visible) load()
  }

  // every tool event is noted, shown or not; a file the map does not have yet brings a fresh reading of the repo,
  // and a file touched just now is flown to by a comet from the one before
  const feed = event => {
    if (event.type === 'turn-end' || event.type === 'turn-fail' || (event.type === 'life' && event.what === 'end')) resting.add(event.cwd)
    const touch = touchOf(event, event.cwd)
    if (!touch) return
    resting.delete(event.cwd)
    const touches = touchesOf(event.cwd)
    const known = event.cwd !== shownCwd || index.has(touch.path)
    let kind = touch.kind === 'edit' && !known ? 'new' : touch.kind
    if (RANK[touches.get(touch.path)?.kind] > RANK[kind]) kind = touches.get(touch.path).kind
    let at = event.at ?? Date.now()
    const from = index.get(lastPath.get(event.cwd))
    const to = index.get(touch.path)
    if (web && event.cwd === shownCwd && from !== undefined && to !== undefined && from !== to && Date.now() - at < 4000) {
      trails.push({ kind, at: Date.now(), path: web.arc(web.spots[from], web.spots[to], 40) })
      at = Date.now() + TRAIL_MS // it lights up when the comet lands
    }
    lastPath.set(event.cwd, touch.path)
    touches.set(touch.path, { kind, at })
    if (!known && visible && event.cwd === cwd) {
      clearTimeout(refetch)
      refetch = setTimeout(load, REFETCH_MS)
    }
  }

  // the time-lapse: the repo's history played back (replay.js). Each frame the day shown moves on; the files the
  // commits in between changed flash as Claude's work does, and each file is as long as it was then.
  const day = t => new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  const showReplay = () => {
    const { start, end } = replay.line
    bar.time.value = String(Math.round(((replay.t - start) / Math.max(end - start, 1)) * 1000))
    bar.date.textContent = day(replay.t)
    bar.play.textContent = replay.playing ? '❚❚' : '▶'
    bar.play.setAttribute('aria-label', replay.playing ? 'Pause' : 'Play')
  }
  const stateNow = () => {
    const states = items.map(f => stateAt(replay.line, f, replay.t))
    replay.scale = states.map((st, i) => (st.exists ? Math.min(1, Math.max(0.12, Math.sqrt(st.lines / Math.max(items[i].lines, 1)))) : 0))
    replay.changed = states.map(st => st.changed)
  }
  const playReplay = now => {
    const wall = performance.now()
    const { start, end } = replay.line
    if (replay.playing) {
      const next = Math.min(end, replay.t + ((end - start || 1) / REPLAY_MS) * replay.speed * Math.min(wall - replay.wall, 100))
      for (const { path, kind } of changesBetween(replay.line, replay.t, next)) replay.touches.set(path, { kind, at: now })
      replay.t = next
      if (next >= end) replay.playing = false
      showReplay()
    }
    replay.wall = wall
    stateNow()
  }
  const openReplay = async () => {
    if (!shownCwd || !lastTree) return
    bar.box.hidden = false
    bar.open.setAttribute('aria-pressed', 'true')
    bar.date.textContent = 'Reading the history...'
    const res = await fetch(`/history?cwd=${encodeURIComponent(shownCwd)}`).catch(() => null)
    const commits = res?.ok ? await res.json() : []
    if (!commits.length) {
      bar.date.textContent = 'No git history here'
      return
    }
    const line = timeline(lastTree, commits)
    replay = { line, t: line.start - 1, playing: !calm, speed: Number(bar.speed.value) || 1, touches: new Map(), wall: performance.now() }
    focus = null
    trails.length = 0
    stateNow()
    showReplay()
  }
  const closeReplay = () => {
    bar.box.hidden = true
    bar.open.setAttribute('aria-pressed', 'false')
    if (!replay) return
    replay = null
    restore = true
  }
  bar.open.onclick = () => (bar.box.hidden ? openReplay() : closeReplay())
  bar.close.onclick = closeReplay
  bar.play.onclick = () => {
    if (!replay) return
    if (replay.t >= replay.line.end) replay.t = replay.line.start - 1
    replay.playing = !replay.playing
    showReplay()
  }
  bar.time.oninput = () => {
    if (!replay) return
    const { start, end } = replay.line
    replay.t = start + (Number(bar.time.value) / 1000) * (end - start)
    replay.playing = false
    showReplay()
  }
  bar.speed.onchange = () => replay && (replay.speed = Number(bar.speed.value) || 1)

  // what each part of a City building shows: { height, footprint, colour, windows } (measure.js)
  const setMapping = next => {
    if (JSON.stringify(next) === JSON.stringify(mapping)) return
    mapping = { ...next }
    if (visible && lastTree && mode === 'city') build(lastTree)
  }

  // 'nebula' or 'city'
  const setMode = next => {
    if (next === mode) return
    mode = next
    if (visible && lastTree) build(lastTree)
  }

  return { feed, setRepo, setMode, setMapping, setVisible, resetView: fit }
}
