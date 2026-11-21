// The Map: the chat's repo in 3D, lit by what Claude reads and edits. Two styles:
//   nebula  every file a star, linked to the files it imports, each folder a coloured cloud (nebula.js)
//   city    every file a building at night, imports as arcs between rooftops, lit windows for recent work (city.js)
// Both share the links that light up with running light, and the comets from one file to the next.
// glow.js says what is lit. This draws it with three.js, which is only loaded the first time the Map is shown.

import { ROAD, ageLight, buildingHeight, buildingShape, cityArc, hash, layoutCity, treeSpots } from './city.js'
import { FADE_MS, glowLevel, touchOf } from './glow.js'
import { folderTint, litOf, sizeOf, tintOf } from './measure.js'
import { blastRadius, cloudColor, curvePoints, importLinks, layoutNebula } from './nebula.js'
import { changesBetween, stateAt, timeline } from './replay.js'

const BLAST = '#8fe9ff' // the colour of a blast radius
const COLORS = {
  folded: '#4a4d55', read: '#6cb4ff', edit: '#ffb347', new: '#7bf0a0', sky: '#05060f', night: '#060b0d',
  asphalt: '#161a21', walk: '#222833', lane: '#d8c48a', lamp: '#ffcf7a', roof: '#5a6170', crane: '#f0b43c', arc: '#5fd3e6', grey: '#6d7079',
}
const RANK = { read: 1, edit: 2, new: 3 }
const LABELS = 12 // the biggest folders are named (city)
const CLOUD_LABELS = 30 // and in the nebula the biggest 30 are named in the key, each in its colour
const LEGEND = 14 // the key lists this many of them
const DUST_PER_FILE = 3 // faint specks in each cloud, so a bigger folder is a denser cloud
const REFETCH_MS = 1500 // a file that is not in the map yet: the repo is read again after this
const GROW_MS = 900 // a star fades in, or a building rises, over this long
const SPREAD_MS = 1400 // and the outermost starts this much after the middle
const TRAIL_MS = 1100 // the comet takes this long from one file to the next
const TAIL = 26 // points in a comet's tail
const TRAILS = 3 // comets drawn at once
const STEPS = 20 // segments in a link's curve
const LINK_EASE_S = 0.12 // a link takes about three times this to fade in or out
const SPARKS = 2 // lights running along each lit link
const MAX_SPARKS = 1500
const RIPPLES = 3 // rings a busy star has spreading at once (nebula)
const RINGS = 72 // pulse rings drawn at once (nebula): RIPPLES each for the busiest stars
const BREATH_S = 3.2 // a busy star in the nebula breathes, and sends out a ripple, in about this long (each star has its own pace)
const PULSE_TAIL = 10 // points in the comet a nebula link sends along itself
const PULSE_GAP_S = [1.3, 5.1] // a lit nebula link waits this long (from, to) between pulses, chosen at random
const PULSE_TRAVEL_S = [2.6, 4.2] // and a pulse takes this long to cross it
const LANDING_S = 1.4 // the star a pulse reaches flares for this long
const CRANES = 40 // cranes on buildings Claude has edited (city)
const LIGHTS = 12 // searchlights on buildings Claude is reading (city)
const PULSE_S = 1.3 // a busy file beats once in this long
const BLAST_MS = 260 // the blast radius spreads one step out in this long
const REPLAY_MS = 30000 // the time-lapse plays the whole history in this long at speed 1
const GLIDE_MS = 900
const DRONE_QUIET_MS = 10000 // the drone takes over again this long after the person last touched the view
const DRONE_SPEED = 0.12 // the nebula's radius it crosses each second
const DRONE_LIT = 0.25 // a star lit this much (0 to 1) draws the drone to it
const DRONE_REVISIT_MS = 15000 // though not one it has just been to

const depthOf = path => (path ? path.split('/').length : 0)
const slabTop = depth => 0.2 + Math.min(depth, 6) * 0.03
const ease = t => 1 - (1 - Math.min(Math.max(t, 0), 1)) ** 3
const soft = t => (t = Math.min(Math.max(t, 0), 1)) * t * (3 - 2 * t) // eased at both ends
const between = ([from, to]) => from + Math.random() * (to - from)
const scatter = n => Math.sin(n) * 43758.5453 - Math.floor(Math.sin(n) * 43758.5453) // the same 0-1 number for the same n, different for each

// puts slot `slot` of a position array a share t (0 to 1) of the way along a curve's points, between two of them, so a
// light glides along the curve and does not hop from point to point
export const putOn = (position, slot, points, t) => {
  const f = Math.min(Math.max(t, 0), 1) * (points.length - 1)
  const i = Math.min(Math.floor(f), points.length - 2)
  const u = f - i
  const a = points[i]
  const b = points[i + 1]
  position[slot * 3] = a.x + (b.x - a.x) * u
  position[slot * 3 + 1] = a.y + (b.y - a.y) * u
  position[slot * 3 + 2] = a.z + (b.z - a.z) * u
}

// canvas and tip are the Map's canvas and its pointer tip; caption is the nebula's note on what is picked (a colour dot and a line
// of text); bar is the time-lapse bar's parts: { box, open, play, time, date, speed, close }; onTree(count) is told how many
// files the repo shown has; onFolders(list) is told the nebula's folders, [{ cloud, name, color }], biggest first (none in the
// city, or while a repo loads)
export const createMap = ({ canvas, tip, caption, bar, onTree, onFolders }) => {
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
  let graph = null // the repo's Graphify graph as last read (/graph), or null: the nebula then shows the files alone
  let glide = null // the camera easing to a new place
  let drone = false // nebula: the camera roams from cloud to cloud and star to star by itself
  let tour = null // the drone's present leg: { from, bend, to, fromTarget, toTarget, at, ms, star, arrived }
  let touched = -Infinity // when the person last moved the view; the drone waits DRONE_QUIET_MS after it
  let stopBag = [] // the clouds the drone has yet to visit, in random order
  const visited = new Map() // star -> when the drone last went to it because it was lit
  let captionKey = '' // what the caption shows now, so it is written only when it changes
  let hovered = -1 // the file under the pointer
  let legendLit = -1 // the nebula folder whose name in the repo's Folders list is under the pointer
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
    // any touch of the view stops the drone where it is; it flies again once it has been left alone
    const touch = () => ((touched = performance.now()), (tour = null))
    for (const name of ['pointerdown', 'wheel']) canvas.addEventListener(name, touch, { passive: true })
    window.addEventListener('keydown', event => visible && event.key.startsWith('Arrow') && touch())
    canvas.addEventListener('pointermove', panOnBothButtons)
    window.addEventListener('keydown', panByKey)
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

  // Moving the view sideways (pan): the right button, Shift with the left, or two fingers (they pan and zoom) are the
  // controls' own. This adds both buttons together: press the right one while the left is held, and the turn becomes a pan.
  // The browser reports that as a move with both buttons down, not as a new press, so the controls are told the drag
  // began again with the right button.
  let chorded = false
  const panOnBothButtons = event => {
    if (event.pointerType !== 'mouse') return
    if ((event.buttons & 3) !== 3) {
      chorded = event.buttons !== 0 && chorded // every button up: the next drag may chord again
      return
    }
    if (chorded) return
    chorded = true
    const same = { bubbles: true, cancelable: true, pointerId: event.pointerId, pointerType: 'mouse', isPrimary: true, clientX: event.clientX, clientY: event.clientY }
    canvas.dispatchEvent(new PointerEvent('pointerup', { ...same, button: 0, buttons: 0 }))
    canvas.dispatchEvent(new PointerEvent('pointerdown', { ...same, button: 2, buttons: 3 }))
  }

  // the arrow keys move the view sideways (Shift for bigger steps), when the Map is shown and no field has the keys
  const panByKey = event => {
    const dx = { ArrowLeft: -1, ArrowRight: 1 }[event.key] ?? 0
    const dy = { ArrowDown: -1, ArrowUp: 1 }[event.key] ?? 0
    if (!visible || !(dx || dy) || event.ctrlKey || event.metaKey || event.altKey) return
    if (event.target.closest?.('input, select, textarea, [contenteditable], #settings')) return
    const { Vector3 } = T.THREE
    const step = camera.position.distanceTo(controls.target) * (event.shiftKey ? 0.18 : 0.06)
    const move = new Vector3().setFromMatrixColumn(camera.matrix, 0).multiplyScalar(dx * step)
    move.addScaledVector(new Vector3().setFromMatrixColumn(camera.matrix, 1), dy * step)
    camera.position.add(move)
    controls.target.add(move)
    glide = null
    event.preventDefault()
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

  // A star Claude has touched lately that the drone has not just been to, at random and the more lit the likelier; or null
  const litStar = () => {
    const now = performance.now()
    const lit = [...busyFiles(Date.now())].filter(([i, b]) => b.level > DRONE_LIT && now - (visited.get(i) ?? -Infinity) > DRONE_REVISIT_MS)
    let pick = Math.random() * lit.reduce((sum, [, b]) => sum + b.level, 0)
    for (const [i, b] of lit) if ((pick -= b.level) <= 0) return i
    return lit[0]?.[0] ?? null
  }

  // The drone: a curved flight through the nebula to the next stop, and on to the next at once, never pausing. A star that is lit (Claude
  // has touched it) comes first, so the drone goes where the work is. With none lit, the stops go in turns: a folder's cloud
  // (the camera ends up inside it), then one of that cloud's stars (its blast radius shown, as when it is clicked), then the
  // next cloud, each cloud once before any comes round again.
  const nextLeg = prev => {
    const { Vector3 } = T.THREE
    const lit = litStar()
    const toStar = lit === null && prev?.star === null
    if (lit === null && !toStar && !stopBag.length) stopBag = sky.stops.filter(s => s.stars.length).sort(() => Math.random() - 0.5)
    const stop = lit !== null ? sky.stops.find(s => s.cloud === items[lit].cloud) : toStar ? prev.stop : stopBag.pop()
    const star = lit !== null ? lit : toStar ? stop.stars[Math.floor(Math.random() * stop.stars.length)] : null
    if (lit !== null) visited.set(lit, performance.now())
    const spot = star === null ? stop.c : web.spots[star]
    const toTarget = new Vector3(spot.x, spot.y, spot.z)
    const from = camera.position.clone()
    const dir = toTarget.clone().sub(from)
    const dist = dir.length()
    dir.normalize()
    const stand = star === null ? stop.c.spread * 0.6 + 6 : Math.max(sky.R * 0.04, 5) // how far short of the stop it hovers
    const to = toTarget.clone().addScaledVector(dir, -stand)
    const sideways = new Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).cross(dir).setLength(dist * 0.25)
    const bend = from.clone().add(to).multiplyScalar(0.5).add(sideways) // the flight bows out to one side
    const ms = Math.min(Math.max((dist / (sky.R * DRONE_SPEED)) * 1000, 3500), 12000)
    return { stop, star, lit: lit !== null, from, bend, to, fromTarget: controls.target.clone(), toTarget, at: performance.now(), ms, arrived: false }
  }

  // While Claude is at work the drone stops touring and shows all of it: the camera eases to where every lit star fits in the
  // window, and the view keeps turning round them. Once no star has been lit for WATCH_QUIET_MS the tour carries on.
  const WATCH_QUIET_MS = 3000
  const WATCH_EASE = 1.5 // how fast the camera settles on the framing, per second
  const WATCH_MIN = 0.08 // the closest it stands, as a share of the nebula's radius, so one lit star is not filled with
  let watch = null // { points, center, lit: when a star was last lit, at: the last frame }

  // moves the camera along the drone's leg; true while it holds on the lit stars (the controls then turn it round)
  const flyDrone = now => {
    if (!drone || !sky || mode !== 'nebula' || calm || glide || now - touched < DRONE_QUIET_MS) {
      tour = null
      watch = null
      return false
    }
    const lit = [...busyFiles(Date.now())].filter(([, b]) => b.level > DRONE_LIT).map(([i]) => web.spots[i])
    if (lit.length) {
      watch ??= { at: now }
      watch.lit = now
      watch.points = lit
      const mean = axis => lit.reduce((sum, p) => sum + p[axis], 0) / lit.length
      watch.center = new T.THREE.Vector3(mean('x'), mean('y'), mean('z'))
    }
    if (watch && now - watch.lit < WATCH_QUIET_MS) {
      const { center, points } = watch
      const dir = camera.position.clone().sub(center)
      if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1)
      dir.normalize()
      const back = Math.max(fitCamera({ center, dir, points }).distanceTo(center), sky.R * WATCH_MIN)
      const k = 1 - Math.exp(-((now - watch.at) / 1000) * WATCH_EASE)
      watch.at = now
      camera.position.lerp(center.clone().addScaledVector(dir, back), k)
      controls.target.lerp(center, k)
      tour = null
      return true
    }
    watch = null
    tour ??= nextLeg(null)
    // a star chosen at random shows its blast radius as the drone flies to it; a lit one does not, since that would dim the very activity it came for
    if (!tour.arrived) {
      tour.arrived = true
      if (tour.star !== null && !tour.lit) focus = { i: tour.star, at: Date.now(), steps: blastRadius(web.links, tour.star) }
      if (tour.lit) tour.users = blastRadius(web.links, tour.star).size - 1 // for the caption
    }
    const t = (now - tour.at) / tour.ms
    if (t < 1) {
      camera.position.copy(tour.from).multiplyScalar((1 - t) ** 2).addScaledVector(tour.bend, 2 * (1 - t) * t).addScaledVector(tour.to, t * t)
      controls.target.lerpVectors(tour.fromTarget, tour.toTarget, t)
      return false
    }
    // at the stop it flies on at once, never pausing
    camera.position.copy(tour.to)
    controls.target.copy(tour.toTarget)
    if (tour.star !== null && !tour.lit) focus = null
    tour = nextLeg(tour)
    return false
  }

  // the folder pointed at in the repo's Folders list (-1: none) is lit, and the rest dimmed
  const lightFolder = cloud => (legendLit = cloud)

  const setDrone = on => {
    if (on === drone) return
    if (!on && tour?.star != null && !tour.lit) focus = null
    drone = on
    touched = -Infinity // it starts at once
    tour = null
    watch = null
  }

  // Where the camera stands to show a picture whole, looking at `center` from the direction `dir`: the nearest place where
  // `FIT_FILL` of the window's height or width holds all of `points` but the farthest `FIT_TRIM` of them (a few strays do not
  // push the view back). The view turns slowly by itself, so this holds from every side (the
  // direction turned round the middle in steps), not just the one it starts from. It is worked out when asked, so it suits the
  // window as it is now.
  const FIT_FILL = 0.9
  const FIT_TRIM = 0.1
  const FIT_SIDES = 12
  const fitCamera = ({ center, dir: start, points }) => {
    const { Vector3 } = T.THREE
    const tanV = Math.tan((camera.fov * Math.PI) / 360)
    const tanH = tanV * camera.aspect
    let back = 1
    for (let side = 0; side < FIT_SIDES; side++) {
      const turn = (side / FIT_SIDES) * Math.PI * 2
      const dir = new Vector3(start.x * Math.cos(turn) + start.z * Math.sin(turn), start.y, -start.x * Math.sin(turn) + start.z * Math.cos(turn))
      const right = new Vector3(0, 1, 0).cross(dir).normalize()
      const up = new Vector3().crossVectors(dir, right)
      // how far back along dir the camera must be for this point to fit
      const need = p => {
        const [x, y, z] = [p.x - center.x, p.y - center.y, p.z - center.z]
        const across = Math.abs(x * right.x + y * right.y + z * right.z)
        const high = Math.abs(x * up.x + y * up.y + z * up.z)
        return x * dir.x + y * dir.y + z * dir.z + Math.max(across / (FIT_FILL * tanH), high / (FIT_FILL * tanV))
      }
      const far = points.map(need).sort((a, b) => a - b)
      back = Math.max(back, far[Math.floor((1 - FIT_TRIM) * (far.length - 1))] ?? 0)
    }
    return center.clone().addScaledVector(start, back)
  }

  // back to the whole picture: at once the first time, after that the camera glides
  const fit = instant => {
    if (!group || !controls) return
    const { fitOf } = group.userData
    let center = group.userData.center
    let cam = group.userData.cam
    if (fitOf) {
      cam = fitCamera(fitOf)
      // perspective and the downward look push the picture off-centre, so slide the view until the stars' trimmed
      // outline, as seen on screen, has the same gap on every side
      const { Vector3, PerspectiveCamera } = T.THREE
      const view = new PerspectiveCamera(camera.fov, camera.aspect)
      const tan = [Math.tan((camera.fov * Math.PI) / 360) * camera.aspect, Math.tan((camera.fov * Math.PI) / 360)]
      center = center.clone()
      cam = cam.clone()
      const at = (v, f) => v[Math.floor(f * (v.length - 1))]
      for (let pass = 0; pass < 4; pass++) {
        view.position.copy(cam)
        view.lookAt(center)
        view.updateMatrixWorld()
        view.updateProjectionMatrix()
        const ndc = fitOf.points.map(p => new Vector3(p.x, p.y, p.z).project(view))
        const mid = axis => {
          const v = ndc.map(p => p[axis]).sort((a, b) => a - b)
          return (at(v, 0.01) + at(v, 0.99)) / 2
        }
        const depth = cam.distanceTo(center)
        const shift = new Vector3(1, 0, 0).transformDirection(view.matrixWorld).multiplyScalar(mid('x') * tan[0] * depth)
        shift.addScaledVector(new Vector3(0, 1, 0).transformDirection(view.matrixWorld), mid('y') * tan[1] * depth)
        center.add(shift)
        cam.add(shift)
      }
    }
    if (instant === true || calm) {
      glide = null
      controls.target.copy(center)
      camera.position.copy(cam)
      controls.update()
      return
    }
    glideTo(cam, center)
  }

  // a name as a sprite, in `color` if given; the serif ones are the Nebula's folders' names
  const label = (text, serif, color) => {
    const c = document.createElement('canvas')
    c.width = 256
    c.height = 64
    const g = c.getContext('2d')
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    if (serif) {
      g.font = 'italic 400 32px Georgia, serif'
      g.shadowColor = color
      g.shadowBlur = 12
      g.fillStyle = color
    } else {
      g.font = '600 30px ui-monospace, Consolas, monospace'
      g.shadowColor = 'rgba(0, 0, 0, 0.9)'
      g.shadowBlur = 8
      g.fillStyle = color ?? 'rgba(232, 236, 245, 0.9)'
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
    legendLit = -1
    onFolders([])
    caption.hidden = true
    captionKey = ''
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

  // soft glowing dots, drawn in the shader; `ring` draws each as a thin ring instead; `star` makes them the nebula's stars: a
  // wider, brighter core, and never smaller than a few pixels however far off (a star of size 0 is not drawn)
  const pointMaterial = (ring, star) =>
    new T.THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 } },
      vertexShader: `attribute float aSize; attribute vec3 aColor; attribute vec3 aHalo; attribute float aGlow;
        uniform float uScale; varying vec3 vC; varying vec3 vH; varying float vG;
        void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
          gl_PointSize = ${star ? 'aSize > 0.0 ? max(uScale * aSize * 6.0 / -mv.z, 4.0) : 0.0' : 'uScale * aSize * 6.0 / -mv.z'}; vC = aColor; vH = aHalo; vG = aGlow; }`,
      fragmentShader: ring
        ? `varying vec3 vC; varying vec3 vH; varying float vG;
          void main() { float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0) discard;
            float band = exp(-pow((d - 0.82) * 7.5, 2.0)); gl_FragColor = vec4(vH * band * vG, 1.0); }`
        : `varying vec3 vC; varying vec3 vH; varying float vG;
          void main() { float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0) discard;
            float core = exp(-d * d * ${star ? '14.0' : '40.0'}); float halo = (exp(-d * d * 6.0) * 0.7 + pow(1.0 - d, 3.0) * 0.3) * vG;
            gl_FragColor = vec4(vC * core * ${star ? '1.7' : '1.3'} + vH * halo, 1.0); }`,
      transparent: true,
      blending: T.THREE.AdditiveBlending,
      depthWrite: false,
    })

  // a set of dots whose size, colour and glow can change every frame
  const dotSets = []
  const dotSet = (count, ring, star) => {
    const { THREE } = T
    const attrs = { position: new Float32Array(count * 3), aSize: new Float32Array(count), aColor: new Float32Array(count * 3), aHalo: new Float32Array(count * 3), aGlow: new Float32Array(count) }
    const geometry = new THREE.BufferGeometry()
    for (const [name, array] of Object.entries(attrs)) geometry.setAttribute(name, new THREE.BufferAttribute(array, name === 'aSize' || name === 'aGlow' ? 1 : 3))
    const points = new THREE.Points(geometry, pointMaterial(ring, star))
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
    const attrs = { position: new Float32Array(count * 3), aColor: new Float32Array(count * 3), aT: new Float32Array(count), aStart: new Float32Array(count), aGlow: new Float32Array(count), aFlow: new Float32Array(count), aHot: new Float32Array(count * 3), aShow: new Float32Array(count).fill(1), aSeed: new Float32Array(count) }
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
      attrs.aSeed.fill(Math.random(), v, v + STEPS * 2) // this link's own pace and phase for the shimmer
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
      uniforms: { uTime: { value: 0 }, uMove: { value: calm ? 0 : 1 }, uDim: { value: 1 }, uShimmer: { value: mode === 'nebula' ? 1 : 0 } },
      vertexShader: `attribute vec3 aColor; attribute float aT; attribute float aStart; attribute float aGlow; attribute float aFlow; attribute vec3 aHot; attribute float aShow; attribute float aSeed;
        uniform float uTime; varying vec3 vC; varying vec3 vH; varying float vT; varying float vG; varying float vF; varying float vIn; varying float vS;
        void main() { vC = aColor; vH = aHot; vT = aT; vG = aGlow; vF = aFlow; vS = aSeed; vIn = smoothstep(aStart, aStart + 0.4, uTime) * aShow;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      // the city's links: three bright bands, all in step. The nebula's: two slow bands drifting in opposite ways, each link at
      // its own pace and phase, so the links shimmer out of step with one another.
      fragmentShader: `uniform float uTime; uniform float uMove; uniform float uDim; uniform float uShimmer; varying vec3 vC; varying vec3 vH; varying float vT; varying float vG; varying float vF; varying float vIn; varying float vS;
        void main() { float along = vF < 0.0 ? 1.0 - vT : vT;
          float pace = 0.7 + vS * 0.7;
          float s1 = 0.5 + 0.5 * sin(along * 5.5 - uTime * 0.9 * pace * uMove + vS * 6.2832);
          float s2 = 0.5 + 0.5 * sin(along * 12.0 + uTime * 0.55 * pace * uMove + fract(vS * 7.31) * 6.2832);
          float soft = pow(s1, 3.0) * 0.6 + pow(s2, 4.0) * 0.4;
          float bands = pow(0.5 + 0.5 * sin((along * 3.0 - uTime * 1.6 * uMove) * 6.2832), 6.0);
          float lift = uShimmer > 0.5 ? 0.6 + 1.8 * soft : 0.7 + 2.4 * bands;
          gl_FragColor = vec4((vC * uDim + vH * vG * lift) * vIn, 1.0); }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const lines = new THREE.LineSegments(geometry, material)
    lines.frustumCulled = false
    const sparks = dotSet(MAX_SPARKS)
    const trail = dotSet(TRAILS * TAIL)
    group.add(lines, sparks.points, trail.points)
    web = { spots, links, linksOf, curves, attrs, geometry, material, sparks, trail, arc, shown: new Map(), at: 0, pulses: new Map(), landings: new Map() } // shown: link -> { glow, flow, color } as drawn now; pulses: link -> its next pulse and the one crossing it (nebula); landings: star -> when a pulse reached it
  }

  const addNebula = (tree, fresh) => {
    const { THREE } = T
    const layout = layoutNebula(tree, undefined, graph)
    const nodes = layout.nodes
    const R = layout.radius
    group.userData.center = new THREE.Vector3()
    controls.maxDistance = R * 6
    const cloudColor = c => new THREE.Color(c.color)
    const starColor = c => new THREE.Color(c.color).lerp(new THREE.Color('#ffffff'), 0.2) // lit, but still its folder's colour
    number(nodes, fresh, n => Math.hypot(n.x, n.y, n.z) / R)

    // far stars all round, and faint dust in each cloud, more where there are more files
    const far = farStars(R * 7)
    const big = layout.clouds.filter(c => c.count)
    const perFile = Math.min(DUST_PER_FILE, 8000 / nodes.length)
    const specks = big.flatMap(c => Array(Math.round(c.count * perFile)).fill(c))
    const dust = dotSet(specks.length)
    specks.forEach((c, i) => {
      const spread = c.spread + 4
      const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * spread * 0.7 // stays inside the cloud, so the space between clouds is empty
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
      const size = (c.spread + 6) * 1.9
      for (let k = 0; k < 3; k++) {
        const opacity = (0.15 * faint) / (1 + k * 0.3)
        const material = new THREE.SpriteMaterial({ map: puffTexture(), color: base.clone().offsetHSL((k - 1) * 0.02, 0, 0), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false })
        const sprite = new THREE.Sprite(material)
        const off = (c.spread + 4) * 0.35
        sprite.position.set(c.x + (Math.random() - 0.5) * off, c.y + (Math.random() - 0.5) * off, c.z + (Math.random() - 0.5) * off)
        sprite.scale.setScalar(size * (1 - k * 0.22))
        material.rotation = Math.random() * Math.PI * 2
        clouds.push({ sprite, spin: (Math.random() - 0.5) * 0.00008, cloud: layout.clouds.indexOf(c), opacity })
        group.add(sprite)
      }
    }
    group.add(far.points, dust.points)

    const colors = nodes.map(n => starColor(layout.clouds[n.cloud]))
    const linkLight = 0.11 * Math.max(graph ? 0.7 : 0, Math.min(1, Math.sqrt(150 / Math.max(layout.links.length, 1)))) // fainter when there are many, so a big repo does not wash out
    addWeb(nodes, layout.links, i => colors[i], curvePoints, linkLight)

    const stars = dotSet(nodes.length, false, true)
    nodes.forEach((n, i) => stars.attrs.position.set([n.x, n.y, n.z], i * 3))
    // a file with many links is clearly bigger than one with none; a longer file a little bigger
    const sizes = nodes.map(n => (0.4 + Math.sqrt(n.degree) * 0.2 + Math.log2(1 + n.lines) * 0.03) * (n.symbol ? 0.6 : 1)) // a function is smaller than a file
    const phases = nodes.map((n, i) => (i * 2.399) % (Math.PI * 2))
    const tempos = nodes.map((n, i) => BREATH_S * (0.75 + 0.56 * scatter(i * 5.31 + 1))) // seconds per breath: 2.4 to 4.2, a star's own
    const rings = dotSet(RINGS, true)
    group.add(stars.points, rings.points)
    // stops: the clouds the drone visits, each with its stars' numbers
    const stops = big.map(c => ({ c, cloud: layout.clouds.indexOf(c), stars: nodes.flatMap((n, i) => (layout.clouds[n.cloud] === c ? [i] : [])) }))
    sky = { stars, rings, colors, sizes, phases, tempos, clouds, R, stops }

    // the folders' names, for the caption and the key
    const name = graph ? dir => dir : folderNames(big.map(c => c.dir)) // a community's name is not a path
    sky.folders = new Map(big.map(c => [layout.clouds.indexOf(c), { name: name(c.dir), color: c.color, count: c.count }]))
    const named = big.filter(c => c.count > 1).sort((a, b) => b.count - a.count).slice(0, CLOUD_LABELS)
    // the Fit view (fitCamera): from slightly above and in front, holding all the stars
    group.userData.fitOf = { center: group.userData.center, dir: new THREE.Vector3(0, 0.55, 2.6).normalize(), points: nodes }

    // the key, in the repo's place in the left panel: each folder's number (for lightFolder), colour and name
    onFolders(named.slice(0, LEGEND).map(c => ({ cloud: layout.clouds.indexOf(c), name: name(c.dir), color: c.color })))
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
      // what is the same over a whole building (its colour, size, lit share, seed, which wall) is passed flat, not interpolated:
      // the random pick of lit windows below magnifies the tiny rounding of an interpolated value into a different pick on
      // every pixel, which showed as the windows flickering whenever the camera moved
      vertexShader: `attribute vec3 aColor; attribute float aLit; attribute float aSeed; attribute vec3 aHeat; attribute float aDim;
        varying vec3 vN; flat varying vec3 vL; varying vec3 vM; flat varying vec3 vSize; flat varying vec3 vC; flat varying float vLit; flat varying float vSeed; flat varying vec3 vHeat; flat varying float vDim;
        void main() {
          vL = normal; vDim = aDim;
          vSize = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
          vM = (position + 0.5) * vSize; vN = normalize(mat3(instanceMatrix) * normal);
          vC = aColor; vLit = aLit; vSeed = aSeed; vHeat = aHeat;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
      fragmentShader: `varying vec3 vN; flat varying vec3 vL; varying vec3 vM; flat varying vec3 vSize; flat varying vec3 vC; flat varying float vLit; flat varying float vSeed; flat varying vec3 vHeat; flat varying float vDim;
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

    // the buildings: one per file, turned as the layout says. Each neighbourhood (its folder, two levels deep: src/components)
    // has its own colour and each building its own shade of it, a third in a material of their own (measure.js);
    // weathered grey the longer it has been left alone. Each is one of many shapes, from houses to towers (city.js).
    const tops = []
    const hood = f => f.path.split('/').slice(0, -1).slice(0, 2).join('/')
    const hoods = [...new Set(files.map(hood))].sort()
    const now = Date.now()
    const colors = []
    const pieces = [] // { file, x, z, w, d, y0, y1, angle, top }, x, z the piece's middle, heights from the ground
    const capList = [] // the roofs on them: { file, kind, x, z, w, d, y0, y1, angle }, the same way
    const bottom = slabTop(1)
    const lots = files.map((f, i) => {
      const shape = buildingShape(f.w, f.d, tall(f), hash(f.path))
      for (const p of shape.pieces) pieces.push({ ...turn(f.x, f.z, p.x, p.z, f.angle), w: p.w, d: p.d, y0: bottom + p.y0, y1: bottom + p.y1, angle: f.angle, file: i, top: p.top })
      for (const c of shape.caps) {
        // a pitched roof's ridge runs along the longer side; a slanted one faces any of four ways
        const along = c.kind === 'gable' && c.w > c.d
        const spin = c.kind === 'slant' ? Math.floor(hash(`${f.path}#spin`) * 4) * (Math.PI / 2) : along ? Math.PI / 2 : 0
        capList.push({ ...turn(f.x, f.z, c.x, c.z, f.angle), kind: c.kind, w: along ? c.d : c.w, d: along ? c.w : c.d, y0: bottom + c.y0, y1: bottom + c.y1, angle: f.angle + spin, file: i })
      }
      const roof = shape.pieces.filter(p => p.top).reduce((a, b) => (b.y1 > a.y1 ? b : a))
      tops.push({ ...turn(f.x, f.z, roof.x, roof.z, f.angle), y: bottom + shape.rise })
      return { w: f.w, d: f.d, bottom, height: buildingHeight(tall(f)), capped: shape.caps.length > 0 }
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
          : (() => {
              const t = folderTint(f.path, hoods.indexOf(hood(f)))
              return new THREE.Color().setHSL(t.h, t.s, t.l).lerp(new THREE.Color(COLORS.grey), ageLight(file.changed, now).grey)
            })()
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

    // small boxes on the flat roofs of the bigger buildings (not under a pitched or pointed roof)
    const roofSpots = pieces.filter(p => p.top && p.w > 1.3 && p.d > 1.3 && !lots[p.file].capped)
    const roofList = roofSpots.flatMap((p, k) =>
      [0, 1].map(j => {
        const r = hash(`${k}:${j}`)
        const s = 0.22 + r * 0.22
        return { ...turn(p.x, p.z, (r - 0.5) * (p.w - s - 0.4), (hash(`${j}:${k}`) - 0.5) * (p.d - s - 0.4), p.angle), s, y0: p.y1, y1: p.y1 + (j ? 0.12 : 0.25 + r * 0.2), angle: p.angle, file: p.file }
      }),
    )
    const roofs = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial({ color: COLORS.roof }), roofList.length)

    // the pitched, slanted and pointed roofs on the buildings, each in its building's colour a little darker and greyer; unit
    // shapes (a footprint of 1 by 1, from -0.5 to 0.5 high) that put() stretches to fit
    const solid = triangles => {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(triangles.flat(2), 3))
      return g
    }
    const [A, B, C, D] = [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5]]
    const [R1, R2, E, F] = [[0, 0.5, -0.5], [0, 0.5, 0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5]]
    const capShapes = {
      gable: solid([[A, D, R2], [A, R2, R1], [C, B, R1], [C, R1, R2], [A, R1, B], [D, C, R2]]), // the ridge runs along z
      slant: solid([[A, D, F], [A, F, E], [B, E, F], [B, F, C], [A, E, B], [D, C, F]]), // rises toward +x
      pyramid: new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1, true).rotateY(Math.PI / 4), // open at the bottom: a base would lie flat on the roof below and shimmer
    }
    const capMaterial = new THREE.MeshLambertMaterial({ flatShading: true, side: THREE.DoubleSide })
    const roofGrey = new THREE.Color(COLORS.roof)
    const capMeshes = Object.entries(capShapes).flatMap(([kind, geometry]) => {
      const list = capList.filter(c => c.kind === kind)
      if (!list.length) return []
      const m = new THREE.InstancedMesh(geometry, capMaterial, list.length)
      m.frustumCulled = false // the instances move as the city rises
      list.forEach((c, k) => m.setColorAt(k, colors[c.file].clone().lerp(roofGrey, 0.3).multiplyScalar(0.85)))
      return [{ mesh: m, list }]
    })

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
      for (const { mesh: capMesh, list } of capMeshes) {
        list.forEach((c, k) => {
          const f = scale[c.file]
          put(capMesh, k, c.x, c.z, f > 0 ? c.w : 1e-3, f > 0 ? c.d : 1e-3, bottom + (c.y0 - bottom) * f, bottom + (c.y1 - bottom) * f, c.angle)
        })
        capMesh.instanceMatrix.needsUpdate = true
      }
      files.forEach((f, i) => put(pads, i, f.x, f.z, scale[i] > 0 ? f.r + 0.3 : 1e-3, scale[i] > 0 ? f.r + 0.3 : 1e-3, 0, slabTop(1)))
      for (const m of [mesh, roofs, pads]) m.instanceMatrix.needsUpdate = true
      mesh.computeBoundingSphere()
      return rising
    }
    shape(now)

    const far = farStars(size * 4, true)
    far.points.position.copy(mid)
    group.add(ground, ...parks, roads, pads, lanes, lamps.points, crowns, mesh, roofs, ...capMeshes.map(c => c.mesh), far.points)
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
      const sample = files.find(f => f.district === di)
      const sprite = label(name(d.path), false, cloudColor(hoods.indexOf(hood(sample))))
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

  // The nebula's pulses. On each lit link a comet leaves the busy star at a random time, crosses slowly and dissolves; now and
  // then a fainter one follows close behind. The link then waits a random while, so no two links pulse in step. Where a comet
  // lands, the star flares (paintNebula). Two small lights also twinkle at fixed places on each lit link. Returns the slots used.
  const nebulaPulses = (time, s) => {
    const { shown, pulses, landings, curves, links } = web
    let slot = 0
    const put = (l, link, along, fade) => {
      if (slot >= MAX_SPARKS || fade <= 0.01) return
      putOn(s.position, slot, curves[l], link.flow < 0 ? 1 - along : along)
      s.aSize[slot] = (0.08 + 0.5 * fade) * Math.min(1, link.glow * 4)
      s.aGlow[slot] = link.glow * fade * 1.6
      s.aColor.set([link.color.r * fade, link.color.g * fade, link.color.b * fade], slot * 3)
      s.aHalo.set([link.color.r * fade, link.color.g * fade, link.color.b * fade], slot * 3)
      slot++
    }
    const comet = (l, link, p, strength) => {
      if (p <= 0 || p >= 1) return
      const envelope = Math.sin(Math.PI * p) ** 0.7 * strength
      for (let i = 0; i < PULSE_TAIL; i++) put(l, link, Math.max(0, soft(p) - i * 0.018), (1 - i / PULSE_TAIL) ** 1.8 * envelope)
    }
    for (const [l, link] of shown) {
      let state = pulses.get(l)
      if (!state) pulses.set(l, (state = { next: time + Math.random() * PULSE_GAP_S[1], now: null }))
      if (!state.now && time >= state.next && link.glow > 0.2) state.now = { at: time, travel: between(PULSE_TRAVEL_S), echo: Math.random() < 0.3, landed: false }
      const pulse = state.now
      if (pulse) {
        const p = (time - pulse.at) / pulse.travel
        comet(l, link, p, 1)
        if (pulse.echo) comet(l, link, p - 0.45 / pulse.travel, 0.4)
        if (!pulse.landed && p >= 0.97) {
          pulse.landed = true
          landings.set(link.flow > 0 ? links[l][1] : links[l][0], time)
        }
        if (p > 1.15 + (pulse.echo ? 0.2 : 0)) {
          state.now = null
          state.next = time + between(PULSE_GAP_S)
        }
      }
      for (let n = 0; n < 2; n++) {
        const every = 2 + scatter(l * 1.7 + n * 9.1) * 3
        const phase = ((time + scatter(l * 3.3 + n * 5.7) * every) % every) / every
        put(l, link, 0.15 + 0.7 * scatter(l * 2.31 + n * 7.7), Math.sin(Math.PI * phase) ** 3 * 0.6)
      }
    }
    for (const l of pulses.keys()) if (!shown.has(l)) pulses.delete(l)
    for (const [i, at] of landings) if (time - at > LANDING_S) landings.delete(i)
    return slot
  }

  const paintWeb = (now, busy, colorOf) => {
    const { THREE } = T
    const { attrs, geometry, material, linksOf, links, curves, sparks, trail, shown } = web
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

    // A link eases toward the glow it should have, so it fades in and out instead of switching; one that is no longer hot
    // keeps fading, in the colour it had, until it is dark.
    const per = STEPS * 2
    const setLink = (l, glow, flow, color) => {
      for (let v = l * per; v < (l + 1) * per; v++) {
        attrs.aGlow[v] = glow
        attrs.aFlow[v] = flow
        attrs.aHot.set([color.r, color.g, color.b], v * 3)
      }
    }
    const k = 1 - Math.exp(-Math.min((now - (web.at || now)) / 1000, 0.1) / LINK_EASE_S) // the share of the way to go this frame
    web.at = now
    for (const [l, h] of hot) {
      let link = shown.get(l)
      if (!link) shown.set(l, (link = { glow: 0, flow: h.flow, color: h.color.clone() }))
      link.flow = h.flow
      link.glow += (h.glow - link.glow) * k
      link.color.lerp(h.color, k)
    }
    let dark = false
    for (const [l, link] of shown) {
      if (hot.has(l)) continue
      link.glow -= link.glow * k
      if (link.glow < 0.01) {
        shown.delete(l)
        setLink(l, 0, 1, tint.setRGB(0, 0, 0))
        dark = true
      }
    }
    if (shown.size || dark) {
      for (const [l, link] of shown) setLink(l, link.glow, link.flow, link.color)
      for (const name of ['aGlow', 'aFlow', 'aHot']) geometry.attributes[name].needsUpdate = true
    }

    // sparks: little lights running along each lit link, away from the busy file (the nebula sends pulses instead)
    const s = sparks.attrs
    s.aSize.fill(0)
    let slot = 0
    if (!calm && sky) slot = nebulaPulses(time, s)
    else if (!calm) {
      for (const [l, link] of shown) {
        for (let n = 0; n < SPARKS && slot < MAX_SPARKS; n++, slot++) {
          let along = (time * 0.45 + n / SPARKS + l * 0.137) % 1
          if (link.flow < 0) along = 1 - along
          putOn(s.position, slot, curves[l], along)
          s.aSize[slot] = (0.6 * link.glow * Math.sin(Math.PI * along) + 0.08) * Math.min(1, link.glow * 4)
          s.aGlow[slot] = link.glow
          s.aColor.set([link.color.r, link.color.g, link.color.b], slot * 3)
          s.aHalo.set([link.color.r, link.color.g, link.color.b], slot * 3)
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
        putOn(t.position, at, tr.path, ease(along))
        t.aSize[at] = 0.55 * (1 - k / (TAIL + 2)) * fade + 0.1
        t.aGlow[at] = (1 - k / TAIL) * 0.9 * fade
        const mix = tint.set('#ffffff').lerp(kindColor(tr.kind), 0.4 + (0.6 * k) / TAIL)
        t.aColor.set([mix.r, mix.g, mix.b], at * 3)
        t.aHalo.set([mix.r, mix.g, mix.b], at * 3)
      }
    })
    trail.changed('position', 'aSize', 'aGlow', 'aColor', 'aHalo')
  }

  // The caption, one line at the top: the file picked (clicked, or where the drone is flying to), else the folder the drone is in or
  // the key points at.
  const showCaption = () => {
    let note = null
    const picked = focus ? { i: focus.i, users: focus.steps.size - 1 } : tour?.arrived && tour.lit ? { i: tour.star, users: tour.users } : null
    if (picked) {
      const n = items[picked.i]
      const folder = sky.folders.get(n.cloud)
      const { users } = picked
      const detail = n.folded ? `${n.folded} files` : `${n.lines} lines · ${users} depend${users === 1 ? 's' : ''} on it`
      note = { color: folder.color, text: n.symbol ? `${folder.name} › ${n.label} · in ${n.file} · ${users} depend${users === 1 ? 's' : ''} on it` : `${folder.name} › ${n.path.split('/').pop()} · ${detail}` }
    } else {
      const folder = sky.folders.get(tour?.arrived && tour.star === null ? tour.stop.cloud : legendLit)
      if (folder) note = { color: folder.color, text: `${folder.name} · ${folder.count} file${folder.count === 1 ? '' : 's'}` }
    }
    const key = note ? `${note.color} ${note.text}` : ''
    if (key === captionKey) return
    captionKey = key
    if (note) {
      const [dot, text] = caption.children
      dot.style.background = note.color
      text.textContent = note.text
    }
    caption.hidden = !note // the last words stay while it fades out
  }

  // the nebula each frame: stars fade in and twinkle; a busy star beats and sends rings out
  const paintNebula = (now, busy) => {
    const { stars, rings, colors, sizes, phases, tempos, clouds } = sky
    const time = (now - origin) / 1000
    // one folder lit and the rest dimmed: the one named in the key, else the one the pointer is on (not while a blast radius shows)
    const lit = focus ? -1 : legendLit >= 0 ? legendLit : hovered >= 0 ? items[hovered].cloud : -1
    const dim = legendLit >= 0 ? 0.3 : 0.6
    for (const c of clouds) {
      if (!calm) c.sprite.material.rotation += c.spin * 16
      c.sprite.material.opacity = lit < 0 ? c.opacity : c.cloud === lit ? c.opacity * 2 : c.opacity * dim
    }
    showCaption()
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
      const touch = touches.get(n.file ?? n.path) // a function lights with its file
      if (touch && now >= touch.at) {
        halo = kindColor(touch.kind)
        tint.lerp(halo, glowLevel(now - touch.at))
      }
      const b = busy.get(i) ?? (n.symbol ? busy.get(index.get(n.file)) : undefined) // a function breathes with its file
      if (b?.level > 0) {
        // a busy star breathes slowly, each out of step with the others, with a faint flicker in its core
        const breath = calm ? 0.5 : 0.5 + 0.5 * Math.sin((time / tempos[i]) * Math.PI * 2 - 1.2 + phases[i])
        const flicker = calm ? 1 : 1 + 0.06 * Math.sin(time * 7.3 + phases[i]) * Math.sin(time * 4.1 + phases[i] * 2)
        size *= (1 + b.level * (1 + 0.5 * breath)) * flicker
        glow = Math.max(glow, 0.7 + b.level * (0.7 + 0.8 * breath)) * flicker
      }
      const landed = web.landings.get(i) // a pulse has just arrived: it flares and settles
      if (landed !== undefined) {
        const left = 1 - (time - landed) / LANDING_S
        glow = Math.max(glow, 0.9 * left)
        size *= 1 + 0.35 * left * left
      }
      if (i === hovered) {
        glow = Math.max(glow, 1)
        size *= 1.3
      }
      if (lit >= 0) {
        if (n.cloud === lit) {
          glow = Math.max(glow, 0.8)
          size *= 1.2
        } else {
          glow *= dim
          tint.multiplyScalar(dim + 0.2)
        }
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

    // rings: a busy star has RIPPLES of them spreading at once, about a third of a breath apart (a little unevenly, each star in
    // its own way) and each as strong as it happens to be. Each fades in, slows as it spreads and dissolves, so there is never
    // a ring that starts with a pop.
    const r = rings.attrs
    r.aSize.fill(0)
    ;[...busy].filter(([, b]) => b.level > 0).sort((a, b) => b[1].level - a[1].level).slice(0, RINGS / RIPPLES).forEach(([i, b], k) => {
      const n = items[i]
      for (let ripple = 0; ripple < RIPPLES; ripple++) {
        const slot = k * RIPPLES + ripple
        const turns = 1 + time / tempos[i] + phases[i] / (Math.PI * 2) + ripple / RIPPLES + (scatter(i * 7.7 + ripple * 3.1) - 0.5) * 0.18
        const phase = calm ? 0.5 : turns % 1
        const strength = 0.7 + 0.6 * scatter(Math.floor(turns) * 12.9 + i * 4.1 + ripple * 7.3) // new each time a ripple leaves
        r.position.set([n.x, n.y, n.z], slot * 3)
        r.aSize[slot] = sizes[i] * (1.5 + (1 - (1 - phase) ** 2.4) * 5.5)
        r.aGlow[slot] = b.level * soft(phase / 0.14) * (1 - phase) ** 1.6 * 0.6 * strength
        r.aHalo.set([b.color.r, b.color.g, b.color.b], slot * 3)
      }
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
    const [res, graphRes] = await Promise.all([fetch(`/tree?cwd=${encodeURIComponent(cwd)}`).catch(() => null), fetch(`/graph?cwd=${encodeURIComponent(cwd)}`).catch(() => null)])
    if (!res?.ok || gen !== loadGen) return
    const tree = await res.json()
    const read = graphRes?.ok ? await graphRes.json().catch(() => null) : null
    if (gen !== loadGen) return
    graph = read
    build(tree)
    onTree?.(tree.length)
  }

  const show = (event, rect, file) => {
    tip.hidden = !file
    if (!file) return
    const users = web ? blastRadius(web.links, index.get(file.path)).size - 1 : 0
    const linked = ` · ${users} depend${users === 1 ? 's' : ''} on it`
    tip.textContent = file.symbol ? `${file.label} · ${file.file}${linked}` : file.folded ? `${file.path} (${file.folded} files)` : `${file.path} · ${file.lines} lines${linked}`
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
    const hovering = flyDrone(performance.now())
    if (sky) {
      controls.autoRotate = !calm && (!drone || hovering) // the drone turns the view only while it hovers
      controls.autoRotateSpeed = drone ? 1 : 0.3
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

  return { feed, setRepo, setMode, setDrone, lightFolder, setMapping, setVisible, resetView: fit }
}
