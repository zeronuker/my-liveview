// A draggable edge. Drag it, press the arrow keys while it has focus, or
// double-click it to put it back. Plain pointer events, no library.
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

// `fromPointer(event)` turns where the pointer is into a size, `set(size)` takes
// it, `commit()` is called when a change is over (to remember it), and `reset()`
// puts the default back. `grows` is 1 when the right or lower arrow key makes the
// size bigger and -1 when it makes it smaller (an edge on the other side).
export const makeResizer = ({ el, label, isVertical = false, size, fromPointer, min, max, step, grows = 1, set, commit, reset }) => {
  el.setAttribute('role', 'separator')
  el.setAttribute('aria-label', label)
  el.setAttribute('aria-orientation', isVertical ? 'horizontal' : 'vertical')
  el.tabIndex = 0

  const change = value => set(clamp(value, min(), max()))
  el.onpointerdown = event => {
    el.setPointerCapture(event.pointerId)
    el.classList.add('dragging')
    document.body.classList.add('resizing')
    event.preventDefault()
  }
  el.onpointermove = event => {
    if (el.hasPointerCapture(event.pointerId)) change(fromPointer(event))
  }
  const end = () => {
    if (!el.classList.contains('dragging')) return
    el.classList.remove('dragging')
    document.body.classList.remove('resizing')
    commit()
  }
  el.onpointerup = end
  el.onpointercancel = end
  el.onkeydown = event => {
    const direction = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key]
    if (!direction) return
    event.preventDefault()
    change(size() + direction * grows * step)
    commit()
  }
  el.ondblclick = () => {
    reset()
    commit()
  }
}
