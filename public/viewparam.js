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
// pins none (no view, or one we do not have), and then the saved choices apply
export const parseView = search => {
  const view = new URLSearchParams(search).get('view')
  return Object.hasOwn(CHOICES, view) ? { name: VIEW_NAMES[view], ...CHOICES[view] } : null
}
