# Office situations: what happens in a session, and what the Office does

One row per situation. Keep this up to date as animations are built.

**Status:** `built` (in the Office and in a mock scenario) · `round N` (being built in Phase 5, round N) · `planned` (wanted, not started) · `no hook` (Claude Code gives no event for it, so it cannot be told apart) · `dropped` (decided against).

Hook facts come from the Claude Code hooks reference (checked 2026-11-12). Fields marked (?) came from a summary and must be seen in a real session before relying on them.

## The first set (Phases 1 to 4)

| Situation | Trigger | What the Office does | Status |
|---|---|---|---|
| You send a prompt | `UserPromptSubmit` | A "prompt" bubble over the CEO's door; the manager looks up | built |
| Read a file | `PreToolUse` `Read` | A worker arrives, fetches the file from the file room, studies it in the lounge | built |
| Search the code | `Grep`, `Glob` | An errand worker goes to the shelves, reports back, leaves | built |
| Create a file | `Write` | A worker sits at a desk and writes it; hands it in | built |
| Edit a file | `Edit` | The worker fetches and studies the file, then writes at a desk; hands it in | built |
| Run a command | `Bash` | An errand worker goes to the test lab | built |
| Test passes | `PostToolUse` on a test command | Green tick at the lab | built |
| Test fails | `PostToolUseFailure` on a test command | Red cross at the lab | built |
| Edit not applied | `PostToolUseFailure` on an edit | "Not applied" bubble; worker sent back | built |
| Helper starts | `SubagentStart` | A helper worker arrives | built |
| Helper finishes | `SubagentStop` | The helper hands in a report and leaves | built |
| Permission needed | `PermissionRequest` | A worker waits at the CEO's door with a "?" | built |
| Claude finishes | `Stop` | The manager reviews the batch and carries it upstairs to the CEO; everyone leaves | built |
| Claude is interrupted | no event (`Stop` does not fire on interrupt) | After 45 s of quiet the Office ends the turn itself | built (fallback) |

## Round 1: Problems (Phase 5, built 2026-11-12; seen only in mock sessions)

| Situation | Trigger | What the Office does | Status |
|---|---|---|---|
| API error or rate limit | `StopFailure`; field `error` (rate_limit, overloaded, server_error, ...) | Everyone stops. The manager shows a red bubble ("rate limit" or "API error"). Nothing goes upstairs; workers go home | built |
| Context compaction | `PreCompact` / `PostCompact`; field `trigger` (manual or auto) | The manager walks to the file room to tidy the notes, bubble "compacting memory"; workers wait; back when `PostCompact` arrives | built |
| MCP tool failed | `PostToolUseFailure` where the tool is `mcp__<server>__<tool>` | An errand worker goes outside, comes back with a red cross, bubble "tool unavailable" | built |
| MCP tool used | `PreToolUse` on `mcp__...` | An errand worker goes outside (the phone) and back | built |
| Tool denied by auto mode | `PermissionDenied`; fields `tool_name`, `reason` | "Blocked" bubble on the worker, who goes back to the manager | built |
| A hook blocks a tool | no event (a blocked `PreToolUse` fires neither a failure nor `PermissionDenied`) | none | no hook |
| Interrupt | no event | covered by the 45 s quiet fallback above | dropped as its own animation |

## Round 2: Lifecycle (Phase 5, built 2026-11-12; seen only in mock sessions)

Field names marked (?) came from a summary of the docs and must be seen in a real session.

| Situation | Trigger | What the Office does | Status |
|---|---|---|---|
| Session starts or resumes | `SessionStart`; field `source` (?) | A bubble over the CEO: "New session" or "Resumed". A start after compaction is not announced (compaction has its own scene) | built |
| Session ends | `SessionEnd`; field `reason` (?) | Everyone goes home; the CEO shows "Session ended" | built |
| `/clear` | `SessionEnd` then `SessionStart` with `clear` | Everyone goes home; once they have gone the manager sweeps the tray ("Fresh start"); nothing goes upstairs | built |
| Model switch | `PostModelSwitch`; field `model` (?) | The manager shows "Model: <name>" (or "Model changed") | built |
| Folder changed | `CwdChanged`; field `new_cwd` | The manager shows "Now in <folder name>" | built |
| Folder added | `DirectoryAdded`; field `directory` (?) | The manager shows "Added <folder name>" (or "Folder added") | built |
| Instructions or config loaded | `InstructionsLoaded`, `ConfigChange` | The manager reads a memo; several in a row are one memo | built |
| Worktree created or removed | `WorktreeCreate`, `WorktreeRemove` | none: a `WorktreeCreate` hook replaces Claude Code's own worktree creation, so it is not installed | dropped (unsafe) |
| Scheduled work | no event tells it from a normal start | none | no hook |
| Permission mode switch | no hook found | none | no hook |

## Round 3: Extras (Phase 5, built 2026-11-12; seen only in mock sessions)

Only the kind of event is sent to the page: never a notification's words, a task's name or a command's arguments.

| Situation | Trigger | What the Office does | Status |
|---|---|---|---|
| Web browsing | `WebSearch`, `WebFetch` tools | An errand worker goes out the front door ("Searching the web", "Reading a web page"); a failure is "Tool unavailable" | built |
| Code intelligence | `LSP` tool | An errand worker goes to the shelves ("Checking the code") | built |
| Claude asks a question | `AskUserQuestion` tool | A worker waits at the CEO's door with a "?" ("Has a question") until the tool ends | built |
| Waiting too long | `Notification` with type `idle_prompt` | The manager shows "Waiting for you" | built |
| Slash command expands | `UserPromptExpansion`; field `command_name` | A bubble over the CEO: "/review" | built |
| Parallel batch finished | `PostToolBatch` | The manager shows "Batch finished" | built |
| Task list changes | `TaskCreated`, `TaskCompleted` | The manager shows "New task" or "Task done" | built |
| Message to a subagent | tool `SendMessage` | The manager shows "Message sent" | built |
| Teammate goes idle | `TeammateIdle` | The manager shows "Teammate idle" | built |
| Permission denied by you | no event for a manual denial | none | no hook |
| MCP elicitation (an MCP server asks you something) | `Elicitation` | not done: not asked for in this round | planned |
