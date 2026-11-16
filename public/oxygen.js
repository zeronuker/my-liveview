// The OxygenOS-style feel layer's script (styles are in oxygen.css): the gliding pill under segmented controls, tap ripples,
// the alert pill, flags for new list items, the glow on changed counts, and the pop on the status chip.
// Nothing here changes what the app does; it only watches the page. Every piece does nothing when the system asks for less motion.

const reduce = matchMedia('(prefers-reduced-motion: reduce)')
const motionOn = () => !reduce.matches
const $ = id => document.getElementById(id)

// 1. one pill glides under whichever button of a segmented control is pressed (the Settings window keeps its square buttons)
function glide(seg) {
  const pill = document.createElement('i')
  pill.className = 'oxy-pill'
  seg.prepend(pill)
  let armed = false
  const place = () => {
    const pressed = seg.querySelector('button[aria-pressed="true"]')
    if (!pressed || !pressed.offsetWidth) { pill.style.opacity = '0'; return }
    pill.style.opacity = '1'
    pill.style.width = `${pressed.offsetWidth}px`
    pill.style.transform = `translateX(${pressed.offsetLeft}px)`
    if (!armed) { armed = true; requestAnimationFrame(() => requestAnimationFrame(() => pill.classList.add('go'))) } // the first placement is instant
  }
  new MutationObserver(place).observe(seg, { attributes: true, subtree: true, attributeFilter: ['aria-pressed'] })
  new ResizeObserver(place).observe(seg)
  place()
}
document.querySelectorAll('.seg').forEach(seg => { if (!seg.closest('#settings')) glide(seg) })

// 12. a soft ripple from the tap point
const RIPPLE = '.btn, .icon-btn, .round-btn, .seg button, .nlabel, .menu a, #feed-list li'
document.addEventListener('pointerdown', e => {
  if (e.button !== 0 || !motionOn()) return
  const el = e.target.closest(RIPPLE)
  if (!el || el.disabled) return
  const r = el.getBoundingClientRect()
  const d = Math.max(r.width, r.height) * 2.2
  const dot = document.createElement('span')
  dot.className = 'oxy-ripple'
  dot.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`
  el.append(dot)
  dot.addEventListener('animationend', () => dot.remove(), { once: true })
}, { passive: true })

// 10. the alert pill: a dot grows into a pill with a message, holds, then shrinks away
let alertEl = null
let alertTimers = []
export function showAlert(text) {
  if (!motionOn()) return
  alertTimers.forEach(clearTimeout)
  alertEl?.remove()
  alertEl = document.createElement('div')
  alertEl.className = 'oxy-alert'
  alertEl.setAttribute('role', 'status')
  alertEl.setAttribute('aria-live', 'polite')
  alertEl.append(document.createElement('i'))
  const label = document.createElement('span')
  label.textContent = text
  alertEl.append(label)
  document.body.append(alertEl)
  const el = alertEl
  alertTimers = [
    setTimeout(() => el.classList.add('open'), 30),
    setTimeout(() => el.classList.remove('open'), 3030),
    setTimeout(() => el.remove(), 3800),
  ]
}

// 3. the chats and the Activity drawer: their rows follow one after another each time they open
let navTimer = 0
new MutationObserver(() => {
  const open = document.body.classList.contains('nav-open')
  if (open && !wasNavOpen) { document.body.classList.add('oxy-nav-in'); clearTimeout(navTimer); navTimer = setTimeout(() => document.body.classList.remove('oxy-nav-in'), 1100) }
  wasNavOpen = open
}).observe(document.body, { attributes: true, attributeFilter: ['class'] })
let wasNavOpen = document.body.classList.contains('nav-open')

// 8. a new event in the Activity feed drops in (the list is redrawn whole each time, so events are told apart by their words)
const feedList = $('feed-list')
const seenFeed = new Set()
let feedReady = false
if (feedList) {
  new MutationObserver(() => {
    for (const li of feedList.children) {
      const key = li.querySelector('.what')?.textContent ?? li.textContent
      if (seenFeed.has(key)) continue
      seenFeed.add(key)
      if (feedReady && motionOn()) li.classList.add('oxy-new')
    }
    feedReady = feedList.children.length > 0 || feedReady
  }).observe(feedList, { childList: true })
}

// 4. a chat's or file's +N / −N: when it changes after a redraw, the number counts to the new value and glows
const chatList = $('chat-list')
const lastCounts = new Map()
if (chatList) {
  const seenChats = new Set()
  let chatsReady = false
  new MutationObserver(() => {
    chatList.querySelectorAll('.nrow').forEach(row => {
      const name = row.querySelector('.ntext')?.textContent ?? ''
      row.querySelectorAll('.counts .pos, .counts .neg').forEach(el => {
        const key = `${name}|${el.className}`
        const now = Number(el.textContent.replace(/[^\d]/g, ''))
        const before = lastCounts.get(key)
        lastCounts.set(key, now)
        if (before === undefined || before === now || !motionOn()) return
        const sign = el.textContent.trim()[0]
        const t0 = performance.now()
        const step = t => {
          const p = Math.min(1, (t - t0) / 600)
          el.textContent = `${sign}${Math.round(before + (now - before) * (1 - Math.pow(1 - p, 4)))}`
          if (p < 1) requestAnimationFrame(step)
        }
        requestAnimationFrame(step)
        el.classList.add('oxy-bump')
      })
      // 10. a chat that was not there before
      if (row.querySelector('.ico-chat') && name && !seenChats.has(name)) {
        seenChats.add(name)
        if (chatsReady) showAlert(`New chat · ${name}`)
      }
    })
    chatsReady = chatsReady || chatList.querySelector('.ico-chat') !== null
  }).observe(chatList, { childList: true, subtree: true })
}

// 7. the status chip pops when what it says changes
const st = $('st')
if (st) {
  new MutationObserver(() => {
    const chip = $('status')
    if (!chip || !motionOn()) return
    chip.classList.remove('oxy-pop')
    void chip.offsetWidth
    chip.classList.add('oxy-pop')
  }).observe(st, { childList: true, characterData: true, subtree: true })
}

// 10. the connection coming back, and a recording that was saved
const conn = $('conn')
if (conn) {
  let was = conn.textContent
  new MutationObserver(() => {
    const now = conn.textContent
    if (was === 'reconnecting...' && now === '') showAlert('Connected again')
    was = now
  }).observe(conn, { childList: true, characterData: true, subtree: true })
}
const rec = $('b-record')
if (rec) {
  let was = rec.getAttribute('aria-pressed')
  new MutationObserver(() => {
    const now = rec.getAttribute('aria-pressed')
    if (was === 'true' && now === 'false') showAlert('Recording saved')
    was = now
  }).observe(rec, { attributes: true, attributeFilter: ['aria-pressed'] })
}
