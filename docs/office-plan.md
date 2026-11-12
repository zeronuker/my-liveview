# Office: plan

A new view in Live View that shows a Claude Code session as an animated office. The repo is the office, Claude and its subagents are the workers, and the person is "CEO" upstairs. It is a good story, not a live mirror: an instant edit still plays out as a full walk-and-write.

Status: planning. Phase 0 is next. Update this file as phases finish.

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

### Phase 2: Office MVP
- Office toggle in `public/index.html`, `public/app.js`, `public/style.css`.
- Canvas office in plain shapes, `public/office.js`: two floors, all rooms, workers.
- The MVP animations above. Speeds. Keeps running in the background and catches up when shown.
- A demo script, extending `scripts/demo.js` or `scripts/burst.js`.
- Done when: a real Claude session reads clearly as a story in the Office view.

### Phase 3: Story polish
- Manager waits for the batch, reviews it, carries it upstairs. CEO shows a "?" while waiting on the person.
- Activity labels over heads ("Reading foo.ts"). A bubble style per situation.
- Pause and Skip in the Office view. Settings remembered between visits.
- Done when: a whole session feels like one coherent story.

### Phase 4: Record
- Record button: `canvas.captureStream()` plus `MediaRecorder`, downloads a `.webm`.
- Warn if the view is hidden mid-recording.
- Later options: convert to MP4 or GIF, share by link.
- Done when: a recording plays back elsewhere.

### Phase 5: Remaining situations
- Rounds: Problems, then Lifecycle, then Extras. Each with tests and a demo.
- Done when: every row of the later-situations table has an animation or is deliberately dropped.

### Phase 6: Pixel art
- Own sprites, tiles, furniture, walk cycles replacing the shapes. Shapes stay as the fallback.
- Done when: the Office looks like a finished game scene.

### Phase 7: Final product
- Performance with many workers (100+ files in one burst).
- Reduced-motion setting, all five themes, narrow windows.
- Multiple chats: one shared office with one colour per chat, or one office per chat. Undecided.
- Optional sound with a mute toggle.
- Docs and a README for the feature; a final round of manual checks.
- Done when: it is ready to show others.

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
