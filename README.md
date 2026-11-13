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

The files Claude edits are typed out live, up to four at a time, with the changed lines marked. The left list holds every chat and the files each touched (double-click a chat to rename it); the right panel is a feed of what Claude is doing. The toolbar has Pause, Skip, speed, Office and Record; everything else (five themes, text size, Wrap, Whole file, Side by side, Follow, Focus, window size, Stay awake, and in the Office sound and starting with the activity list folded) is in the Settings panel, opened by the gear at the right.

## The Office

Press **Office** in the toolbar. The repo becomes an office: Claude is the manager, and every file read, written or searched, every command and every helper (subagent) is a worker with a name and a colour. It tells a story rather than mirroring each event: a worker fetches a file from the file room, reads it in the lounge, writes it at a desk, tests it in the lab and hands it to the manager. When Claude finishes its turn, the manager reviews the batch and takes it upstairs to the CEO (you). A permission request sends a worker to the CEO's door with a "?".

- **Teams:** each chat has its own manager and a team of 5 to 8 workers who are in the office as soon as the chat is seen; more come in when it is busy, and they all go home after the session ends or 10 minutes of quiet.
- **Phases:** the office follows what the chat is doing. While Claude works, people make trips to the file room, server room and test lab; while it waits for you, they linger and some step outside; in plan mode the team and the CEO meet at the table. The CEO also walks round and calls meetings on his own.
- **Commit and push:** when Claude's shell command makes a git commit or push (and it goes through), the team cheers and confetti falls. The server sends only the word "commit" or "push", never the command.
- **The Office screen:** in the Office the toolbar shows only what applies to it, each chat's row says what its team is doing (Working 2/7, Planning, Waiting for you), the activity list sits under the chats (click its title to fold it; picking a chat shows only that chat's activity), a strip along the bottom shows the latest events, a banner says when a chat is waiting for you, there are +, - and Fit buttons on the picture, and clicking a worker shows their card.
- **Many chats:** all chats share one office. With more than one at work, each name gets a dot in its chat's colour and a legend lists the chats. Pick a chat in the left list to make its workers stand out.
- **Zoom and pan:** mouse wheel zooms, drag pans, **Fit** (or a double-click) shows the whole office again.
- **Record:** saves the picture as an `.mp4` in your Downloads folder (Chrome or Edge 126 or later). It asks before you leave the Office while recording, and pauses while the window is hidden.
- **Sound:** off until you press **Sound**: a chime when work reaches the CEO, a buzz on a failure, a tick on a hand-in, soft clicks while code is typed. The choice is remembered.
- **Less motion:** if your system is set to reduce motion, confetti, rings and floating code are left out and nobody bobs or breathes.
- **Speed, Pause and Skip** work in the Office too. At instant speed nobody walks.
- The Office keeps running while it is hidden and catches up when you come back; it only draws, and records, while visible.

What the Office does for each kind of event, and what is built, is listed in `docs/office-situations.md`. The plan, decisions and research are in `docs/office-plan.md`.

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
