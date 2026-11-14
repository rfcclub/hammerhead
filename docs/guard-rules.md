# Guard rules

The checks live in `DebugGuard` (`src/debug-guard.ts`) and run inside the CLI commands. Each throws an `Error`; the CLI prints it as `Error: <message>` and exits 1. The guard sees the session file and nothing else. It never looks at your source tree.

## What blocks what

| Command | Blocked when | Message |
|---|---|---|
| `hypothesis` | `escalation.max_refuted_cycles` is not a positive safe integer | `invalid cycle budget` |
| `hypothesis` | the number of refuted cycles is at least `max_refuted_cycles` | `cycle budget exhausted` |
| `hypothesis` | the prediction is empty or only whitespace | `hypothesis has no prediction — not falsifiable, not a hypothesis` |
| `hypothesis` | any cycle has status `open` | `resolve the open cycle (confirm/refute) before opening another` |
| `probe` | no cycle is open (CLI check, runs first) | `no open cycle — run "hypothesis" first` |
| `probe` | `--kind` is not one of `instrumentation`, `isolated_test`, `trace_read`, `dap` | `probe must collect evidence, not modify source-under-repair` |
| `verdict` | no cycle is open (CLI check) | `no open cycle` |
| `verdict` | the cycle has no observation, or its `observation_sha256` is empty or null | `verdict without a captured observation — narration, not evidence` |
| `verdict` | `captured` is not a string, is blank, or its SHA-256 differs from `observation_sha256` | `captured observation hash integrity mismatch or empty observation` |
| `fix` | no cycle has status `confirmed` with `prediction_held === true` and `result === "CONFIRMED"` | `no confirmed hypothesis — collect evidence before fixing` |
| `fix` | `fix.authorized_by_cycle` is not the id of one of those confirmed cycles | `fix not tied to a confirmed cycle` |
| `fix` | the authorizing cycle fails the two observation checks above (missing, blank or hash mismatch) | the same two messages as `verdict` |

The order within `hypothesis` is: budget validity, budget exhausted, blank prediction, open cycle. When several apply, you see the first.

Not guarded: `status`, `list`, `check`, `install`, `open`.

The CLI also checks arguments before the guard runs. For example an empty `--predict ""` produces the usage message (`hypothesis requires <session-id> "<hypothesis>" --predict "<prediction>"`), not the guard message above; `--predict "   "` reaches the guard.

## Escalation

`escalateIfNeeded` returns `{ escalate: true, reason }` for the two budget conditions. `verdict` and `status` print it. The only enforcement is that `hypothesis` is refused. You can still `probe` (if a cycle is open), `verdict`, `fix` and `check` in an exhausted session. The intended response is to stop and hand the session, with all its cycles, to a stronger model or a person, or to start a fresh session for a separately authorized investigation.

## What the guard does not do

- **It does not stop file edits.** You can change source before any verdict. The guard only controls whether `fix` will record one.
- **It does not judge the verdict.** CONFIRMED can be recorded on an observation that contradicts the prediction. The guard checks that the observation exists and matches its hash.
- **It does not authenticate evidence.** An observation passed with `--observation` is whatever text you typed. The hash detects later edits to the file; it cannot show the text was real. Hash and verdict are rechecked again at `fix`, so editing `captured` after the verdict is caught.
- **It does not sandbox probes.** Debugger expressions (`--evaluate`), repro commands and instrumentation are trusted operator input. A `dap` evaluation can run arbitrary code in the debugged program, and the repro command runs through `sh -c`.
- **It does not validate the diff hash** passed to `fix`.
- **It does not inspect what the `dap` probe actually observed.** See [known limitations](known-limitations.md) (issue #7).
