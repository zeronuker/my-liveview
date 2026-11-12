# Office: plan

A new view in Live View that shows a Claude Code session as an animated office. The repo is the office, Claude and its subagents are the workers, and the person is "CEO" upstairs. It is a good story, not a live mirror: an instant edit still plays out as a full walk-and-write.

Status: Phases 0, 1 and 2 are done, the first half of Phase 3 is built and Phase 4 (Record) is built; all checked against a made-up session (`npm run mock`), none yet against a real Claude session. The new hooks are installed in the real Claude settings and Live View was restarted on 2026-11-12. Update this file as phases finish.

## Decisions so far

- **Name:** Office (a toggle in the toolbar, next to Whole file and Side by side). Not "The Office": that is a TV show.
- **Placement:** a new view inside this app, switched with a toggle. It keeps running while hidden (the simulation clock keeps going, only drawing stops) and catches up when shown. It cannot be recorded while hidden.
- **Floors:** ground floor has the file room, lounge, desks, manager's office, test lab and stairs. The upper floor is the CEO's office (the person; "CEO" is a placeholder name).
- **Workers:** one worker per file edited or created, with no limit (Live View itself caps at 4). Subagents are workers too. The main Claude is the manager. Workers spawn a short moment apart, desks are added as they arrive, and the director speeds up when the queue is long.
- **Names and looks:** random names, a mix of male and female, English and Malay. Each worker gets its own colour.
- **Pace:** the same Slow, Normal, Fast and Instant speeds as the file view.
- **Art:** plain shapes first. Pixel art only after the MVP is solid, and it should be art we own (see Licensing).
- **Rendering:** a `<canvas>`, so the browser can record it.
- **"CEO approves" (default, open to change):** when Claude finishes its turn (`Stop`), the manager carries the finished work upstairs. A permission request sends a worker to wait at the CEO's door with a "?" bubble. After the person replies, the manager comes back down and the next round starts.
- **Branches:** work directly on `main`, one commit per step, tests green first, push only when asked.

## The story, step by step

1. A worker fetches a file from the file room (`Read`).
2. Walks to the lounge and studies it (the gap between the read and the first edit).
3. Goes to a desk and writes (`Edit`, `Write`).
4. Takes the work to the test lab (`Bash` test runs). Pass: green tick, on to the manager. Fail: red cross, back to the desk to fix it.
5. Hands the finished work to the manager, who waits for the others.
6. The manager reviews the batch and carries it upstairs to the CEO when Claude's turn ends.

## MVP animation set

| Situation | Trigger | Hooked today? |
|---|---|---|
| Read a file | `Read` | yes |
| Search the code | `Grep`, `Glob` | yes |
| Edit or create a file | `Edit`, `Write`, `NotebookEdit` | yes |
| Run a command or test | `Bash`, `PowerShell` | yes |
| Tool succeeded or failed | `PostToolUse`, `PostToolUseFailure` | yes |
| Edit not applied | `PostToolUseFailure` on an edit | yes |
| You send a prompt | `UserPromptSubmit` | yes |
| New subagent arrives / hands in and leaves | `SubagentStart`, `SubagentStop` | no |
| Claude finishes | `Stop` | no |
| Permission needed | `PermissionRequest` | no |

## Later situations (after the MVP)

| Group | Situations |
|---|---|
| Work | background commands, web browsing, code intelligence (`LSP`), MCP tools, parallel batch finished, task list changes |
| People | teammate goes idle, message sent to a subagent |
| You and Claude | slash command expands, Claude asks a question, permission denied, waiting too long |
| Problems | API error / rate limit (`StopFailure`), hook blocks something, interrupt, context compaction, MCP server failed |
| Lifecycle | session start and end, `/clear`, plan mode, model switch, worktrees, folder added, config loaded, scheduled work, permission mode switch |

Suggested ideas for these are in the conversation history; assign them when each round starts.

## Phases

### Phase 0: Prepare
- Verify, against the live Claude Code docs, what `PermissionRequest`, `Stop`, `SubagentStart` and `SubagentStop` carry. Findings go in the section below.
- Done when: a verified list of event fields.

### Phase 1: Foundation (logic only)
- Hooks: add the four new events to `src/hooks-config.js` with tests; make the server accept and pass them on.
- Director, `public/director.js` with `src/director.test.js`: events in, scenes out. One worker per file, unlimited, staggered. Random names and colours. Subagents as workers.
- Walking, `public/walk.js` with `src/walk.test.js`: grid path-finding.
- Done when: tests pass and a fake event stream produces sensible scenes.
- **Done (2026-11-12).** What changed from the plan:
  - The server now publishes `turn-end`, `agent-start`, `agent-stop`, `permission` and `prompt` events (the prompt event carries no words). Tool events carry `path` and, inside a subagent, `agentId` and `agentType`.
  - The director (`public/director.js`) is pure: it turns events into commands (`hire`, `do`, `fire`, `review`, `submit`, `ask`, `answered`, `prompt`). Staggering and timing are **not** in the director: the Office view's scene player (Phase 2) decides how long each step takes and spaces out arrivals.
  - Names and colours are picked from free ones first, and released when a worker goes home.
  - `public/walk.js` is a plain grid path-finder (no diagonals). The two floors are two grids; the stairs hand-off is for the renderer in Phase 2.
  - Not yet handled by the director, on purpose: tools inside a subagent are not tied to that subagent's worker, and only Read, Edit, Write, Bash, Grep and Glob have scenes.

### Phase 2: Office MVP
- Office toggle in `public/index.html`, `public/app.js`, `public/style.css`.
- Canvas office in plain shapes, `public/office.js`: two floors, all rooms, workers.
- The MVP animations above. Speeds. Keeps running in the background and catches up when shown.
- A demo script, extending `scripts/demo.js` or `scripts/burst.js`.
- Done when: a real Claude session reads clearly as a story in the Office view.
- **Built (2026-11-12), not yet run against a real session:**
  - `public/layout.js` (floor plan, `fit`), `public/stage.js` (plays commands over time), `public/office.js` (canvas), the Office toggle in the toolbar, and the new files in the server's file table.
  - `npm run mock -- full` plays a made-up session at the server (prompt, search, reads, a helper, a permission, failing then passing tests, nine new files, a failed edit, turn end). Run it with Office switched on; use Focus to hide the side panels for more room.
  - Checked in the browser: both floors draw, workers walk, the manager takes the stack upstairs, and switching Office off and on again shows the session as it has moved on.
  - Known rough edges, for Phase 3: workers share desks and lounge seats once there are more than 16 and 9 (they stand on top of each other); the floor plan is small in a narrow window (Focus helps); Pause and Skip do not act on the Office; names can overlap; there is no sound of any kind.
  - The new hooks are not installed in the real Claude settings yet, so a real session shows only tool events until they are.

### Phase 3: Story polish
- Manager waits for the batch, reviews it, carries it upstairs. CEO shows a "?" while waiting on the person.
- Activity labels over heads ("Reading foo.ts"). A bubble style per situation.
- Pause and Skip in the Office view. Settings remembered between visits.
- Done when: a whole session feels like one coherent story.
- **Built so far (2026-11-12):**
  - Pause and Skip act on the Office: Pause freezes the stage (commands that arrive wait); Skip finishes everything now, except a worker waiting on a permission.
  - Workers sharing a desk or seat stand beside each other instead of on top of each other.
  - An interrupted turn (Claude stops without a `Stop` event) ends itself: after 45 s with nothing heard and nothing running, no helper working and no permission waiting, or after 10 min whatever seems to be running, the manager takes the stack upstairs.
  - Checked in the browser: Pause froze the picture, Skip cleared the office, and a write with no `Stop` was submitted after about a minute.
- **Still to do in Phase 3:** a look at a real session, and whatever that shows. Names can still overlap in a crowd, and the plan is small in a narrow window.
- **Seen when the user watched the mock sessions (2026-11-12), for polish:** workers walk through each other instead of avoiding each other; they do not act like workers: no pauses or hesitation between steps.

### Phase 4: Record (built 2026-11-12)
- Record button, shown only in the Office: `canvas.captureStream()` plus `MediaRecorder`, saved as an **mp4** (`public/recorder.js`). It goes to the browser's Downloads folder as `office-YYYY-MM-DD-HHMM.mp4`. Needs Chrome or Edge 126 or later; otherwise the button is off and says why.
- Leaving the Office (its toggle) while recording asks "Leave the Office and stop recording?"; Leave stops and saves what was recorded. Closing or reloading the window gets the browser's own "Leave site?" dialog.
- A hidden window cannot be asked anything, so the recording pauses while it is hidden and carries on when it is back.
- Checked in the browser pane: Record starts, Cancel keeps recording, Leave saves an mp4. Not checked: the hidden-window pause, and playing the file elsewhere.
- Later options: convert to GIF, share by link.
- Done when: a recording plays back elsewhere.

### Phase 5: Remaining situations
- Rounds: Problems, then Lifecycle, then Extras. Each with tests and a demo. The list of every situation, its trigger, what the Office does and whether it is built is in `docs/office-situations.md`: keep it up to date.
- **Round 1 (Problems) built 2026-11-12:** API error (`StopFailure`), compaction (`PreCompact`/`PostCompact`), MCP tools and their failures (`mcp__server__tool`), a tool refused in auto mode (`PermissionDenied`). Mock scenarios: `api-error`, `compaction`, `mcp`, `denied`. Not possible: a hook blocking a tool (no event). The four new hook events need `node scripts/hooks.js install` to be run again. Seen only in tests and mock sessions so far.
- **Round 2 (Lifecycle) built 2026-11-12:** session start, end and `/clear`, model switch, folder changed and added, memos for loaded instructions or config. Mock scenarios: `lifecycle`, `clear`. Dropped: worktrees (a `WorktreeCreate` hook would replace Claude Code's own). Seven more hook events, so `node scripts/hooks.js install` has to be run again. Seen only in tests and mock sessions so far.
- **Round 3 (Extras) built 2026-11-12:** web tools, code check, questions from Claude, waiting notices, slash commands, batches, tasks, subagent messages, idle teammates. Mock scenarios: `web-and-code`, `question`, `notes`. Six more hook events (25 in all), so `node scripts/hooks.js install` has to be run again. Phase 5 is done once the user has watched the new scenes; the exception is MCP elicitation, listed as planned.
- Done when: every row of the later-situations table has an animation or is deliberately dropped.

### Phase 6: Pixel art
- Own sprites, tiles, furniture, walk cycles replacing the shapes. Shapes stay as the fallback.
- **Decisions (2026-11-12):** the art is drawn by Claude in code (grids of letters, no image files, no licence worries); staged: workers first, then floors, walls and furniture, then details and polish.
- **Stage 1 built (workers):** `public/sprites.js` (12 by 16 pixels, front-facing, flipped for left and right; head, torso and legs put together; 4-frame walk, 2-frame rests; 2 hair styles, 4 skin tones, 6 hair colours, 3 trouser colours; shirt in the worker's colour with a cooler shade; the manager has a tie and glasses, helpers a hard hat; a book and papers can be carried). `public/office.js` draws them a whole number of screen pixels per sprite pixel, with no smoothing; a pose with no sprite is still drawn as the old shapes. Tests: `src/sprites.test.js`. Seen in the browser pane at two window sizes; the user has not judged the art yet.
- Done when: the Office looks like a finished game scene.

### Phase 7: Final product
- Performance with many workers (100+ files in one burst).
- Reduced-motion setting, all five themes, narrow windows.
- Multiple chats: one shared office with one colour per chat, or one office per chat. Undecided.
- Optional sound with a mute toggle.
- Docs and a README for the feature; a final round of manual checks.
- Done when: it is ready to show others.

## Mock sessions: how to test and add animations

A mock session is a scripted list of plain steps (`src/scenarios.js`, steps explained in `src/mock.js`). `src/mock.js` turns it into the hook events Claude would send; `scripts/mock.js` posts them to the running Live View, the same way the real hooks do. Nothing of the project is touched: files go in `demo/mock`, which git ignores.

- `npm run mock -- --list` says what there is. `npm run mock -- <name>` plays one at the running Live View (with Office switched on). `npm run mock -- --all` plays every one. `PORT=4801 npm run mock -- <name>` plays at another port.
- Scenarios: `full`, `reading-only`, `search`, `failing-tests`, `permission`, `subagent`, `burst-30` (more workers than desks), `interrupted` (no `Stop`), `two-chats`.
- `src/scenarios.test.js` plays every scenario at a real server on a spare port, runs what comes out through the director and the stage, and checks that the office ends up empty. Its last tests fail if an event type, a tool, a director command or a stage step appears in no scenario.
- What it cannot prove: that Claude's real hook payloads match. Only a real session shows that. Later, a real session's events could be saved as a scenario.

**To add an animation:**
1. If it needs a new hook event, add it to `PLAIN_EVENTS` or `TOOL_EVENTS` in `src/hooks-config.js` (with its test) and publish it in `src/server.js` (with its test). Re-run `node scripts/hooks.js install`.
2. Add the rule to `public/director.js`, with a test in `src/director.test.js`.
3. Add the step to `jobs` in `public/stage.js`, with a test in `src/stage.test.js`. Add anything it needs to the floor plan in `public/layout.js`.
4. Draw it in `public/office.js`.
5. Add a step to `src/mock.js` if the scenario language lacks one (with a test), and a scenario to `src/scenarios.js` that shows it.
6. Put the new event, tool, command or step in the coverage lists at the end of `src/scenarios.test.js`.
7. Play it: `npm run mock -- <name>`, and look.

## Risks

- The new hook payloads may differ from the docs.
- Many workers at once may need drawing optimisations.
- Recording depends on browser support.
- Multi-chat layout is undecided.

## Licensing notes

- The code of the reference projects (Pixel Agents, Pixel Agent Desk, agents-in-the-office, pixtuoid, claude-office, clawffice) is MIT.
- Pixel Agent Desk's art forbids modification, redistribution and use in other products. Do not use it.
- Pixel Agents and agents-in-the-office use the free MetroCity pack by JIK-A-4. Its licence was not checked.
- Clawffice uses paid LimeZu packs.
- Plan: draw our own art in Phase 6.

## References

- Pixel Agents: https://github.com/pablodelucca/pixel-agents
- Pixel Agent Desk: https://github.com/Mgpixelart/pixel-agent-desk
- agents-in-the-office: https://github.com/gukosowa/agents-in-the-office
- pixtuoid: https://github.com/IvanWng97/pixtuoid
- claude-office: https://github.com/paulrobello/claude-office
- lot-map: https://github.com/alexeyw/lot-map
- sidekick-agent-hub: https://github.com/cesarandreslopez/sidekick-agent-hub
- Mindwalk (3D replay of sessions): https://betterstack.com/community/guides/ai/mindwalk-ai-agent/
- Claude Code hooks: https://code.claude.com/docs/en/hooks

## Phase 0 findings

Checked against https://code.claude.com/docs/en/hooks on 2026-11-12. Mostly verbatim; items marked "unverified" were not read word for word and need a live test in Phase 1.

### Events the Office needs

| Event | Fires when | Fields beyond the common ones | Matcher |
|---|---|---|---|
| `Stop` | The main agent finishes responding. Not on user interrupt (an API error fires `StopFailure` instead). Does not fire for subagents. | `stop_hook_active`, `last_assistant_message`, `background_tasks`, `session_crons` | none |
| `PermissionRequest` | Claude is about to ask for permission. A separate, delayed (about 6 s) `Notification` of type `permission_prompt` also exists. | `tool_name`, `tool_input`, optional `permission_suggestions`. No `tool_use_id`. | tool name |
| `SubagentStart` | A subagent is spawned or resumed, or a teammate handles a new message. | `agent_id`, `agent_type` | agent type |
| `SubagentStop` | A subagent finishes. Also fires for internal agents (prompt suggestions, `/btw`). | `agent_id`, `agent_type` (empty string with no agent), `agent_transcript_path`, `last_assistant_message`, `stop_hook_active`, `background_tasks`, `session_crons` | agent type |

Common fields on all events: `session_id`, `transcript_path`, `cwd`, `permission_mode`, `hook_event_name`.

### Tool payloads

- `Edit`: `file_path`, `old_string`, `new_string`, `replace_all`. `Write`: `file_path`, `content`. `Read`: `file_path`, `offset`, `limit`. `Bash`: `command`, `description`, `timeout`, `run_in_background`.
- `PostToolUseFailure` adds `error`, `duration_ms` and optional `is_interrupt` (true when the failure arrived as an abort). Cancelling a running tool does not fire it.
- Tool events inside a subagent carry `agent_id` and `agent_type`. The docs' PreToolUse example does not show them, so this needs a live check.

### What this means for the build

- **Replies must stay empty.** For `Stop` and `SubagentStop`, a `decision: "block"` keeps Claude working; omitting `decision` lets it stop. For `PermissionRequest`, an empty or `{}` reply means "no decision" and the normal prompt appears. Our hook handler already answers fast and empty, so reporting is safe. Unverified: the docs section on empty HTTP bodies was not read word for word. Test live in Phase 1.
- **Current server drops these events.** In `src/server.js`, `onHook` returns early for any event without a `tool_name`, so `Stop`, `SubagentStart` and `SubagentStop` would be ignored today. Phase 1 must publish them as new event types. `PermissionRequest` has a `tool_name` but is not handled either.
- **Subagent attribution.** The published `tool` event does not carry `agent_id` yet. Phase 1 should add `agentId` and `agentType` to it, so the director can tell which worker did what.
- **Static files.** New files such as `public/office.js` must be added to the `files` table in `src/server.js`, or the server will not serve them.
- **Hook install.** `TOOL_EVENTS` in `src/hooks-config.js` lists three events. The four new ones have no tool, so they need entries like the existing `UserPromptSubmit` one (no matcher). Re-running install must stay safe to run twice.
- **Interrupts.** `Stop` does not fire on a user interrupt, so the story needs a fallback for "Claude stopped but the manager never went upstairs". Decide in Phase 3.
- **Not checked:** whether `PermissionDenied`, `StopFailure` and the model-switch events exist in every build (Phase 5).

## Behaviour pass (built 2026-11-12, before the pixel art)

Workers now act more like people. All in `public/stage.js` (and `findPath` in `public/walk.js`), tested in `src/stage.test.js`:
- **Personality** from the worker's id (always the same for one id): walking speed 0.85x to 1.2x, reaction time 0.15 to 0.55 s, settle time 0.2 to 0.45 s (`personality`).
- **Hesitation:** a new job after a quiet moment starts only after the reaction time. Back-to-back jobs do not hesitate. At instant speed nothing waits.
- **Settling:** on arriving at a spot, a short pause before the job begins.
- **Smooth walking:** speeds up from a slow start and slows for the last stretch.
- **Avoidance:** a worker does not step into a cell someone else stands in (the last cell of a trip, such as a shared desk, is exempt). After 0.5 s held up it goes round by a new path; after 4 s with no way round it walks through for 2 s. Idea from agents-in-the-office.
- **Reaction:** a passed test or a found result is a small hop (`cheer` pose).
- Checked with 150 workers at once: about 2.5 ms per 250 ms tick, all home in about 46 simulated seconds.
- Not done yet: waiting in numbered queues at a shared spot, idle fidgets and blinking (they come with the art), conversations at the hand-in, a "planning huddle" for plan mode and `TodoWrite` (plan mode and the task tools are received but have no scene).

## Research notes (2026-11-12)

**How other projects behave** (read from their source; all code is MIT):
- Avoiding each other: agents-in-the-office blocks other characters' cells, re-plans after 0.5 s, and lets a character walk through others for 2 s after 4 s stuck. claude-office lets characters pass through each other and uses numbered queue slots in front of the boss instead. pixtuoid offsets each walker's aim by up to 4 px, reserves single-use spots and gives shared spots a rank offset. pixel-agents and pixel-agent-desk do nothing.
- Human timing: pixtuoid gives each agent a personality from an id hash (speed 0.85 to 1.2x, trip chance, settle pause 200 to 400 ms, smooth acceleration), phases typing so neighbours are out of step, and has chit-chat at shared spots. agents-in-the-office idles 2 to 8 s, interacts 3 to 6 s, walk frames 0.15 s, bubbles 3 s, "Waiting..." when no spot is free. pixel-agents wanders 2 to 20 s, rests 120 to 240 s, blinks at random (1.5 s plus an exponential wait). claude-office has a hand-in conversation ("Here's your task" / "Good work, I'll take that"), a boss lock, and a 90 s zombie-helper timeout.
- Nobody has hesitation before starting work or a reaction to a failed tool (pixel-agent-desk has an alert jump and confetti).
- PixelHQ (iOS app and `pixelhq` bridge): reads Claude's log files, no hooks; maps tools to categories (file_read, file_write, terminal, search, plan, communicate, spawn_agent, notebook). Planning is a huddle, exploring is the whiteboard. Only filenames, never full paths, are sent.
- Art: claude-office's characters are procedural capsules, not sprites; its furniture PNGs have no stated licence. Pixel-agent-desk's art is under a restrictive licence. Pixel-agents and agents-in-the-office use the MetroCity pack (licence unchecked).

**Pixel art guidelines for Phase 6** (from general tutorials):
- A 4-frame walk is enough at 16x16 (more is overkill); idle and typing 2 to 3 frames; 8 to 12 frames per second.
- Small palettes (4 to 5 colours per sprite), hue-shifted ramps, never darken by adding black, no pillow shading, clean clusters. Lospec palettes are the usual source.
- Read: Slynyrd's Pixelblog (https://slynyrd.com/blog/2018/5/16/pixelblog-5-back-to-basics, https://www.slynyrd.com/blog/2019/10/21/pixelblog-22-top-down-character-sprites), Saint11's tutorials (https://saint11.org/blog/pixel-art-tutorials/), https://www.sprite-ai.art/guides/pixel-art-fundamentals.
- Human feel: no action on exact frames (small random delays), a short "notice, then move" step before accelerating, ease in and out, hold anticipation frames longer.
- Art packs: no clearly CC0 16x16 office set was found; Kenney's Roguelike Indoor Pack (https://opengameart.org/content/roguelike-indoor-pack) is CC0 but its size needs checking. Packs are references to study only: Phase 6 art is drawn in code.
