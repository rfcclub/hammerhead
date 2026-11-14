# Concepts

## The loop

```
symptom -> [ hypothesis -> prediction -> probe -> observation -> verdict ]* -> fix -> check
```

| Term | Meaning in this tool |
|---|---|
| Session | One JSON file describing one symptom and everything tried against it. Created by `open`. |
| Symptom | A description plus a repro command (`--repro`) that shows the problem. |
| Cycle | One hypothesis with its prediction, probe, observation and verdict. Cycles are numbered `c-1`, `c-2`, ... |
| Hypothesis | Your claim about the cause. The tool stores the text; it does not evaluate it. |
| Prediction | What you expect to observe if the hypothesis is right. Required and must not be blank. |
| Probe | How you gathered evidence. One of four kinds, listed below. |
| Observation | The captured evidence text and its SHA-256. A cycle holds at most one. |
| Verdict | CONFIRMED or REFUTED, chosen by you. |
| Fix | A record that a fix was applied, tied to the confirmed cycle that authorized it. |
| Escalation | A cycle budget (default 4 refuted cycles). When it is used up, no new cycle can be opened in that session. |

Only one cycle can be open at a time. A cycle is open from `hypothesis` until `verdict`.

## Probe kinds

| Kind | Who collects the evidence | How the observation is recorded |
|---|---|---|
| `dap` | The CLI runs the external `dap` debugger CLI: sets a breakpoint, runs to it, evaluates one expression | The CLI builds the text and hashes it. See [DAP probes](dap-probes.md). |
| `instrumentation` | You: add a log line, run the repro, read the output | You pass the text with `--observation`; the CLI hashes it. |
| `isolated_test` | You: write and run a small test or script | Same as above. |
| `trace_read` | You: read an existing trace or log | Same as above. |

Any other `--kind` is rejected. A probe is supposed to gather evidence only. The tool cannot check that: it validates the kind name and the observation hash, nothing about what your probe did to your files.

## What the tool enforces

- A verdict needs a stored, non-empty observation whose hash still matches its text.
- A fix needs at least one confirmed cycle, and the fix must be tied to the cycle that authorized it.
- Only one open cycle at a time, and no new cycle after the refuted-cycle budget is used up.
- A prediction must not be blank.

The complete list is in [guard rules](guard-rules.md).

## What the tool does not enforce

- Editing source code. The CLI never sees your edits. "No fix before CONFIRMED" means "the CLI will not record a fix before CONFIRMED".
- Whether the observation supports the prediction.
- Whether the observation is genuine.

If you work with an AI agent, the skill file tells the agent to follow the discipline; it is an instruction, not a sandbox.

## Two ways to use it

**Local workflow (the normal path).** You, or any script, run the CLI in your project. Sessions are plain files under `.hammerhead-debug/`. No GitHub, no agent, no network. The [README quick start](../README.md#quick-start-about-5-minutes-no-debugger-needed) is this workflow. Everything in the [CLI reference](cli.md) works this way.

**Agent and Orca workflow (optional).** An AI agent runs the same CLI because you installed the [skill](agent-skill.md), or an Orca loop stops on a failing task and prints a hammerhead-debug command to run. This is covered in [Orca handoff](orca-handoff.md) and [tool family](family.md). hammerhead-debug itself never talks to GitHub or starts agents; any GitHub, review-bot or unattended-agent steps belong to Orca and its companions.

## Where sessions live

By default in `.hammerhead-debug/` under the current directory, one file per session named `<session-id>.json`. Every command accepts `--dir <path>` to use another directory. Add `.hammerhead-debug/` to `.gitignore` unless you want the sessions committed.
