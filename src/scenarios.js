// The mock sessions (see mock.js for the steps). Each has what it shows (`about`)
// and how it ends: 'stop' (Claude finishes its turn) or 'quiet' (an interrupted
// turn: no Stop comes, and the Office has to notice). When an animation is
// added to the Office, add the scenario that shows it here: mock.test.js fails
// if an event, a tool or a step of the stage appears in none of them.
const files = (names, lines = 14) => names.map(name => ['write', name, lines])

// A dozen chats working at once, with helpers, searches, tests that fail and an
// API error: random, but the same every time (a fixed seed), for showing the
// Office and for recording it.
const busyOffice = () => {
  let seed = 7
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const pick = list => list[Math.floor(random() * list.length)]
  const chats = Array.from({ length: 12 }, (_, i) => `c${i + 1}`)
  const steps = []
  for (const chat of chats) steps.push(['chat', chat], ['prompt', `Job ${chat}`])
  for (let round = 0; round < 5; round++) {
    for (const [i, chat] of chats.entries()) {
      steps.push(['chat', chat])
      if (round === 1 && i % 2 === 0) steps.push(['agentStart', `${chat}-helper`, 'Explore'])
      if (round === 3 && i % 2 === 0) steps.push(['agentStop', `${chat}-helper`, 'Explore'])
      const action = Math.floor(random() * 5)
      if (action === 0) steps.push(['read', pick(['cart.js', 'receipt.js', 'sample.js'])])
      else if (action === 1) steps.push(['write', `${chat}-${round}.js`, 8 + Math.floor(random() * 20)])
      else if (action === 2) steps.push(['edit', `${chat}-edit${round}.js`])
      else if (action === 3) steps.push(['bash', random() < 0.3 ? 'fail' : 'ok', 'npm test'])
      else steps.push(pick([['grep', 'price'], ['web', 'search'], ['mcp', 'ok', 'github'], ['lsp']]))
    }
    steps.push(['wait', 300])
  }
  for (const [i, chat] of chats.entries()) steps.push(['chat', chat], i % 6 === 5 ? ['fail', 'overloaded'] : ['stop'])
  return steps
}

export const SCENARIOS = {
  full: {
    about: 'a whole session: prompt, search, reads, a helper, a permission, a failing then passing test, nine new files, a failed edit',
    ends: 'stop',
    steps: [
      ['prompt', 'Add the discount feature and test it'],
      ['grep', 'discount'],
      ['read', 'cart.js'],
      ['read', 'receipt.js'],
      ['agentStart', 'helper', 'Explore'],
      ['wait', 1500],
      ['agentStop', 'helper', 'Explore'],
      ['ask', 2500],
      ['bash', 'fail', 'npm test'],
      ...files(['discount.js', 'coupon.js', 'tax.js', 'totals.js', 'rounding.js', 'labels.js', 'format.js', 'limits.js', 'index.js']),
      ['editFails', 'tax.js'],
      ['bash', 'ok', 'npm test'],
      ['wait', 500],
      ['stop'],
    ],
  },
  'reading-only': {
    about: 'files are read and searched, nothing is changed: nothing is handed in, nobody goes upstairs',
    ends: 'stop',
    steps: [['prompt', 'Explain how the cart works'], ['read', 'cart.js'], ['read', 'receipt.js'], ['grep', 'total'], ['read', 'sample.js'], ['stop']],
  },
  search: {
    about: 'a text search and a file search, each a quick trip to the shelves',
    ends: 'stop',
    steps: [['prompt', 'Find where prices are formatted'], ['grep', 'price'], ['glob', '**/*.test.js'], ['stop']],
  },
  'failing-tests': {
    about: 'a test that fails, a fix, and a test that passes',
    ends: 'stop',
    steps: [
      ['prompt', 'Make the tests pass'],
      ...files(['fix.js']),
      ['bash', 'fail', 'npm test'],
      ['edit', 'fix.js'],
      ['bash', 'fail', 'npm test'],
      ['bash', 'ok', 'npm test'],
      ['stop'],
    ],
  },
  permission: {
    about: 'a permission is asked and waits a few seconds for an answer; the next thing that happens is the answer',
    ends: 'stop',
    steps: [['prompt', 'Clean up the build'], ['read', 'cart.js'], ['ask', 4000], ['bash', 'ok', 'npm run clean'], ['stop']],
  },
  subagent: {
    about: 'two helpers arrive together, work, and hand in their reports',
    ends: 'stop',
    steps: [
      ['prompt', 'Look into the report bug'],
      ['agentStart', 'a1', 'Explore'],
      ['agentStart', 'a2', 'Plan'],
      ['wait', 2500],
      ['agentStop', 'a1', 'Explore'],
      ['wait', 800],
      ['agentStop', 'a2', 'Plan'],
      ['stop'],
    ],
  },
  'burst-30': {
    about: 'thirty new files at once: a crowd, with more workers than desks',
    ends: 'stop',
    steps: [['prompt', 'Generate the sample data'], ['pace', 'fast'], ...files(Array.from({ length: 30 }, (_, i) => `data${i}.js`), 20), ['stop']],
  },
  interrupted: {
    about: 'Claude is interrupted: no Stop comes, so the Office ends the turn itself after a quiet spell',
    ends: 'quiet',
    steps: [['prompt', 'Refactor the totals'], ...files(['one.js', 'two.js'])],
  },
  'api-error': {
    about: 'work is handed in, then the API fails the turn: the manager says why, everyone goes home, nothing goes upstairs',
    ends: 'stop',
    steps: [['prompt', 'Update the report'], ['read', 'cart.js'], ...files(['report.js']), ['wait', 500], ['fail', 'rate_limit']],
  },
  compaction: {
    about: 'memory is compacted in the middle of a turn: the manager tidies the notes, then work goes on',
    ends: 'stop',
    steps: [['prompt', 'Keep going'], ['read', 'cart.js'], ['compact', 3500], ...files(['next.js']), ['stop']],
  },
  mcp: {
    about: 'a tool of an MCP server works, then one fails: an errand outside the office',
    ends: 'stop',
    steps: [['prompt', 'Check the issue tracker'], ['mcp', 'ok', 'github'], ['mcp', 'fail', 'github'], ['stop']],
  },
  denied: {
    about: 'a tool is refused in auto mode: a "blocked" bubble, then work goes on',
    ends: 'stop',
    steps: [['prompt', 'Tidy the build'], ['read', 'cart.js'], ['denied'], ['bash', 'ok', 'npm run lint'], ['stop']],
  },
  'web-and-code': {
    about: 'a web search, a page fetch, a search that fails, and a code check: errands out the door and to the shelves',
    ends: 'stop',
    steps: [['prompt', 'Look it up'], ['web', 'search'], ['web', 'fetch'], ['web', 'search', 'fail'], ['lsp'], ['stop']],
  },
  question: {
    about: "Claude asks the person a question: a worker waits at the CEO's door until it is answered",
    ends: 'stop',
    steps: [['prompt', 'Pick a design'], ['read', 'cart.js'], ['question', 4000], ...files(['chosen.js']), ['stop']],
  },
  notes: {
    about: 'small things the manager or CEO says: waiting for you, a command, a batch, tasks, a message, an idle teammate',
    ends: 'stop',
    steps: [
      ['prompt', 'Do the plan'], ['command', 'review'], ['task', 'new'], ['read', 'cart.js'], ['batch'], ['message'], ['task', 'done'],
      ['teammate'], ['idle'], ['stop'],
    ],
  },
  'busy-office': {
    about: 'a dozen chats at once, at random but always the same: reads, writes, tests, helpers, searches, an API error',
    ends: 'stop',
    steps: busyOffice(),
  },
  lifecycle: {
    about: 'a session is resumed, memos load, the model and folder change, a folder is added, then the session ends',
    ends: 'stop',
    steps: [
      ['session', 'resume'], ['memo'], ['memo'], ['prompt', 'Carry on'], ['model', 'opus'], ['cd', 'api'], ['addDir', 'shared'],
      ['read', 'cart.js'], ['stop'], ['end', 'other'],
    ],
  },
  clear: {
    about: '/clear: the session ends and starts again; what was on the manager\'s tray is swept away, and nothing goes upstairs',
    ends: 'stop',
    steps: [['prompt', 'Start a report'], ...files(['draft.js']), ['wait', 500], ['end', 'clear'], ['session', 'clear']],
  },
  'two-chats': {
    about: 'two chats working at once, each finishing on its own',
    ends: 'stop',
    steps: [
      ['chat', 'one'], ['prompt', 'First job'], ...files(['a.js', 'b.js']),
      ['chat', 'two'], ['prompt', 'Second job'], ...files(['c.js']), ['read', 'cart.js'],
      ['chat', 'one'], ['stop'],
      ['wait', 1500],
      ['chat', 'two'], ['stop'],
    ],
  },
}
