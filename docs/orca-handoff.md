# Orca handoff

This page describes how an [Orca](https://www.npmjs.com/package/@gotako/orca) bounded loop leads to a hammerhead-debug session and back. It is the optional agent workflow. hammerhead-debug works without Orca, and Orca's handoff is a printed command that a person or agent runs; Orca never runs hammerhead-debug.

Everything below was read from the code of `@gotako/orca` 1.7.0-beta.0 (the package contents, not a live run of the full loop) and from running hammerhead-debug. Orca can change; check its documentation. The one step that was not run is marked.

## Terms

- **Change directory**: the directory of one Orca change, for example `orca/changes/<name>` or `openspec/changes/<name>`. It holds `plan.json` and, under `.harness/`, loop state.
- **Plan task**: one entry in `plan.json` with an id, a test and the files it may change.

## Step 1: the loop stops

`orca loop <change>` runs the plan's tasks one at a time. For each task it records a failing run of the task's test (RED), asks the configured driver for an edit, and reruns the test. If the attempt limit is reached while the test still fails, the loop stops with the reason `Attempt budget exhausted`. The limit is the smaller of `--max-attempts` and the plan's `escalation.max_improvement_iterations`.

The loop writes the stop to `<change-dir>/.harness/loop-handoff.json` as `{ "status": "stopped", "reason": ..., "next_command": ... }`, and also in `loop-state.json` and `loop-events.jsonl`. For an exhausted attempt budget `next_command` is:

```
hammerhead-debug open --symptom '<task-id>: test still failing' --repro 'orca verify '\''<change>'\''' --dir '<absolute path of the change directory>'
```

(shell-quoted; the repro evaluates to `orca verify '<change>'`). Other stop reasons, such as an exhausted token budget, do not produce a hammerhead command.

## Step 2: you run the debugging loop

1. Run the printed command from the project root. The session file lands in the change directory as `<change-dir>/dbg-XXXXXXXX.json` because of `--dir`. The command passes no `--plan` or `--task`, so `serves_task` is `null`. That does not affect Orca, which does not read `serves_task`.
2. Use the normal loop with the same `--dir`:

   ```bash
   hammerhead-debug hypothesis <id> "<hypothesis>" --predict "<prediction>" --dir <change-dir>
   hammerhead-debug probe <id> --kind <kind> ... --dir <change-dir>
   hammerhead-debug verdict <id> --result CONFIRMED --reason "..." --dir <change-dir>
   # edit the code, then
   hammerhead-debug fix <id> --diff-sha256 "<sha256 of your diff>" --dir <change-dir>
   hammerhead-debug check <id> --dir <change-dir>
   ```

3. `check` runs `orca verify <change>` in your current directory, so run it from the project root. It reports `{"resolved": true}` only if that command exits 0. As the repro is Orca's own check, a pass here is not Orca's acceptance; Orca re-runs the task's test itself in the next step.

Keep `--dir` pointing at the change directory. Orca looks for the session only there.

## Step 3: tell Orca the task is done

```bash
orca plan-json complete <change> <task-id> \
  --debug-session <session-id> --debug-cycle <cycle-id> --root-cause "<one sentence>" [--escalated]
```

`--debug-cycle` is the id of the CONFIRMED cycle (`c-1`, ...). `--root-cause` is required with `--debug-session`. Orca then:

1. requires the task to be in progress with a recorded genuine RED run of the unchanged task test, and re-runs the test; it must pass (GREEN). This is Orca's own check and is independent of `hammerhead-debug check`;
2. reads the session from the change directory and requires: the session file exists, the cycle exists with status `confirmed` and `verdict.prediction_held === true`, and `fix.authorized_by_cycle` equals that cycle id;
3. stores `debug_ref` on the task: the session id, the cycle, your root cause, and `cost: { refuted_cycles, escalated }` (the number of refuted cycles in the session, and whether you passed `--escalated`).

Orca does not re-hash the observation, does not check that `fix.applied` is true, and does not check `verdict.result`. Those checks are hammerhead-debug's, done when you run `verdict` and `fix`.

## Resuming the loop

Not verified. Orca's loop tracks progress in its own state file. Whether `orca loop` resumes cleanly after you complete the task by hand with `plan-json complete` was not tested here. Follow Orca's own documentation for resume.

## If the session is not found

`orca plan-json complete` fails with `debug_ref points to a session that does not exist: <id>` when the session is not in the change directory. The usual cause is a session opened without `--dir`, which lands in `./.hammerhead-debug`. Copy the file into the change directory, or re-run the handoff command.

## Without Orca

You do not need any of this to use hammerhead-debug. Use any directory with `--dir` (or the default) and ignore `plan-json`.

## Other notes

- `list --dir <change-dir>` also lists `plan` and other `*.json` files in that directory (see [CLI reference](cli.md#list)).
- Pilotfish, Orca's companion model driver, also prints a `hammerhead-debug open` command when its retries run out. See [tool family](family.md).
