# Live View

A second window that shows, live, what Claude Code is doing: the file edits as they are typed, and the whole session as an animated **Office**.

Claude Code sends small hook events to a local server (`http://127.0.0.1:4747`); the window draws them. Nothing leaves your computer, and the hooks only report: the server answers fast and empty, so it can never hold Claude up or decide a permission.

## Run it

```bash
npm start          # the server (makes a .token file the first time)
node scripts/hooks.js install    # adds the hooks to ~/.claude/settings.json (the old file is copied aside)
npm run app        # opens the window (Chrome or Edge, as an app window)
npm run stop       # stops the server and closes its windows
```

`node scripts/hooks.js uninstall` takes the hooks out again. Claude Code reads hooks when a session starts, so start a new session after installing or changing them. If the hooks change in a later version, run `install` again.

## The file view

The files Claude edits are typed out live, up to four at a time, with the changed lines marked and coloured like code (keywords, strings, function names, numbers, comments). An edit is written first and the old code goes last: new code is typed in, a small change is made where the line stands (the changed words are selected, deleted with one backspace and typed again), and only then is the old code removed for good, either backspaced letter by letter or selected and deleted at once, at random for each change. With **Side by side**, or when an edit is shown at once (instant speed, Skip, an older edit), the removed lines stay in red as a record. The colour marking an edit stays steady while it is written and fades ten seconds after it is done. The left list holds every chat and the files each touched (double-click a chat to rename it); the right panel is a feed of what Claude is doing. The toolbar has Pause, Skip, speed, Office and Record; everything else (five themes, text size, Wrap, Whole file, Side by side, Follow, Focus, window size, Stay awake, and in the Office sound and starting with the activity list folded) is in the Settings panel, opened by the gear at the right.

## The Office

Press **Office** in the toolbar. The repo becomes an office: Claude is the manager, and every file read, written or searched, every command and every helper (subagent) is a worker with a name and a colour. It tells a story rather than mirroring each event: a worker fetches a file from the file room, reads it in the lounge, writes it at a desk, tests it in the lab and hands it to the manager. When Claude finishes its turn, the manager reviews the batch and takes it upstairs to the CEO (you). A permission request sends a worker to the CEO's door with a "?".

- **Teams:** each chat has its own manager and a team of 5 to 8 workers who are in the office as soon as the chat is seen; more come in when it is busy, and they all go home after the session ends or 10 minutes of quiet.
- **Phases:** the office follows what the chat is doing. While Claude works, people make trips to the file room, server room and test lab; while it waits for you, they linger and some step outside; in plan mode the team and the CEO meet at the table. The CEO also walks round and calls meetings on his own.
- **Commit and push:** when Claude's shell command makes a git commit or push (and it goes through), the team cheers and confetti falls. The server sends only the word "commit" or "push", never the command.
- **The Office screen:** in the Office the toolbar shows only what applies to it, each chat's row says what its team is doing (Working 2/7, Planning, Waiting for you), the activity list sits under the chats (click its title to fold it; picking a chat shows only that chat's activity), a strip along the bottom shows the latest events, a banner says when a chat is waiting for you, there are +, - and Fit buttons on the picture, and clicking a worker shows their card.
- **Many chats:** all chats share one office. With more than one at work, each name gets a dot in its chat's colour and a legend lists the chats. Pick a chat in the left list to make its workers stand out.
- **Zoom and pan:** mouse wheel zooms, drag pans, **Fit** (or a double-click) shows the whole office again.
- **Angled view:** the **Angled** button in the Office toolbar shows the same office from an angle, as a cut-away building with the CEO suite and the mezzanine raised, a garden and a pond. Everything works the same in it (zoom, pan, clicking a worker). The choice is remembered. How it is built is in `docs/office-design-brief.md`.
- **Turning the angled view:** two buttons beside the zoom buttons (or the `[` and `]` keys) turn it a quarter turn, so the office can be seen from all four sides. The side is remembered. Settings has links that open the angled Office from each side in a window of its own (`/?view=angled&turn=1`, `2` or `3`).
- **Several windows:** Settings, "Open a view in a new window", opens the Code view, the Office, the angled Office or the Map in a window of its own, so they can all be on screen at once. The same links work typed in: `/?view=code`, `/?view=office`, `/?view=angled` and `/?view=map`. A window opened this way keeps its view to itself and does not change what the others, or the next visit, show. Each window runs its own copy of the Office from the same live events, so they show the same work but not exactly the same positions.
- **Record:** saves the picture as an `.mp4` in your Downloads folder (Chrome or Edge 126 or later). It asks before you leave the Office while recording, and pauses while the window is hidden.
- **Sound:** off until you press **Sound**: a chime when work reaches the CEO, a buzz on a failure, a tick on a hand-in, soft clicks while code is typed. The choice is remembered.
- **Less motion:** if your system is set to reduce motion, confetti, rings and floating code are left out and nobody bobs or breathes.
- **Speed, Pause and Skip** work in the Office too. At instant speed nobody walks.
- The Office keeps running while it is hidden and catches up when you come back; it only draws, and records, while visible.

What the Office does for each kind of event, and what is built, is listed in `docs/office-situations.md`. The plan, decisions and research are in `docs/office-plan.md`.

## The Map

Press **Map** in the toolbar (Code, Office and Map are the three views). The chat's repo becomes a 3D picture, lit by what Claude does: files it reads light up blue, files it edits amber, and a file it creates green. They glow bright and then settle to a dim tint, so you can see everywhere Claude has been. The chat you pick in the left list sets the repo shown (else the chat that was active last).

- **Any repo, no chat needed:** in the Map the left side also lists **Repos**: the git repos in your repos folder. Set the folder in Settings (Map, Repos folder); left empty, it is the folder that holds the repo Claude last worked in. Click a repo to see it; click a chat to go back to that chat's repo. With nothing to show yet, the Map says how to get started.

- **Two styles:** the buttons at the top left of the Map switch between them, and the choice is remembered.
  - **Nebula:** every real file is a star, and a file that imports another is linked to it (JS/TS, CSS, HTML, Python, Kotlin and Java imports). Each folder is a softly glowing cloud in its own colour, with faint dust (more for a bigger folder) and far stars behind; the clouds and links are fainter when there are many. The biggest folders are named, with the parent folder added when two share a name. Stars with more links are bigger, and related files pull together (a force layout, like [Graphify](https://github.com/Graphify-Labs/graphify)). There are no folder or stand-in nodes.
  - **City:** the repo as a city at night that grew without a plan. Each top folder is a district: its buildings are dropped round its middle in no particular order (a folder's files near each other), pushed apart until none overlap and turned a little this way and that, so its edge is an irregular shape with a ring road round it and parks where the buildings left room. A folder holding most of the repo is split into its own folders. Districts are scattered with uneven gaps, curving main roads join them and trees grow round them; each district's name floats over its tallest building. Each file is a building in its neighbourhood's colour: a short file a low house, a long one a skyscraper, stepped as it rises, the longest with a spire (past 3000 lines a file gets no more ground and no more height). Lit windows show recent work: a file changed in the last two weeks has most windows lit, one left alone for months has few and weathers grey (from git; nothing is changed). Imports are faint arcs from rooftop to rooftop. The buildings rise from the middle out when the city opens.
- **In the Nebula** a file Claude is working on beats like a heart, sending rings out, and light runs along its links. The last file touched keeps a gentle beat until the chat finishes its turn. When Claude moves from one file to the next a comet flies between them. Stars twinkle, the clouds turn slowly, and the camera turns by itself (none of this if your system asks for less motion).
- **In the City** a building Claude is working on glows and beats, and light runs along its arcs; one it edits gets a tower crane with a blinking beacon (it stays for the session), one it reads a searchlight. Comets fly between files here too.
- **Move around:** drag to turn, right-drag to pan, wheel to zoom, click a star or building to glide up to it, **Fit** (or a double-click) to glide back to the whole picture. Point at a star or building to see its path, length and links; its links light up.
- **Big repos:** the Nebula shows every file. In the City, past 5000 files the shortest ones are merged, one grey block per folder.
- **Read-only:** the server reads the repo's file list and import lines for the Map, only for a folder a Claude hook has named or a git repo, and skips `.git`, `node_modules` and build folders. The 3D drawing uses [three.js](https://threejs.org) (MIT), kept in `public/vendor/` so it works offline.
- **Not yet:** replaying a past session on the map, and searches (Grep and Glob) lighting up folders.

## Try it without Claude

Scripted mock sessions play the same hook events at the running server:

```bash
npm run mock -- --list         # what there is
npm run mock -- full           # one session
npm run mock -- busy-office    # a dozen chats at once, always the same
npm run mock -- --all          # every one, one after another
```

## Tests

```bash
npm test
```

The tests play every mock session through a real server and check that the Office ends up empty, and they fail if a new event, tool or animation is in no scenario.

## Files worth knowing

- `src/server.js`: receives the hook events and sends them to the window.
- `public/director.js`: turns events into the story. `public/stage.js`: plays it (walking, jobs, bubbles). `public/office.js`: draws it.
- `public/sprites.js` (people), `public/scenery.js` (floors, walls, furniture), `public/effects.js`, `public/sound.js`: all drawn or made in code, with no image or sound files.
- `src/scenarios.js`: the mock sessions.
