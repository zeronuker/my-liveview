// How the Office plan (studio.js) fits on the canvas: its size on the screen, zooming
// and panning. Plain data in, plain data out, so it can be tested.

// Zooming in on a point (a place in the canvas, in CSS pixels) by a factor,
// from a view { tile, left, top }. The plan cannot get smaller than the fitted
// one `fitted`, nor bigger than six times it, and the point under the pointer
// stays where it is.
export const zoomAt = (view, fitted, point, factor) => {
  const tile = Math.min(fitted.tile * 6, Math.max(fitted.tile, view.tile * factor))
  const k = tile / view.tile
  return { tile, left: point.x - (point.x - view.left) * k, top: point.y - (point.y - view.top) * k }
}

// A view moved so that at least `margin` pixels of the plan stay in the canvas.
export const keepInView = (view, layout, width, height, margin = 40) => ({
  tile: view.tile,
  left: Math.min(width - margin, Math.max(margin - layout.width * view.tile, view.left)),
  top: Math.min(height - margin, Math.max(margin - layout.height * view.tile, view.top)),
})

// How big a tile is, and where the plan starts, to fit the plan in a canvas
// of this size (in CSS pixels) with a little room round the edge.
export const fit = (canvasWidth, canvasHeight, layout, margin = 8) => {
  const tile = Math.max(1, Math.min((canvasWidth - 2 * margin) / layout.width, (canvasHeight - 2 * margin) / layout.height))
  return { tile, left: (canvasWidth - tile * layout.width) / 2, top: (canvasHeight - tile * layout.height) / 2 }
}
