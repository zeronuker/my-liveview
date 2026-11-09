// Where an edit goes when there are up to four panes to watch files in. Plain data in,
// plain data out, so the rule can be tested; app.js does the drawing.
//
// `panes` is [{ key, isBusy, isVisible, usedAt }]: the file a pane shows
// (`session|path`, or null when empty), whether its reveal is still going,
// whether it is on screen, and when it was last given an edit (a counter).
// Returns { pane } with the pane to use, and `interrupt: true` when that pane
// is still writing the same file (its reveal is finished first); { pane: -1 }
// means no pane is free and the edit waits in line.
export const placeEdit = (panes, key, { allowInterrupt = true } = {}) => {
  // the same file goes to the pane already showing it, so one file never takes both
  const same = panes.findIndex(pane => pane.key === key)
  if (same !== -1) return panes[same].isBusy && !allowInterrupt ? { pane: -1 } : { pane: same, interrupt: panes[same].isBusy }

  // a pane on screen that has finished: the one used longest ago
  const free = panes
    .map((pane, index) => ({ ...pane, index }))
    .filter(pane => pane.isVisible && !pane.isBusy)
    .sort((a, b) => a.usedAt - b.usedAt)[0]
  if (free) return { pane: free.index }

  // every pane on screen is busy: open the next one, if any is left
  const hidden = panes.findIndex(pane => !pane.isVisible)
  return { pane: hidden }
}

// The first edit in the line that can go to a pane now, or -1. An edit for a
// file that is still being written waits its turn instead of cutting in.
export const nextInLine = (panes, line) =>
  line.findIndex(key => placeEdit(panes, key, { allowInterrupt: false }).pane !== -1)
