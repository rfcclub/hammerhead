# CLI reference

```
hammerhead-debug <command> [arguments] [flags]
```

Commands: `install`, `open`, `hypothesis`, `probe`, `verdict`, `fix`, `status`, `check`, `list`, `help`.

All output on success is JSON on stdout, except `install` (plain text) and `help`. Errors go to stderr as `Error: <message>`.

## Conventions

- **`<session-id>`** is the id printed by `open` (form `dbg-` plus 8 hex characters). It is the first positional argument of every command except `open`, `install` and `list`.
- **`--dir <dir>`** selects the session directory. Default `.hammerhead-debug`, relative to the current directory. Accepted by `open`, `hypothesis`, `probe`, `verdict`, `fix`, `status`, `check` and `list`. The built-in help text lists it only for `open`.
- **Flag parsing.** `--name value` or bare `--name`. A value that begins with `--` is taken as the next flag, so `--repro "--x"` fails with the "requires" message. An empty value (`--predict ""`) is treated as missing. There are no `--name=value` forms and no short flags. Unknown flags are ignored without a message.
- **No per-command help.** `hammerhead-debug open --help` runs `open` and fails because `--symptom` is missing.

## Exit codes

| Code | When |
|---|---|
| 0 | The command succeeded. Also: `help`, `--help`, `-h`, or no command at all (prints usage). |
| 1 | Any error: missing or invalid arguments, a guard refusal, a missing session file, a failed `dap` call, an unknown command (prints usage, then exits 1). |

Exit code 0 does not mean the news is good for these commands:

- `check` exits 0 even when it prints `{"resolved": false}`. Parse the JSON.
- `verdict` exits 0 even when the output says `"escalate": true`.
- `status` exits 0 regardless of session state.

## `open`

```
hammerhead-debug open --symptom "<description>" --repro "<command>" [--plan <plan> --task <task>] [--dir <dir>]
```

Creates a session file. Both `--symptom` and `--repro` are required.

Output: `{ "session_id": "...", "dir": "..." }`

- `--repro` is a shell command. `check` runs it later with `sh -c` in the directory where you run `check`. Pick a command that exits 0 when the bug is gone.
- `--plan` and `--task` are stored as `serves_task` only when both are given. They are metadata for Orca users. hammerhead-debug does not read them again.
- The current git `HEAD` hash is stored as `bound_repo_sha`; `unknown` when the directory is not in a git repository or has no commit. It is informational and never checked later.
- The session directory is created if needed. The default cycle budget is 4 refuted cycles. There is no flag to change it; see [session format](session-format.md#escalation).

## `hypothesis`

```
hammerhead-debug hypothesis <session-id> "<hypothesis>" --predict "<prediction>" [--dir <dir>]
```

Opens a new cycle with status `open`.

Output: `{ "cycle_id": "c-N" }`

Refused when the cycle budget is exhausted or invalid, when the prediction is blank, or when another cycle is still open. Messages are in [guard rules](guard-rules.md).

## `probe`

Two forms.

```
hammerhead-debug probe <session-id> --kind dap --break <path:line> --evaluate "<expression>" [--script <path>] [--dap-bin <path>] [--action "<text>"] [--dir <dir>]

hammerhead-debug probe <session-id> --kind instrumentation|isolated_test|trace_read --observation "<captured text>" [--action "<text>"] [--dir <dir>]
```

Attaches a probe and an observation to the open cycle. The session must have an open cycle.

Output: the observation, `{ "captured": "...", "observation_sha256": "..." }`.

| Flag | Applies to | Meaning |
|---|---|---|
| `--kind` | all | Required. `dap`, `instrumentation`, `isolated_test` or `trace_read`. Any other value fails with `probe must collect evidence, not modify source-under-repair`. |
| `--action` | all | Free text label stored as `probe.action`. Defaults to the kind name. |
| `--observation` | non-dap | Required. The evidence text, stored verbatim with its SHA-256. |
| `--break <path:line>` | dap | Required. One breakpoint. The value is split on `:`, so the path cannot contain a colon, and conditions cannot be given from the CLI. |
| `--evaluate` | dap | Required. The expression `dap eval` runs at the stop. |
| `--script` | dap | The program to debug. Needed to launch a program. |
| `--dap-bin` | dap | Path to the `dap` executable. Default: `dap` from `PATH`. |

Behavior to know about:

- A second `probe` on the same open cycle **replaces** the first observation and probe. Nothing is kept of the earlier one.
- If the `dap` call fails, the command exits 1 and the cycle is left unchanged.
- The CLI exposes only part of what the library can do with `dap`: no attach, no PID, no backend override, no stop-on-entry, no breakpoint conditions. See [DAP probes](dap-probes.md).

## `verdict`

```
hammerhead-debug verdict <session-id> --result CONFIRMED|REFUTED [--reason "<text>"] [--dir <dir>]
```

Closes the open cycle. Requires a stored observation whose hash still matches (for REFUTED too).

Output: `{ "cycle_id": "c-N", "status": "confirmed"|"refuted", "escalation": { "escalate": false } }`. When the budget is used up, `escalation` is `{ "escalate": true, "reason": "cycle budget exhausted" }`.

`CONFIRMED` also sets `fix.authorized_by_cycle` to this cycle. If two cycles are confirmed, the later one authorizes the fix.

Any `--result` other than the two exact upper-case words fails with the usage message.

## `fix`

```
hammerhead-debug fix <session-id> --diff-sha256 <hash> [--dir <dir>]
```

Records that the fix was applied. Refused unless a confirmed cycle authorizes it and its observation hash still matches.

Output: `{ "authorized": true, "fix": { "authorized_by_cycle": "c-N", "applied": true, "diff_sha256": "..." } }`

`--diff-sha256` is stored as given. It is not validated or compared with anything. Calling `fix` again overwrites the stored hash.

## `status`

```
hammerhead-debug status <session-id> [--dir <dir>]
```

Prints `{ "session": <the full session JSON>, "escalation": { "escalate": ..., "reason": ... } }`.

## `check`

```
hammerhead-debug check <session-id> [--dir <dir>]
```

Runs the session's `repro_cmd` with `sh -c` in the **current directory** (not the session directory). Prints `{ "resolved": true }` if it exits 0, `{ "resolved": false }` for anything else, including a command that cannot start. The repro's output is discarded. There is no timeout; a repro that hangs hangs `check`.

`check` does not change the session file.

## `list`

```
hammerhead-debug list [--dir <dir>]
```

Prints `{ "sessions": [ ... ] }`: every `*.json` file name in the directory with `.json` removed. If the directory does not exist, the list is empty. It does not verify that a file is a session, so in a directory with other JSON files (for example an Orca change directory with `plan.json`) those names are listed too.

## `install`

```
hammerhead-debug install [--agent claude-code|codex] [--project]
```

Copies `skill/SKILL.md` from the package to:

| Agent | Global (default) | With `--project` |
|---|---|---|
| `claude-code` | `~/.claude/skills/hammerhead-debug/SKILL.md` | `./.claude/skills/hammerhead-debug/SKILL.md` |
| `codex` | `~/.codex/skills/hammerhead-debug/SKILL.md` | `./.codex/skills/hammerhead-debug/SKILL.md` |

Without `--agent`, both are installed. An existing `SKILL.md` at the target is overwritten without a backup. An unknown agent name fails with `unknown --agent "..." — expected one of: claude-code, codex`. `--agent` with no value is ignored and installs both.

Output (plain text): `Installed hammerhead-debug skill:` followed by one `  [agent] path` line per target.

## `help`

`hammerhead-debug help`, `--help`, `-h` or no arguments print the usage text and exit 0. The usage text omits `--dir` on most commands, `--dap-bin` and `--action`; they work and are listed above.
