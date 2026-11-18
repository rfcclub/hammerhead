# Known limitations

These are stated plainly so you can decide how much to trust a session. They describe the beta as of version 0.5.0-beta.5 plus the fix for issue #2.

## Fixed: the `dap` probe recorded failed or misplaced stops as evidence

https://github.com/rfcclub/hammerhead/issues/2

Earlier betas recorded a stop whose evaluation failed, a stop at a line other than the one requested (for example a breakpoint the debugger moved), and a program that exited before any stop, all as observations with exit code 0. `verdict --result CONFIRMED` and `fix` were then accepted on them. Now `probe --kind dap` fails (exit 1, nothing recorded) in each of those cases, so `verdict` is refused until a real observation exists. See [DAP probes](dap-probes.md#what-gets-recorded).

What is still true: the probe checks that the stop is at a requested breakpoint and that the evaluation returned a value. It does not check that the value supports your prediction. That is still your judgment.

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
