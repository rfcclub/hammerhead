# Troubleshooting

Errors print to stderr as `Error: <message>` and the exit code is 1. Messages below are the exact texts from the code. Guard messages are also in [guard rules](guard-rules.md).

## Command not found

**`hammerhead-debug: command not found`** after `npm install` in a project. A project install does not put the command on your `PATH`. Use `npx hammerhead-debug ...`, `./node_modules/.bin/hammerhead-debug ...`, or `npm install -g @gotako/hammerhead-debug`.

## Usage errors

**`open requires --symptom "<description>" --repro "<cmd>"`**, or a similar "requires" message. A required flag is missing, empty, or its value starts with `--` (which is read as the next flag). `hammerhead-debug open --help` also ends here; there is no per-command help.

**The usage text prints and exit code is 1.** The command name is unknown. Run `hammerhead-debug help` for the list.

## Session problems

**`debug-loop session not found at <path>`.** The session id is wrong, or you are using a different `--dir` than the one you opened it with. Run `hammerhead-debug list --dir <dir>` to see the ids in a directory. Relative `--dir` values are relative to the current directory.

**`resolve the open cycle (confirm/refute) before opening another`.** The last hypothesis has no verdict. Record one with `verdict`.

**`no open cycle — run "hypothesis" first`.** `probe` and `verdict` act on the open cycle; a cycle closes when its verdict is recorded. Open a new one.

**`cycle budget exhausted`.** The session has as many refuted cycles as `escalation.max_refuted_cycles` (4 by default). Stop and hand the session to a stronger model or a person, or open a new session for a separately authorized investigation. Raising the number in the file works mechanically but removes the point of the budget.

**`invalid cycle budget`.** `max_refuted_cycles` in the file is not a positive integer. It was edited by hand.

**`hypothesis has no prediction — not falsifiable, not a hypothesis`.** The `--predict` text is blank.

## Verdict and fix refusals

**`verdict without a captured observation — narration, not evidence`.** The open cycle has no probe yet. Run `probe` first.

**`captured observation hash integrity mismatch or empty observation`.** The `captured` text in the session file was changed after it was recorded, or it is blank. If the cycle is still open, run `probe` again to record a fresh observation. If the cycle is closed, start a new session for it.

**`no confirmed hypothesis — collect evidence before fixing`.** No cycle has a CONFIRMED verdict yet. This is the gate working.

**`fix not tied to a confirmed cycle`.** `fix.authorized_by_cycle` does not name a confirmed cycle. It is set by `verdict --result CONFIRMED`; it points at `null` or a refuted cycle if the file was edited.

**`probe must collect evidence, not modify source-under-repair`.** `--kind` is not one of `dap`, `instrumentation`, `isolated_test`, `trace_read`.

## DAP probe fails

**`dap debug failed: dap exited with code 1`.** The most common cause is that `dap` could not be started: it is not on `PATH` and `--dap-bin` was not given, or the path is wrong. Test with `dap --help`. This message also appears when `dap` runs and exits nonzero without an `Error:` line.

**`dap debug failed: starting debug adapter: starting debugpy: process exited without reporting listen address`.** `dap` started, but the Python interpreter it used has no `debugpy`. Install it into that interpreter (`pip install debugpy`). Reproduced here with a Python that lacked debugpy.

**The probe takes a long time and then fails.** Each `dap` call has a 60 second timeout. A program that waits for input, or a slow start, can hit it.

**`dap probe recorded no observation: program terminated (exit 0) before hitting a breakpoint`.** The breakpoint's line was never reached (wrong line, wrong branch, wrong script). The probe exits 1 and records nothing. Fix the breakpoint and probe again.

**`dap probe recorded no observation: stopped at <file>:<line>, which differs from the requested breakpoint(s) ...`.** The debugger moved the breakpoint (for example the requested line does not exist or has no code). Request a line that has code, then probe again. Nothing was recorded.

**`dap probe recorded no observation: stopped at <file>:<line> but eval "<expr>" failed`.** The program stopped at the right place but the expression could not be evaluated there (for example an undefined name). Nothing was recorded; use an expression that is valid at that line.

**The observation says `... — eval "<expr>" failed` or stopped at a different line than `--break`.** Same issue. The probe recorded it anyway; do not confirm on it.

If you cannot get `dap` working, use `--kind instrumentation`, `isolated_test` or `trace_read` with `--observation`.

## `check` reports `resolved: false`

The repro command did not exit 0. `check` runs it with `sh -c` in the current directory, and discards its output. Run the repro yourself from the same directory (`hammerhead-debug status <id>` shows it as `symptom.repro_cmd`) to see why. A repro that depends on the directory you opened the session from fails when `check` is run from another one.

## Orca

**`debug_ref points to a session that does not exist: <id>`** from `orca plan-json complete`. The session is not in the Orca change directory. See [Orca handoff](orca-handoff.md#if-the-session-is-not-found).

**The handoff command from Orca does not run.** The shell cannot find `hammerhead-debug`. Install it (see above). Also check the quoting if the symptom or change name contains a quote.

## `list` shows names that are not sessions

`list` prints every `*.json` file in the directory. In an Orca change directory that includes `plan`. Only names that start with `dbg-` are sessions created by the CLI.

## Skill

**The agent does not use the skill.** `install` only copies a file. Check that `~/.claude/skills/hammerhead-debug/SKILL.md` (or the `.codex` equivalent, or the project-level one) exists and that your agent loads skills from there. After upgrading the package, run `install` again to refresh the copy.

## Still stuck

Open an issue at https://github.com/rfcclub/hammerhead/issues with the command you ran, the full error line, your Node.js version, and the session file (remove anything private).
