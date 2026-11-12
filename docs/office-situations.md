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

## Round 2: Lifecycle (Phase 5)

| Situation | Trigger | What the Office does | Status |
|---|---|---|---|
| Session starts or resumes | `SessionStart`; matcher startup, resume, clear, compact, fork | The office opens for the day | planned |
| Session ends | `SessionEnd` | The office closes | planned |
| `/clear` | `SessionStart` with `clear`, or `SessionEnd` with `clear` | Papers swept off the desks | planned |
| Model switch | `PreModelSwitch` / `PostModelSwitch` | The manager changes badge | planned |
| Folder added | `DirectoryAdded` | A new room's door opens | planned |
| Folder changed | `CwdChanged`; fields `old_cwd`, `new_cwd` | The manager moves to another wing | planned |
| Config loaded or changed | `InstructionsLoaded`, `ConfigChange` | A memo is pinned on the board | planned |
| Worktree created or removed | `WorktreeCreate`, `WorktreeRemove` | A second desk area appears or goes | planned |
| Scheduled work | `SessionStart` from a schedule, `Setup` (?) | The night shift | planned |
| Permission mode switch | no hook found | none | no hook |

## Round 3: Extras (Phase 5)

| Situation | Trigger | What the Office does | Status |
|---|---|---|---|
| Parallel batch finished | `PostToolBatch` | The workers of the batch line up at the manager | planned |
| Task list changes | `TaskCreated`, `TaskCompleted` | A task is pinned to or ticked on the whiteboard | planned |
| Web browsing | `WebFetch`, `WebSearch` tools | An errand worker goes to the library | planned |
| Code intelligence | `LSP` tool | An errand worker consults the reference desk | planned |
| Teammate goes idle | `TeammateIdle` | A helper sits down and waits | planned |
| Message to a subagent | tool `SendMessage` | A note is passed to the helper | planned |
| Slash command expands | `UserPromptExpansion`; field `command_name` | The prompt bubble shows the command | planned |
| Claude asks a question | `Notification` with type `elicitation_dialog`; `Elicitation` for MCP | A "?" at the CEO's door | planned |
| Permission denied by you | no event for a manual denial | none | no hook |
| Waiting too long | `Notification` with type `idle_prompt` | The manager looks at the clock | planned |
