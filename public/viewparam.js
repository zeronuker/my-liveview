// Which view a window is pinned to by its address: /?view=code, /?view=office, /?view=angled or /?view=map. A pinned window shows
// that view and does not save the choice, so other windows, and the next plain visit, keep theirs. Plain data in, plain data out,
// so it can be tested.

export const VIEW_NAMES = { code: 'Code', office: 'Office', angled: 'Office, angled', map: 'Map' }

const CHOICES = {
  code: { office: false, map: false, angled: false },
  office: { office: true, map: false, angled: false },
  angled: { office: true, map: false, angled: true },
  map: { office: true, map: true, angled: false },
}

// the view the address (its query string, `location.search`) pins the window to, as { name, office, map, angled }; null if it
// pins none (no view, or one we do not have), and then the saved choices apply. For the angled view `turn` (0 to 3, quarter turns)
// pins the side it is seen from too, as `rotation`; without it the saved turn applies.
export const parseView = search => {
  const query = new URLSearchParams(search)
  const view = query.get('view')
  if (!Object.hasOwn(CHOICES, view)) return null
  const turn = view === 'angled' && /^[0-3]$/.test(query.get('turn') ?? '') ? Number(query.get('turn')) : null
  return {
    name: turn ? `${VIEW_NAMES[view]}, turned ${turn * 90}\u00b0` : VIEW_NAMES[view],
    ...CHOICES[view],
    ...(turn === null ? {} : { rotation: turn }),
  }
}
