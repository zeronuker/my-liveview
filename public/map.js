// The Map: the chat's repo in 3D, lit by what Claude reads and edits. Two styles:
//   nebula  every file a star, linked to the files it imports, each folder a coloured cloud (nebula.js)
//   city    every file a building on a plain (city.js lays it out)
// glow.js says what is lit. This draws it with three.js, which is only loaded the first time the Map is shown.

import { layoutCity } from './city.js'
import { FADE_MS, glowLevel, touchOf } from './glow.js'
import { curvePoints, layoutNebula } from './nebula.js'

const COLORS = {
  base: '#2a3550', folded: '#44444e', read: '#6cb4ff', edit: '#ffb347', new: '#7bf0a0', ground: '#10162a', sky: '#05060f',
}
const RANK = { read: 1, edit: 2, new: 3 }
const LABELS = 60 // the biggest folders are named (city)
const CLOUD_LABELS = 12 // and the biggest clouds of two files or more (nebula)
const DUST_PER_FILE = 3 // faint specks in each cloud, so a bigger folder is a denser cloud
const REFETCH_MS = 1500 // a file that is not in the map yet: the repo is read again after this
const GROW_MS = 900 // a star fades in over this long
const SPREAD_MS = 1400 // and the outermost starts this much after the middle
const TRAIL_MS = 1100 // the comet takes this long from one file to the next
const TAIL = 26 // points in a comet's tail
const TRAILS = 3 // comets drawn at once
const STEPS = 12 // segments in a link's curve
const SPARKS = 2 // lights running along each lit link
const MAX_SPARKS = 600
const RINGS = 48 // pulse rings drawn at once
const PULSE_S = 1.3 // a busy file beats once in this long
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
  let nodes = [] // nebula: the stars, as the dots are numbered
  let sky = null // nebula: { stars, links, sparks, rings, trail, clouds, ... } the parts drawn each frame
  let visible = false
  let cwd = ''
  let shownCwd = '' // the repo drawn now
  let mode = 'nebula'
  let shownMode = ''
  let lastTree = null // the repo's files as last read, so a change of style needs no new read
  let glide = null // the camera easing to a new place
  let hovered = -1 // nebula: the star under the pointer
  let loadGen = 0
  let frame = 0
  let refetch = 0
  const origin = Date.now()
  const index = new Map() // path -> instance (city) or star number (nebula)
  const born = new Map() // path -> when its star starts to fade in
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
    camera = new THREE.PerspectiveCamera(50, 1, 0.1, 20000)
    const sun = new THREE.DirectionalLight('#ffffff', 1.6)
    sun.position.set(-1, 2, 1)
    scene.add(new THREE.HemisphereLight('#aab8ff', '#1a1f33', 1.4), sun)
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
    new ResizeObserver(resize).observe(canvas)
  }
  let pressed = null

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
      g.font = 'bold 36px sans-serif'
      g.lineWidth = 6
      g.strokeStyle = '#070b17'
      g.strokeText(text, 128, 32, 248)
      g.fillStyle = '#dfe6ff'
    }
    g.fillText(text, 128, 32, 246)
    return new T.THREE.Sprite(new T.THREE.SpriteMaterial({ map: new T.THREE.CanvasTexture(c), depthTest: serif, transparent: true, depthWrite: false, opacity: serif ? 0.8 : 1 }))
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
    sky = null
    files = []
    nodes = []
    hovered = -1
    index.clear()
    if (fresh) born.clear()
    group = new T.THREE.Group()
    ;(mode === 'nebula' ? addNebula : addCity)(tree, fresh)
    scene.add(group)
    scene.background.set(mode === 'nebula' ? COLORS.sky : '#070b17')
    controls.maxPolarAngle = mode === 'nebula' ? Math.PI : Math.PI * 0.48
    controls.autoRotate = mode === 'nebula' && !calm
    controls.autoRotateSpeed = 0.3
    if (fresh) {
      shownCwd = cwd
      shownMode = mode
      trails.length = 0
      fit(true)
    }
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
  const dotSet = (count, ring) => {
    const { THREE } = T
    const attrs = { position: new Float32Array(count * 3), aSize: new Float32Array(count), aColor: new Float32Array(count * 3), aHalo: new Float32Array(count * 3), aGlow: new Float32Array(count) }
    const geometry = new THREE.BufferGeometry()
    for (const [name, array] of Object.entries(attrs)) geometry.setAttribute(name, new THREE.BufferAttribute(array, name === 'aSize' || name === 'aGlow' ? 1 : 3))
    const points = new THREE.Points(geometry, pointMaterial(ring))
    points.frustumCulled = false
    const changed = (...names) => names.forEach(name => (geometry.attributes[name].needsUpdate = true))
    return { points, attrs, geometry, changed }
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

  const addNebula = (tree, fresh) => {
    const { THREE } = T
    const layout = layoutNebula(tree)
    nodes = layout.nodes
    const R = layout.radius
    group.userData.center = new THREE.Vector3()
    group.userData.cam = new THREE.Vector3(0, R * 0.55, R * 2.6)
    controls.maxDistance = R * 6
    const cloudColor = c => new THREE.Color().setHSL(c.hue, 0.7, 0.62)
    const starColor = c => new THREE.Color().setHSL(c.hue, 0.65, 0.76)

    const now = Date.now()
    nodes.forEach((n, i) => {
      index.set(n.path, i)
      if (!born.has(n.path)) born.set(n.path, calm || !fresh ? now - GROW_MS : now + (Math.hypot(n.x, n.y, n.z) / R) * SPREAD_MS)
    })

    // far stars all round, and faint dust in each cloud, more where there are more files
    const far = dotSet(1800)
    for (let i = 0; i < 1800; i++) {
      const u = Math.random() * 2 - 1
      const t = Math.random() * Math.PI * 2
      const r = R * (7 + Math.random() * 5)
      const s = Math.sqrt(1 - u * u)
      far.attrs.position.set([Math.cos(t) * s * r, u * r, Math.sin(t) * s * r], i * 3)
      far.attrs.aSize[i] = R * 0.004 * (0.4 + Math.random() ** 3 * 2)
      const tint = new THREE.Color().setHSL(0.55 + Math.random() * 0.4, 0.5, 0.55 + Math.random() * 0.3)
      far.attrs.aColor.set([tint.r, tint.g, tint.b], i * 3)
    }
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
        clouds.push({ sprite, spin: (Math.random() - 0.5) * 0.00008, opacity: material.opacity })
        group.add(sprite)
      }
    }

    // the links: soft arcs in the colours of the two stars, that light up and run with light
    const count = layout.links.length * STEPS * 2
    const linkAttrs = { position: new Float32Array(count * 3), aColor: new Float32Array(count * 3), aT: new Float32Array(count), aStart: new Float32Array(count), aGlow: new Float32Array(count), aFlow: new Float32Array(count), aHot: new Float32Array(count * 3) }
    const curves = []
    const linksOf = nodes.map(() => [])
    layout.links.forEach(([a, b], l) => {
      linksOf[a].push(l)
      linksOf[b].push(l)
      const points = curvePoints(nodes[a], nodes[b], STEPS)
      curves.push(points)
      const ca = starColor(layout.clouds[nodes[a].cloud]).multiplyScalar(0.11)
      const cb = starColor(layout.clouds[nodes[b].cloud]).multiplyScalar(0.11)
      const start = (Math.max(born.get(nodes[a].path), born.get(nodes[b].path)) - origin) / 1000
      let v = l * STEPS * 2
      for (let i = 1; i <= STEPS; i++) {
        for (const j of [i - 1, i]) {
          const p = points[j]
          const t = j / STEPS
          const mix = ca.clone().lerp(cb, t)
          linkAttrs.position.set([p.x, p.y, p.z], v * 3)
          linkAttrs.aColor.set([mix.r, mix.g, mix.b], v * 3)
          linkAttrs.aT[v] = t
          linkAttrs.aStart[v] = start + 0.25 + t * 0.4
          v++
        }
      }
    })
    const linkGeometry = new THREE.BufferGeometry()
    for (const [name, array] of Object.entries(linkAttrs)) linkGeometry.setAttribute(name, new THREE.BufferAttribute(array, array.length === count ? 1 : 3))
    const linkMaterial = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uMove: { value: calm ? 0 : 1 } },
      vertexShader: `attribute vec3 aColor; attribute float aT; attribute float aStart; attribute float aGlow; attribute float aFlow; attribute vec3 aHot;
        uniform float uTime; varying vec3 vC; varying vec3 vH; varying float vT; varying float vG; varying float vF; varying float vIn;
        void main() { vC = aColor; vH = aHot; vT = aT; vG = aGlow; vF = aFlow; vIn = smoothstep(aStart, aStart + 0.4, uTime);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform float uTime; uniform float uMove; varying vec3 vC; varying vec3 vH; varying float vT; varying float vG; varying float vF; varying float vIn;
        void main() { float along = vF < 0.0 ? 1.0 - vT : vT;
          float wave = pow(0.5 + 0.5 * sin((along * 3.0 - uTime * 1.6 * uMove) * 6.2832), 6.0);
          gl_FragColor = vec4((vC + vH * vG * (0.35 + 1.4 * wave)) * vIn, 1.0); }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const links = new THREE.LineSegments(linkGeometry, linkMaterial)
    links.frustumCulled = false

    const stars = dotSet(nodes.length)
    nodes.forEach((n, i) => stars.attrs.position.set([n.x, n.y, n.z], i * 3))
    const colors = nodes.map(n => starColor(layout.clouds[n.cloud]))
    const sizes = nodes.map(n => 0.22 + Math.sqrt(n.degree) * 0.09 + Math.log2(1 + n.lines) * 0.018)
    const phases = nodes.map((n, i) => (i * 2.399) % (Math.PI * 2))
    const sparks = dotSet(MAX_SPARKS)
    const rings = dotSet(RINGS, true)
    const trail = dotSet(TRAILS * TAIL)
    group.add(far.points, dust.points, links, stars.points, rings.points, sparks.points, trail.points)
    sky = { stars, sparks, rings, trail, links, linkAttrs, linkGeometry, linkMaterial, linksOf, layout, curves, colors, sizes, phases, clouds, dotSets: [far, dust, stars, sparks, rings, trail], lit: new Set(), R }

    // names over the biggest clouds; a name that two folders share gets its parent too (prayer/components)
    const shortName = (dir, parts) => dir.split('/').slice(-parts).join('/') || 'repo'
    const shared = new Set(big.map(c => shortName(c.dir, 1)).filter((n, i, all) => all.indexOf(n) !== i))
    for (const c of big.filter(c => c.count > 1).sort((a, b) => b.count - a.count).slice(0, CLOUD_LABELS)) {
      const sprite = label(shortName(c.dir, shared.has(shortName(c.dir, 1)) ? 2 : 1), true)
      sprite.scale.set(R * 0.4, R * 0.1, 1)
      sprite.position.set(c.x, c.y + c.spread * 0.8 + 4, c.z)
      group.add(sprite)
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

  // how busy a star is now: 1 just touched, falling to 0 as glow.js fades it; the latest file keeps beating
  const busy = (touch, now, latest) => {
    if (!touch || now < touch.at) return 0
    const fresh = Math.max(0, 1 - (now - touch.at) / FADE_MS)
    return Math.max(fresh, latest ? 0.55 : 0)
  }

  // the nebula each frame: stars fade in and twinkle; a busy star beats and sends rings out,
  // and its links light up with light running along them; comets fly between touched files
  let scratch = null
  const paintNebula = now => {
    const { THREE } = T
    const { stars, sparks, rings, trail, linkAttrs, linkGeometry, linkMaterial, linksOf, curves, colors, sizes, phases, clouds, dotSets, lit, R } = sky
    const scale = canvas.height / (2 * Math.tan((camera.fov * Math.PI) / 360))
    for (const set of dotSets) set.points.material.uniforms.uScale.value = scale
    const time = (now - origin) / 1000
    linkMaterial.uniforms.uTime.value = time
    if (!calm) for (const c of clouds) c.sprite.material.rotation += c.spin * 16
    const touches = touchesOf(shownCwd)
    const latest = index.get(lastPath.get(shownCwd))
    const tint = (scratch ??= new THREE.Color())
    const { attrs } = stars
    const hot = new Map() // link -> { glow, flow, color }
    const beating = []
    nodes.forEach((n, i) => {
      const grow = ease((now - born.get(n.path)) / GROW_MS)
      let size = sizes[i] * grow
      let glow = (0.35 + (calm ? 0 : 0.12 * Math.sin(time * 1.3 + phases[i]))) * grow
      tint.copy(colors[i])
      let halo = colors[i]
      const touch = touches.get(n.path)
      if (touch && now >= touch.at) {
        halo = kindColor(touch.kind)
        tint.lerp(halo, glowLevel(now - touch.at))
        const level = busy(touch, now, i === latest)
        if (level > 0) {
          const beat = calm ? 0.5 : 0.5 + 0.5 * Math.sin(((now - touch.at) / 1000 / PULSE_S) * Math.PI * 2)
          size *= 1 + level * (0.5 + 0.6 * beat)
          glow = Math.max(glow, 0.5 + level * (0.6 + 0.6 * beat))
          beating.push({ i, level, at: touch.at, color: halo })
          for (const l of linksOf[i]) {
            const was = hot.get(l)
            if (!was || was.glow < level) hot.set(l, { glow: level, flow: sky.layout.links[l][0] === i ? 1 : -1, color: halo })
          }
        }
      }
      if (i === hovered) {
        glow = Math.max(glow, 1)
        size *= 1.3
        for (const l of linksOf[i]) if (!hot.has(l)) hot.set(l, { glow: 0.5, flow: sky.layout.links[l][0] === i ? 1 : -1, color: colors[i] })
      }
      attrs.aSize[i] = size
      attrs.aGlow[i] = glow
      attrs.aColor.set([tint.r, tint.g, tint.b], i * 3)
      attrs.aHalo.set([halo.r, halo.g, halo.b], i * 3)
    })
    stars.changed('aSize', 'aGlow', 'aColor', 'aHalo')

    // the links that were lit and are not now go dark; the lit ones take their glow
    const per = STEPS * 2
    const setLink = (l, glow, flow, color) => {
      for (let v = l * per; v < (l + 1) * per; v++) {
        linkAttrs.aGlow[v] = glow
        linkAttrs.aFlow[v] = flow
        linkAttrs.aHot.set([color.r, color.g, color.b], v * 3)
      }
    }
    if (lit.size || hot.size) {
      for (const l of lit) if (!hot.has(l)) setLink(l, 0, 1, tint.setRGB(0, 0, 0))
      lit.clear()
      for (const [l, h] of hot) {
        setLink(l, h.glow, h.flow, h.color)
        lit.add(l)
      }
      for (const name of ['aGlow', 'aFlow', 'aHot']) linkGeometry.attributes[name].needsUpdate = true
    }

    // sparks: little lights running along each lit link, away from the busy star
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
          s.aSize[slot] = 0.35 * h.glow * Math.sin(Math.PI * along) + 0.05
          s.aGlow[slot] = h.glow
          s.aColor.set([h.color.r, h.color.g, h.color.b], slot * 3)
          s.aHalo.set([h.color.r, h.color.g, h.color.b], slot * 3)
        }
      }
    }
    sparks.changed('position', 'aSize', 'aGlow', 'aColor', 'aHalo')

    // rings: each beat of a busy star sends a ring out that widens and fades
    const r = rings.attrs
    r.aSize.fill(0)
    beating.sort((a, b) => b.level - a.level)
    beating.slice(0, RINGS).forEach((b, k) => {
      const n = nodes[b.i]
      const phase = calm ? 0.5 : (((now - b.at) / 1000) % PULSE_S) / PULSE_S
      r.position.set([n.x, n.y, n.z], k * 3)
      r.aSize[k] = sizes[b.i] * (1.2 + phase * 4)
      r.aGlow[k] = b.level * (1 - phase) * 1.2
      r.aHalo.set([b.color.r, b.color.g, b.color.b], k * 3)
    })
    rings.changed('position', 'aSize', 'aGlow', 'aHalo')

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
        t.aSize[at] = R * 0.012 * (1 - k / (TAIL + 2)) * fade + 0.1
        t.aGlow[at] = (1 - k / TAIL) * 0.9 * fade
        const mix = tint.set('#ffffff').lerp(kindColor(tr.kind), 0.4 + (0.6 * k) / TAIL)
        t.aColor.set([mix.r, mix.g, mix.b], at * 3)
        t.aHalo.set([mix.r, mix.g, mix.b], at * 3)
      }
    })
    trail.changed('position', 'aSize', 'aGlow', 'aColor', 'aHalo')
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
    const linked = sky && file.degree !== undefined ? ` · ${file.degree} link${file.degree === 1 ? '' : 's'}` : ''
    tip.textContent = file.folded ? `${file.path} (${file.folded} files)` : `${file.path} · ${file.lines} lines${linked}`
    tip.style.left = `${event.clientX - rect.left + 12}px`
    tip.style.top = `${event.clientY - rect.top + 12}px`
  }

  // nebula: the star nearest the pointer, within a few pixels
  const starAt = event => {
    const rect = canvas.getBoundingClientRect()
    const at = new T.THREE.Vector3()
    let best = -1
    let near = 14 * 14
    nodes.forEach((n, i) => {
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
    const rect = canvas.getBoundingClientRect()
    if (sky) {
      hovered = starAt(event)
      canvas.style.cursor = hovered >= 0 ? 'pointer' : ''
      return show(event, rect, nodes[hovered])
    }
    if (!mesh) return
    raycaster.setFromCamera({ x: ((event.clientX - rect.left) / rect.width) * 2 - 1, y: -((event.clientY - rect.top) / rect.height) * 2 + 1 }, camera)
    const hit = raycaster.intersectObject(mesh)[0]
    show(event, rect, hit && files[hit.instanceId])
  }

  // nebula: a click on a star (not the end of a drag) glides the camera up close to it
  const click = event => {
    if (!sky || !pressed || Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) > 4) return
    const i = starAt(event)
    if (i < 0) return
    const target = new T.THREE.Vector3(nodes[i].x, nodes[i].y, nodes[i].z)
    const away = camera.position.clone().sub(controls.target).setLength(Math.max(sky.R * 0.35, 25))
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
    if (sky) paintNebula(Date.now())
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
  // and in the nebula a file touched just now is flown to by a comet from the one before
  const feed = event => {
    const touch = touchOf(event, event.cwd)
    if (!touch) return
    const touches = touchesOf(event.cwd)
    const known = event.cwd !== shownCwd || index.has(touch.path)
    let kind = touch.kind === 'edit' && !known ? 'new' : touch.kind
    if (RANK[touches.get(touch.path)?.kind] > RANK[kind]) kind = touches.get(touch.path).kind
    let at = event.at ?? Date.now()
    const from = index.get(lastPath.get(event.cwd))
    const to = index.get(touch.path)
    if (sky && event.cwd === shownCwd && from !== undefined && to !== undefined && from !== to && Date.now() - at < 4000) {
      trails.push({ kind, at: Date.now(), path: curvePoints(nodes[from], nodes[to], 40) })
      at = Date.now() + TRAIL_MS // it lights up when the comet lands
    }
    lastPath.set(event.cwd, touch.path)
    touches.set(touch.path, { kind, at })
    if (!known && visible && event.cwd === cwd) {
      clearTimeout(refetch)
      refetch = setTimeout(load, REFETCH_MS)
    }
  }

  // 'nebula' or 'city'
  const setMode = next => {
    if (next === mode) return
    mode = next
    if (visible && lastTree) build(lastTree)
  }

  return { feed, setRepo, setMode, setVisible, resetView: fit }
}
