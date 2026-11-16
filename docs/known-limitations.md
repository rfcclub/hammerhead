# Known limitations

These are stated plainly so you can decide how much to trust a session. They describe the beta as of version 0.5.0-beta.4.

## Open issue

### Issue #7: the `dap` probe can record a failed or misplaced stop as evidence

https://github.com/rfcclub/hammerhead/issues/2

`probe --kind dap` can record an observation whose text has no observed value, and `verdict --result CONFIRMED` is then accepted on it, after which `fix` is authorized. The issue was reported for a breakpoint that the debugger moved to another line, with the evaluation failing there.

Reproduced here with `dap` v0.4.2 and debugpy 1.8.22. Each of these exits 0, and `verdict --result CONFIRMED` followed by `fix` was accepted on each one:

| Situation | Recorded text |
|---|---|
| Breakpoint requested on a nonexistent line 99; the debugger stopped at line 2 | `stopped(breakpoint) at <path>/reloc.py:2: s = 80` (a value, but at a line you did not ask for) |
| Evaluation of an undefined name at a real breakpoint | `stopped(breakpoint) at <path>/reloc.py:1 — eval "nosuchvar" failed` |
| The breakpoint is in a function that never runs | `terminated(exit 0): program exited before hitting a breakpoint` |

The issue text describes an unhit breakpoint as already failing the probe. In this version it does not: it is recorded as an observation and the probe exits 0.

What to do until it is fixed: read the `captured` text printed by `probe` before you record CONFIRMED. If it contains `failed` or `terminated`, or the file and line are not what you asked for, do not confirm. An agent running the skill has no such check.

## Design limits

- **The gate records, it does not prevent.** Nothing stops source edits before CONFIRMED. The CLI refuses to record a fix without a confirmed cycle; that is all. See [guard rules](guard-rules.md).
- **CONFIRMED is a human or agent judgment.** The tool does not compare the observation with the prediction.
- **Hashes detect edits, not forgery.** `observation_sha256` is recomputed at `verdict` and `fix`. Anyone who can edit the session file can change the text and the hash together. For `instrumentation`, `isolated_test` and `trace_read`, the text is whatever was passed on the command line.
- **Probes are not sandboxed.** `--evaluate` expressions, `--repro` commands and your instrumentation are trusted input. `check` runs the repro through `sh -c` with no timeout.
- **`check` is only the repro's exit code.** It cannot certify that your fix is correct or that a test suite passes. It reports `resolved: false` with exit code 0, so scripts must read the JSON.
- **One observation per cycle.** A second `probe` silently replaces the first.
- **The budget can be edited away.** `max_refuted_cycles` lives in the session file and has no CLI flag. Exhaustion only blocks `hypothesis`.
- **`fix --diff-sha256` is not verified.** Any string is stored. `fix.applied` is a record, not a check.
- **`symptom.repro_sha256` and `escalation.complexity_tripwire`** exist in the format and are never written or read.
- **No schema validation on read.** Session files are trusted. Session ids are used as file names without validation; use ids printed by `open`.
- **`bound_repo_sha`** is the HEAD of the repository containing the current directory (a parent repository if you are in a subdirectory), and is never checked later.

## CLI limits

- The CLI `dap` probe takes one breakpoint, without conditions, and cannot attach, use a PID, choose a backend, stop on entry or pass program arguments. The library can do most of these (see [DAP probes](dap-probes.md)).
- A flag value that starts with `--` cannot be passed (`--repro "--x"`). Empty values count as missing. Unknown flags are ignored silently. `--agent` without a value installs both agents.
- There is no per-command help, and the built-in usage text omits `--dir` on most commands, `--dap-bin` and `--action`.
- `list` shows every `*.json` file in the directory, whether or not it is a session.
- When `dap` is missing, the message is `dap debug failed: dap exited with code 1`, which does not say why.

## Platform and environment

- Node.js 22 or newer. CI runs Node 22 and 24; the quick start was run on Node 26.5.
- DAP was exercised only on macOS (arm64) with the Python/debugpy backend. Go (dlv), Node (js-debug) and C/C++/Rust (lldb-dap) backends, attach and PID modes, and Windows were not tested here.
- The library is ESM only.

## Orca integration

- The Orca handoff was verified by reading Orca 1.7.0-beta.0's code, not by running a full loop. Resuming `orca loop` after a manual `plan-json complete` was not tested. See [Orca handoff](orca-handoff.md).
- Orca checks that the confirmed cycle exists and authorized the fix. It does not re-verify the observation hash.
